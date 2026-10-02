import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { SensoryFeedback, SensoryPreferences } from './sensory/feedback';
import './sound-settings.css';

export type SoundProps = { sensory: SensoryPreferences; change: (next: Partial<SensoryPreferences>) => void; feedback: SensoryFeedback };
const percent = (volume: number) => Math.round(volume * 100);

/**
 * The volume sliders (2026-09-27, RYO: with the on/off switches in the menu,
 * add volume bars). Sound effects and music separately; the effects slider
 * plays a soft touch as it moves so the level can be heard.
 */
export function VolumeSliders({ sensory, change, feedback, className = '' }: SoundProps & { className?: string }) {
  return <>
    <label className={`volume-row ${className}`}><span>効果音の音量</span>
      <input type="range" min={0} max={100} step={1} value={percent(sensory.soundVolume)} disabled={!sensory.sound}
        aria-valuetext={`${percent(sensory.soundVolume)}%`}
        onChange={e => { change({ soundVolume: Number(e.target.value) / 100 }); feedback.previewSound(); }}/>
      <output>{percent(sensory.soundVolume)}</output></label>
    <label className={`volume-row ${className}`}><span>音楽の音量</span>
      <input type="range" min={0} max={100} step={1} value={percent(sensory.musicVolume)} disabled={!sensory.sound || !sensory.music}
        aria-valuetext={`${percent(sensory.musicVolume)}%`}
        onChange={e => change({ musicVolume: Number(e.target.value) / 100 })}/>
      <output>{percent(sensory.musicVolume)}</output></label>
  </>;
}

/**
 * 音 and 音楽 with their sliders, for the settings of each play screen. On
 * phones the same block sits at the top of the menu, under the ways to play
 * (and the copy in the settings is hidden), so it is one tap away.
 */
export function SoundSettings(props: SoundProps) {
  const { sensory, change } = props;
  return <div className="sound-settings">
    <label><span>音</span><input type="checkbox" checked={sensory.sound} onChange={e => change({ sound: e.target.checked })}/></label>
    <label><span>音楽</span><input type="checkbox" checked={sensory.music} disabled={!sensory.sound} onChange={e => change({ music: e.target.checked })}/></label>
    <VolumeSliders {...props}/>
  </div>;
}

const HOLD_MS = 450;  // a touch held this long opens the volume
const LEAVE_MS = 450; // the pointer may wander a little between the icon and the bar

/**
 * The speaker icon, with the volume bars at hand (2026-10-02, RYO: have the
 * volume bar appear at the on/off icon). A tap still switches sound on or off.
 * The bars appear when the mouse rests on the icon, when a touch is held on it
 * (the tap that would follow is ignored), or when the keyboard reaches it; they
 * go away when the pointer leaves, on a tap elsewhere, or on Escape.
 */
export function SoundButton({ sensory, change, feedback, size = 16, className, side = 'up' }: SoundProps & { size?: number; className?: string; side?: 'up' | 'down' }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const hold = useRef(0), leave = useRef(0), held = useRef(false);
  const clear = () => { clearTimeout(hold.current); clearTimeout(leave.current); };
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key); };
  }, [open]);
  useEffect(() => clear, []);
  return <span ref={root} className={`sound-button is-${side}${open ? ' is-open' : ''}`}
    onPointerEnter={e => { if (e.pointerType === 'mouse') { clear(); setOpen(true); } }}
    onPointerLeave={e => { if (e.pointerType === 'mouse') { clear(); leave.current = window.setTimeout(() => setOpen(false), LEAVE_MS); } }}>
    <button className={className} aria-label={sensory.sound ? '音を消す' : '音を出す'} aria-pressed={sensory.sound} aria-expanded={open} aria-haspopup="true"
      onPointerDown={e => { if (e.pointerType !== 'mouse') { held.current = false; clear(); hold.current = window.setTimeout(() => { held.current = true; setOpen(true); }, HOLD_MS); } }}
      onPointerUp={() => clearTimeout(hold.current)} onPointerCancel={() => clearTimeout(hold.current)}
      onContextMenu={e => { if (held.current) e.preventDefault(); }}
      onFocus={e => { if (e.currentTarget.matches(':focus-visible')) setOpen(true); }}
      onClick={() => { if (held.current) { held.current = false; return; } change({ sound: !sensory.sound }); }}>
      {sensory.sound ? <Volume2 size={size}/> : <VolumeX size={size}/>}</button>
    {open && <div className="sound-popover" role="group" aria-label="音量">
      <VolumeSliders sensory={sensory} change={change} feedback={feedback}/>
      {!sensory.sound && <p>音は消えています。アイコンで、出せます。</p>}
    </div>}
  </span>;
}
