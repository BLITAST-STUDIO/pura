import { mixRgb, rgbCss } from "./palette";
import type { RenderFrame } from "./sim";

const MAX = 64;

const VS = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FS = `
precision highp float;
uniform vec2 u_res;
uniform vec4 u_posr[${MAX}];
uniform vec4 u_col[${MAX}];
uniform int u_n;
uniform vec2 u_light;

void main() {
  vec2 p = gl_FragCoord.xy;
  float field = 0.0;
  vec3 col = vec3(0.0);
  vec2 nearest = vec2(0.0);
  float nearestD = 1e9;
  float glow = 0.0;

  for (int i = 0; i < ${MAX}; i++) {
    vec2 c = u_posr[i].xy;
    float r = u_posr[i].z;
    if (r >= 0.4) {
      vec2 d = p - c;
      float dist2 = dot(d, d);
      float inf = r * r;
      float contrib = inf / (dist2 + 18.0);
      field += contrib;
      col += u_col[i].rgb * contrib;
      glow += inf / (dist2 + inf * 6.0);
      float dist = sqrt(dist2);
      if (dist < nearestD) {
        nearestD = dist;
        nearest = c;
      }
    }
  }

  col /= max(field, 0.0001);

  vec3 bg = vec3(0.027, 0.031, 0.047);
  vec2 uv = p / u_res;
  float vig = smoothstep(1.15, 0.25, length(uv - 0.5));
  bg *= 0.55 + 0.45 * vig;

  float interior = smoothstep(0.92, 1.18, field);
  float rim = smoothstep(0.82, 1.0, field) * (1.0 - smoothstep(1.15, 1.7, field));
  float halo = smoothstep(0.18, 0.7, glow) * (1.0 - interior) * 0.45;

  vec2 fromC = p - nearest;
  vec2 n2 = normalize(fromC + vec2(0.0001));
  float fres = pow(abs(dot(n2, vec2(0.0, 1.0))), 1.4);
  vec3 lightDir = normalize(vec3(u_light, 0.85));
  vec3 N = normalize(vec3(n2 * 0.55, 0.84));
  float spec = pow(max(0.0, dot(N, lightDir)), 42.0) * interior;
  float hemi = 0.55 + 0.45 * N.y;

  vec3 body = col * (0.42 + 0.58 * hemi);
  body += vec3(1.0) * spec * 0.85;
  body += col * rim * (1.25 + fres * 0.2);
  body += vec3(0.85, 0.93, 1.0) * rim * 0.25;

  float alpha = clamp(interior + rim * 0.9 + halo, 0.0, 1.0);
  vec3 outc = mix(bg, body, interior);
  outc += col * halo;
  outc += vec3(spec);

  gl_FragColor = vec4(outc, 1.0);
  gl_FragColor.a = 1.0;
  gl_FragColor.rgb = mix(bg, outc, clamp(alpha + 0.15 * interior, 0.0, 1.0));
}
`;

export class PuraRenderer {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private loc: {
    posr: WebGLUniformLocation | null;
    col: WebGLUniformLocation | null;
    n: WebGLUniformLocation | null;
    res: WebGLUniformLocation | null;
    light: WebGLUniformLocation | null;
  } | null = null;
  private posr = new Float32Array(MAX * 4);
  private col = new Float32Array(MAX * 4);
  fallback = true;
  private buf: WebGLBuffer | null = null;

  constructor(private canvas: HTMLCanvasElement) {}

  warmGl() {
    if (this.gl) return;
    const gl = this.canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    });
    if (!gl) return;
    this.gl = gl;
    const vs = this.compile(gl.VERTEX_SHADER, VS);
    const fs = this.compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "a_pos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    this.program = prog;
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    this.loc = {
      posr: gl.getUniformLocation(prog, "u_posr"),
      col: gl.getUniformLocation(prog, "u_col"),
      n: gl.getUniformLocation(prog, "u_n"),
      res: gl.getUniformLocation(prog, "u_res"),
      light: gl.getUniformLocation(prog, "u_light"),
    };
    this.fallback = false;
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl;
    if (!gl) return null;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  draw(frame: RenderFrame, overlay: CanvasRenderingContext2D) {
    if (this.fallback || !this.gl || !this.program || !this.loc) {
      this.draw2d(frame, overlay);
      return;
    }
    const gl = this.gl;
    const dpr = frame.w > 0 ? this.canvas.width / frame.w : 1;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    this.posr.fill(0);
    this.col.fill(0);
    const n = Math.min(frame.drops.length, MAX);
    for (let i = 0; i < n; i++) {
      const d = frame.drops[i]!;
      const o = i * 4;
      this.posr[o] = (d.x + frame.shake.x) * dpr;
      this.posr[o + 1] = this.canvas.height - (d.y + frame.shake.y) * dpr;
      this.posr[o + 2] = d.renderR * dpr;
      const rgb = mixRgb(d.pigment);
      const flash = d.freshness;
      this.col[o] = rgb[0] + flash * 0.25;
      this.col[o + 1] = rgb[1] + flash * 0.25;
      this.col[o + 2] = rgb[2] + flash * 0.22;
    }
    gl.uniform4fv(this.loc.posr, this.posr);
    gl.uniform4fv(this.loc.col, this.col);
    gl.uniform1i(this.loc.n, n);
    gl.uniform2f(this.loc.res, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.loc.light, -0.4, 0.72);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.paintJuice(frame, overlay, true);
  }

  private draw2d(frame: RenderFrame, ctx: CanvasRenderingContext2D) {
    const { canvas } = this;
    const dpr = canvas.width / Math.max(1, frame.w);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, frame.w, frame.h);
    const g = ctx.createRadialGradient(
      frame.w * 0.5,
      frame.h * 0.45,
      40,
      frame.w * 0.5,
      frame.h * 0.5,
      Math.max(frame.w, frame.h) * 0.7,
    );
    g.addColorStop(0, "rgba(16,18,28,1)");
    g.addColorStop(1, "rgba(7,8,12,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, frame.w, frame.h);

    for (const d of frame.drops) {
      const x = d.x + frame.shake.x;
      const y = d.y + frame.shake.y;
      const rgb = mixRgb(d.pigment);
      const rad = ctx.createRadialGradient(
        x - d.renderR * 0.32,
        y - d.renderR * 0.38,
        d.renderR * 0.05,
        x,
        y,
        d.renderR,
      );
      rad.addColorStop(0, rgbCss([1, 1, 1], 0.85));
      rad.addColorStop(0.18, rgbCss(rgb, 0.95));
      rad.addColorStop(0.72, rgbCss(rgb, 0.8));
      rad.addColorStop(1, rgbCss([rgb[0] * 0.2, rgb[1] * 0.22, rgb[2] * 0.28], 0.0));
      ctx.fillStyle = rad;
      ctx.beginPath();
      ctx.arc(x, y, d.renderR, 0, Math.PI * 2);
      ctx.fill();
    }
    this.paintJuice(frame, ctx, false);
  }

  private paintJuice(frame: RenderFrame, ctx: CanvasRenderingContext2D, clear: boolean) {
    const dpr = this.canvas.width / Math.max(1, frame.w);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (clear) ctx.clearRect(0, 0, frame.w, frame.h);

    for (const p of frame.particles) {
      ctx.fillStyle = rgbCss(p.rgb, Math.max(0, p.life) * 0.7);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.6 + p.life * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }

    const grabbed = frame.drops.find((d) => d.id === frame.grabbedId);
    if (grabbed && frame.pointer) {
      ctx.strokeStyle = "rgba(236,238,242,0.22)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.moveTo(grabbed.x, grabbed.y);
      ctx.lineTo(frame.pointer.x, frame.pointer.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(frame.pointer.x, frame.pointer.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(236,238,242,0.35)";
      ctx.stroke();
    }

    if (grabbed) {
      ctx.beginPath();
      ctx.arc(grabbed.x, grabbed.y, grabbed.renderR + 5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(236,238,242,0.18)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  dispose() {
    const gl = this.gl;
    if (gl && this.program) gl.deleteProgram(this.program);
  }
}
