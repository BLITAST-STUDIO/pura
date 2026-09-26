/**
 * Best-effort touch feedback.
 * - Android browsers: the Vibration API with short, graded pulses.
 * - iPhone Safari has no Vibration API. iOS 18+ plays its system selection
 *   tick when a `<input type="checkbox" switch>` is toggled through its label.
 *   That tick is fixed in strength and may only fire inside a user gesture;
 *   it is used as a single pulse and is unverified on real devices here.
 */
export type HapticMode = 'vibrate' | 'ios-switch' | 'none';
export type Haptics = {
  readonly mode: HapticMode;
  setEnabled(enabled: boolean): void;
  pulse(pattern: number | number[]): void;
  dispose(): void;
};

const MIN_INTERVAL_MS = 45;

export function detectHapticMode(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { vibrate?: unknown } | undefined): HapticMode {
  if (!nav) return 'none';
  // Desktop Chrome exposes vibrate() but has no motor; require a touch screen.
  const touch = (nav.maxTouchPoints ?? 0) > 0;
  if (typeof nav.vibrate === 'function') return touch ? 'vibrate' : 'none';
  const ua = nav.userAgent ?? '';
  const iOS = /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
  return iOS ? 'ios-switch' : 'none';
}

export function createHaptics(): Haptics {
  const mode = typeof navigator === 'undefined' ? 'none' : detectHapticMode(navigator);
  let enabled = true;
  let last = -Infinity;
  let label: HTMLLabelElement | null = null;

  function switchLabel(): HTMLLabelElement | null {
    if (label || typeof document === 'undefined' || !document.body) return label;
    label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    return label;
  }

  return {
    mode,
    setEnabled(next) { enabled = next; },
    pulse(pattern) {
      if (!enabled || mode === 'none') return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - last < MIN_INTERVAL_MS) return;
      last = now;
      try {
        if (mode === 'vibrate') navigator.vibrate(pattern);
        else {
          const previous = document.activeElement;
          const target = switchLabel();
          target?.click();
          // Keep keyboard shortcuts working: the hidden switch must not keep focus.
          if (target && document.activeElement === target.firstElementChild && previous instanceof HTMLElement) {
            previous.focus({ preventScroll: true });
          }
        }
      } catch {
        // Feedback is optional; a blocked call must never interrupt play.
      }
    },
    dispose() {
      label?.remove();
      label = null;
    },
  };
}
