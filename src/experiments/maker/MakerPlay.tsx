import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Circle, Hexagon, Move, Play, RotateCcw, RotateCw, Send, Trash2, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import { createFusionExperience } from '../fusion-lab/renderer';
import { stageDropHeight } from '../stages/simulation';
import { initialCaustic, initialRipple } from '../look-defaults';
import { initialLook, initialUi } from '../look';
import { SoundButton } from '../sound-settings';
import { useSensoryFeedback } from '../sensory/useSensoryFeedback';
import { SoundNudge } from '../sensory/sound-nudge';
import { ClearGlow } from '../clear-glow';
import { cloneLayout, cleanName, DROP_SIZES, STONE_SIZES, STONE_SHAPES, STARTER, TONES, geometryKey, shapeOf, turned, type StoneShapeId, movePiece, readLayout, replacePiece, selectedPiece, toneOf, MAX_DROPS, MAX_STONES, type Layout, type Selection } from './layout';
import { LayoutSimulation, MakerSimulation, MAX_SHOTS, verifiesClear, type RecordedShot } from './simulation';
import { decodeStage, readCertificate, readDraft, saveCertificate, saveDraft, sharedToken, stageUrl } from './share';
import { MakerFirst } from './MakerFirst';
import { MakerTour } from './MakerTour';
import { makerWelcomed, markMakerWelcomed } from './onboarding';
import './maker-onboarding.css';
import '../droplet-lab/droplet-lab.css';
import '../purity-scene/purity-scene.css';
import './maker.css';

type Mode = 'edit' | 'test' | 'challenge';
type Tool = 'select' | 'drop' | 'stone';
type Certificate = { key: string; proof: RecordedShot[] };
/** The renderer's floor and room tint for a board colour; white keeps the look's own. */
function toneColours(id: string | undefined) {
  const t = toneOf(id);
  return t.floor ? { floor: t.floor, background: t.background } : null;
}
function storage(): Storage | null { try { return window.localStorage; } catch { return null; } }
function initial() {
  const token = sharedToken(window.location.hash), shared = token ? decodeStage(token) : null;
  const draft = shared ? null : readDraft(storage());
  // Your own board keeps its clear across visits (the signal stays green), if it still replays.
  const own = draft ? readCertificate(storage(), draft) : null;
  return { layout: shared?.layout ?? draft ?? cloneLayout(STARTER), mode: (shared ? 'challenge' : 'edit') as Mode,
    certificate: shared ? { key: geometryKey(shared.layout), proof: shared.proof } : own && draft ? { key: geometryKey(draft), proof: own } : null, invalid: !!token && !shared };
}

export default function MakerPlay() {
  const [boot] = useState(initial);
  // The onboarding: the first time the editor opens (never for a shared stage), or again on request.
  const [onboarding, setOnboarding] = useState<'first' | 'tour' | 'off'>(() => boot.mode === 'edit' && (!makerWelcomed(storage()) || new URLSearchParams(window.location.search).get('intro') === '1') ? 'first' : 'off');
  const [layout, setLayout] = useState(boot.layout), layoutRef = useRef(layout);
  const [mode, setMode] = useState<Mode>(boot.mode);
  const [invalid, setInvalid] = useState(boot.invalid);
  const [tool, setTool] = useState<Tool>('select'), toolRef = useRef(tool); toolRef.current = tool;
  // The shape the next stone is placed with (the last one chosen).
  const [shape, setShape] = useState<StoneShapeId>('circle'), shapeRef = useRef(shape); shapeRef.current = shape;
  const [selection, setSelection] = useState<Selection | null>({ kind: 'drop', index: 0 });
  const selectionRef = useRef(selection);
  const [certificate, setCertificate] = useState<Certificate | null>(boot.certificate);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [message, setMessage] = useState(''), [saved, setSaved] = useState(true);
  const [reading, setReading] = useState({ shots: 0, remaining: layout.drops.length - 1, cleared: false, failed: false });
  const [undoCount, setUndoCount] = useState(0);
  const undo = useRef<Layout[]>([]), dragBefore = useRef<Layout | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), linkField = useRef<HTMLTextAreaElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const experience = useRef<ReturnType<typeof createFusionExperience> | null>(null);
  const simRef = useRef<LayoutSimulation | MakerSimulation | null>(null);
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();
  const [look] = useState(initialLook), [ui] = useState(initialUi);
  const certified = certificate?.key === geometryKey(layout);
  const piece = selectedPiece(layout, selection);
  const name = cleanName(layout.name);

  function select(next: Selection | null) {
    selectionRef.current = next; setSelection(next);
    if (simRef.current instanceof LayoutSimulation) simRef.current.selection = next;
  }
  function apply(next: Layout) {
    layoutRef.current = next; setLayout(next);
    if (simRef.current instanceof LayoutSimulation) simRef.current.setLayout(next);
    setSaved(saveDraft(storage(), next));
  }
  function remember(before: Layout) { undo.current.push(cloneLayout(before)); if (undo.current.length > 40) undo.current.shift(); setUndoCount(undo.current.length); }
  function change(next: Layout | null) {
    if (!next) { setMessage('壁や、ほかの雫・石から少し離してください。'); return; }
    remember(layoutRef.current); apply(next); setMessage('');
  }
  function ownBoard() {
    window.history.replaceState(null, '', '?play=maker');
    const draft = readDraft(storage()) ?? cloneLayout(STARTER), own = readCertificate(storage(), draft);
    apply(draft);
    setCertificate(own ? { key: geometryKey(draft), proof: own } : null); setInvalid(false); select({ kind: 'drop', index: 0 }); setMode('edit'); setAttempt(n => n + 1);
  }

  // Board colour: changing it (or undoing it) repaints the floor without rebuilding the board.
  useEffect(() => { experience.current?.setOptions({ tone: toneColours(layout.tone) }); }, [layout.tone]);

  useEffect(() => {
    // A second stage link can change just the fragment in an already open tab.
    const changed = () => {
      const next = initial();
      layoutRef.current = next.layout; setLayout(next.layout); setMode(next.mode);
      setCertificate(next.certificate); setInvalid(next.invalid); setShareUrl(''); setMessage('');
      undo.current = []; setUndoCount(0); select({ kind: 'drop', index: 0 }); setAttempt(n => n + 1);
    };
    window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed);
  }, []);

  useEffect(() => {
    if (invalid || onboarding === 'first') return;
    let alive = true, announced = false;
    setReady(false); setError('');
    const sim = mode === 'edit' ? new LayoutSimulation(layoutRef.current) : new MakerSimulation(layoutRef.current);
    simRef.current = sim;
    if (sim instanceof LayoutSimulation) sim.selection = selectionRef.current;
    const update = () => {
      if (!alive || !(sim instanceof MakerSimulation)) return;
      const result = sim.result;
      setReading({ shots: sim.shots, remaining: sim.remaining, cleared: !!result?.cleared, failed: !!result && !result.cleared });
      if (result?.cleared && !announced) {
        announced = true; feedback.delivered('cyan', true);
        if (mode === 'test' && verifiesClear(layoutRef.current, sim.proof)) {
          const proof = sim.proof.map(s => ({ ...s }));
          setCertificate({ key: geometryKey(layoutRef.current), proof }); saveCertificate(storage(), layoutRef.current, proof);
        }
      }
    };
    const edit = sim instanceof LayoutSimulation ? {
      slots: MAX_STONES,
      start(x: number, y: number, hit: Selection | null) {
        dragBefore.current = cloneLayout(layoutRef.current);
        if (toolRef.current === 'select' || hit) { select(hit); return !!hit; }
        const kind = toolRef.current;
        const before = layoutRef.current, next = cloneLayout(before);
        const list = kind === 'drop' ? next.drops : next.stones;
        if (list.length >= (kind === 'drop' ? MAX_DROPS : MAX_STONES)) { setMessage(kind === 'drop' ? '雫は12個まで置けます。' : `石は${MAX_STONES}個まで置けます。`); return false; }
        const spec = STONE_SHAPES.find(s => s.id === shapeRef.current)!;
        list.push({ x: Math.round(x), y: Math.round(y), r: kind === 'drop' ? 26 : 32, ...(kind === 'stone' && spec.n ? { n: spec.n, a: spec.a } : {}) });
        const valid = readLayout(next);
        if (!valid) { setMessage('空いている床に置いてください。'); return false; }
        apply(valid); select({ kind, index: list.length - 1 }); setTool('select'); setMessage(''); feedback.grab(kind === 'drop' ? 26 : 32, x, 420); return true;
      },
      move(x: number, y: number) {
        const selected = selectionRef.current;
        if (!selected) return;
        const next = movePiece(layoutRef.current, selected, x, y);
        if (next) { apply(next); setMessage(''); }
        else setMessage('ほかの雫・石から少し離してください。');
      },
      end(cancelled: boolean) {
        const before = dragBefore.current; dragBefore.current = null;
        if (!before) return;
        if (cancelled) apply(before);
        else if (geometryKey(before) !== geometryKey(layoutRef.current)) remember(before);
      },
      selection: () => sim.selectedPoint(),
    } : undefined;
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setReady(true); }, onError: e => { if (alive) setError(e); },
      }, { simulation: sim, obstacles: layoutRef.current.stones, height: stageDropHeight, feedback, onUpdate: update, edit,
        showSelected: true, aimAnywhere: !edit, aim: edit ? undefined : () => (sim as MakerSimulation).aim });
      experience.current.setOptions({ lighting: 'studio', look, tone: toneColours(layoutRef.current.tone), walls: 'rim', ripple: initialRipple(), caustic: initialCaustic(), dyeFlow: 'bloom', fit: 'screen' });
      update();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    return () => { alive = false; experience.current?.dispose(); experience.current = null; simRef.current = null; };
  }, [mode, attempt, invalid, onboarding === 'first']);
  useEffect(() => {
    if (shareUrl) dialog.current?.showModal(); else dialog.current?.close();
    experience.current?.setOptions({ paused: !!shareUrl });
  }, [shareUrl, mode, attempt]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (mode !== 'edit' || shareUrl || e.altKey || e.metaKey || e.ctrlKey || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName))) return;
      const selected = selectionRef.current;
      if (!selected) return;
      const p = selectedPiece(layoutRef.current, selected);
      if (!p) return;
      const step = e.shiftKey ? 10 : 2;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (delta) { change(movePiece(layoutRef.current, selected, p.x + delta[0], p.y + delta[1])); e.preventDefault(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [mode, shareUrl]);

  const retry = () => { setAttempt(n => n + 1); setMessage(''); };
  /** The first phase cleared: its board becomes the draft, already proven (an earlier draft stays one undo away). */
  const firstDone = (first: Layout, proof: RecordedShot[]) => {
    remember(layoutRef.current); apply(first);
    setCertificate({ key: geometryKey(first), proof }); saveCertificate(storage(), first, proof);
    select({ kind: 'drop', index: 0 }); setTool('select'); setMode('edit'); setMessage('');
    setOnboarding('tour'); setAttempt(n => n + 1);
  };
  const onboarded = () => { markMakerWelcomed(storage()); setOnboarding('off'); };
  const start = () => { setMessage(''); setMode('test'); setAttempt(n => n + 1); };
  const back = () => { setMode('edit'); setAttempt(n => n + 1); };
  const undoOne = () => { const before = undo.current.pop(); if (before) { apply(before); select({ kind: 'drop', index: 0 }); setUndoCount(undo.current.length); setMessage(''); } };
  const remove = () => {
    if (!selection) return;
    if (selection.kind === 'drop' && layout.drops.length <= 2) { setMessage('雫は2個以上残してください。'); return; }
    const next = cloneLayout(layoutRef.current); (selection.kind === 'drop' ? next.drops : next.stones).splice(selection.index, 1);
    change(readLayout(next)); select({ kind: 'drop', index: 0 });
  };
  const createLink = () => {
    if (!certified || !certificate) return;
    const url = stageUrl(window.location.href, layoutRef.current, certificate.proof);
    if (url) { setMessage(''); setShareUrl(url); } else setMessage('クリアをもう一度確認してください。');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setMessage('リンクをコピーしました。'); }
    catch { linkField.current?.select(); setMessage('リンクを選択しました。コピーして送れます。'); }
  };
  const send = async () => {
    try { await navigator.share({ title: `PURA ${name}`, text: `「${name}」を${certificate!.proof.length}打で。いける？`, url: shareUrl }); }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setMessage('リンクをコピーして送れます。'); }
  };

  if (onboarding === 'first') return <div className="droplet-lab maker-play is-onboarding" data-ui={ui} data-look={look}><MakerFirst feedback={feedback} look={look} onDone={firstDone} onSkip={onboarded}/></div>;
  return <div className="droplet-lab maker-play" data-ui={ui} data-look={look} data-mode={mode}>
    <div className="maker-shell">
      <header className="maker-header"><a href="?play=hitofude" className="maker-back" aria-label="ひとふでに戻る"><ArrowLeft size={18}/></a><div><small>PURA · ひとふで</small>{mode === 'edit'
        ? <input aria-label="台の名前" maxLength={32} value={layout.name} onChange={e => { const next = { ...layoutRef.current, name: e.target.value }; apply(next); }}/>
        : <h1>{name}</h1>}</div><SoundButton sensory={sensory} change={changeSensory} feedback={feedback} size={18} className="maker-sound" side="down"/></header>
      {invalid ? <section className="maker-invalid" role="alert"><h1>この台を開けませんでした</h1><p>リンクが途中で切れているか、この版でクリアを確認できない台です。</p><button onClick={ownBoard}>自分の台をつくる</button><a href="?play=hitofude">ひとふでで遊ぶ</a></section> : <>
        <div className="maker-workspace">
          <section className="dl-stage maker-stage" aria-label={mode === 'edit' ? '台を編集する' : `ひとふで ${name}`} aria-busy={!ready}>
            <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label={mode === 'edit' ? '雫や石を選んで動かす。矢印キーでも動かせます。' : '雫に触れて、引いて、離す。色をひとつにまとめる。'}/>
            <div className="maker-stage-label">{mode === 'edit' ? '台をつくる' : mode === 'test' ? 'テストプレイ' : `作者記録 ${certificate?.proof.length ?? 0}打`}</div>
            {mode === 'edit' && <div className="maker-status" data-tour="status" data-state={certified ? 'clear' : 'pending'} role="status"><i aria-hidden="true"/>{certified ? 'クリア済み' : '未クリア'}</div>}
            {!ready && !error && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
            {error && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button onClick={retry}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
            <SoundNudge feedback={feedback} sound={sensory.sound}/>
            <ClearGlow show={mode !== 'edit' && reading.cleared}/>
            {mode !== 'edit' && (reading.cleared || reading.failed) && <div className="maker-result" role="status"><strong>{reading.cleared ? (reading.shots === 1 ? 'ひとふで' : 'ひとつに') : 'もう一度、ねらおう'}</strong><span>{reading.shots}打{mode === 'test' && reading.cleared ? ' · 共有できます' : mode === 'challenge' && reading.cleared ? reading.shots < (certificate?.proof.length ?? 0) ? ' · 作者記録をこえた' : reading.shots === certificate?.proof.length ? ' · 作者と同じ' : ' · クリア' : ''}</span></div>}
            {mode !== 'edit' && <div className="maker-reading" aria-live="polite">{reading.cleared ? 'ひとつに' : `あと ${reading.remaining}つ`}<span>{reading.shots}/{MAX_SHOTS}打</span></div>}
          </section>
          <aside className="maker-panel">
            {mode === 'edit' ? <>
              <div className="maker-tools" data-tour="tools" role="group" aria-label="置くものを選ぶ">{([{ id: 'select', label: '選ぶ', Icon: Move }, { id: 'drop', label: '雫', Icon: Circle }, { id: 'stone', label: '石', Icon: Hexagon }] as const).map(({ id, label, Icon }) => <button key={id} aria-pressed={tool === id} onClick={() => { setTool(id); setMessage(''); }}><Icon size={17}/>{label}</button>)}<button aria-label="一手戻す" disabled={!undoCount} onClick={undoOne}><Undo2 size={18}/></button></div>
              <p className="maker-instruction">{tool === 'drop' ? '空いている床に、雫を置く。' : tool === 'stone' ? '空いている床に、石を置く。' : '雫や石を、好きな場所へ。'}</p>
              {(tool === 'stone' || selection?.kind === 'stone') && <div className="maker-shapes"><span>石の形</span><div role="group" aria-label="石の形">{STONE_SHAPES.map(spec => <button key={spec.id} aria-label={`石の形 ${spec.label}`} aria-pressed={tool !== 'stone' && selection?.kind === 'stone' && piece ? shapeOf(piece) === spec.id : shape === spec.id} onClick={() => { setShape(spec.id); /* placing: only the next stone's shape; otherwise the selected stone changes */ if (tool !== 'stone' && selection?.kind === 'stone' && piece) change(replacePiece(layoutRef.current, selection, { n: spec.n, a: spec.a })); }}><span className={`maker-shape maker-shape-${spec.id}`} aria-hidden="true"/>{spec.label}</button>)}<button aria-label="石を回す" disabled={!(selection?.kind === 'stone' && piece?.n)} onClick={() => selection && piece && change(replacePiece(layoutRef.current, selection, { a: turned(piece).a }))}><RotateCw size={16}/></button></div></div>}
              <div className="maker-inspector" data-tour="inspector"><span>{piece ? selection?.kind === 'drop' ? '雫の大きさ' : '石の大きさ' : '選んで、動かす'}</span><div role="group" aria-label="大きさ">{(selection?.kind === 'stone' ? STONE_SIZES : DROP_SIZES).map((r, i) => <button key={r} disabled={!piece} aria-pressed={piece?.r === r} aria-label={`${selection?.kind === 'stone' ? '石' : '雫'}を${['小', '中', '大'][i]}に`} onClick={() => selection && change(replacePiece(layoutRef.current, selection, { r }))}>{['小', '中', '大'][i]}</button>)}<button aria-label="選んだものを消す" disabled={!piece} onClick={remove}><Trash2 size={16}/></button></div></div>
              <div className="maker-tones" data-tour="tones"><span>盤の色</span><div role="group" aria-label="盤の色">{TONES.map(t => <button key={t.id} className="maker-tone" style={{ background: t.swatch }} aria-label={`盤の色 ${t.label}`} title={t.label} aria-pressed={toneOf(layout.tone).id === t.id} onClick={() => { if (toneOf(layout.tone).id !== t.id) change(readLayout({ ...layout, tone: t.id })); }}/>)}</div></div>
              <details className="maker-position"><summary>位置を数値で指定</summary>{piece && selection && <div>{(['x', 'y'] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<input type="number" aria-label={`${axis.toUpperCase()}の位置`} value={piece[axis]} onChange={e => change(movePiece(layoutRef.current, selection, axis === 'x' ? Number(e.target.value) : piece.x, axis === 'y' ? Number(e.target.value) : piece.y))}/></label>)}</div>}</details>
              <div className="maker-info"><span>雫 {layout.drops.length}/{MAX_DROPS} · 石 {layout.stones.length}/{MAX_STONES}</span><span>{certified ? `${certificate!.proof.length}打で確認済み` : saved ? '台はこの端末に自動保存' : 'この端末には保存できません'}</span></div>
            </> : <p className="maker-play-hint">引いて、離す。止まっている雫なら、いつでも次の一打。</p>}
            <div className="maker-actions">{mode === 'edit' ? <button className="maker-primary" data-tour="play" onClick={start} disabled={!ready || !!error}><Play size={17}/>遊んで確かめる</button> : <><button onClick={mode === 'test' ? back : ownBoard}><ArrowLeft size={16}/>{mode === 'test' ? '編集に戻る' : '自分の台をつくる'}</button><button onClick={retry}><RotateCcw size={16}/>やり直す</button></>}
              <button className={mode === 'edit' ? '' : 'maker-primary'} data-tour="share" disabled={!certified || !!error} onClick={createLink}><Send size={16}/>共有リンク</button></div>
            <p className="maker-note">{mode === 'edit' ? certified ? '友だちは、リンクからそのまま遊べます。' : '自分でクリアできたら、友だちに渡せます。' : mode === 'test' ? '編集に戻ると、最初の配置が残っています。' : '何度でも挑戦できます。'}</p>
            {mode === 'edit' && onboarding === 'off' && <button className="maker-replay-intro" onClick={() => setOnboarding('first')}>はじめての説明を、もう一度</button>}
          </aside>
        </div>
        {message && !shareUrl && <p className="maker-message" role="status">{message}</p>}
      </>}
    </div>
    {onboarding === 'tour' && <MakerTour onDone={onboarded}/>}
    <dialog ref={dialog} className="maker-dialog" onCancel={() => setShareUrl('')} onClose={() => setShareUrl('')}><button className="maker-dialog-close" aria-label="閉じる" onClick={() => setShareUrl('')}><X size={18}/></button><small>PURA · ひとふで</small><h2>この台、いける？</h2><p>「{name}」を{certificate?.proof.length}打で。<br/>友だちは、リンクからそのまま挑戦できます。</p><textarea ref={linkField} aria-label="共有リンク" value={shareUrl} readOnly rows={3}/><div><button onClick={copy}>リンクをコピー</button>{typeof navigator.share === 'function' && <button onClick={send}>共有する</button>}</div><p role="status">{message}</p></dialog>
  </div>;
}
