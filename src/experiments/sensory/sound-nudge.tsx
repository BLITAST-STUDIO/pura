import { useEffect, useRef, useState } from 'react';
import type { SensoryFeedback } from './feedback';
import { soundNudgeNeeded } from './sound-nudge-logic';
import './sound-nudge.css';

/**
 * iPhone Safari starts sound only from a tap, and PURA is mostly dragged, so
 * sound can stay silent until a tap happens (RYO, 2026-09-27). If the sound is
 * on, the player has touched the board, and the audio is still blocked a
 * moment later, offer one small tap. It leaves as soon as the audio runs.
 */
export function SoundNudge({ feedback, sound }: { feedback: SensoryFeedback; sound: boolean }) {
  const [show, setShow] = useState(false);
  const touched = useRef(false);
  const since = useRef<number | null>(null);
  useEffect(() => {
    const touch = () => { touched.current = true; };
    window.addEventListener('pointerup', touch, { passive: true });
    const timer = window.setInterval(() => {
      const needed = soundNudgeNeeded(feedback.status().audio, touched.current, sound);
      if (!needed) { since.current = null; setShow(false); return; }
      // Give the touch's own attempt a moment before asking for a tap.
      since.current ??= performance.now();
      setShow(performance.now() - since.current > 700);
    }, 250);
    return () => { window.removeEventListener('pointerup', touch); clearInterval(timer); };
  }, [feedback, sound]);
  if (!show) return null;
  return <button className="sound-nudge" onClick={() => feedback.unlock()}>♪ タップで音をオン</button>;
}
