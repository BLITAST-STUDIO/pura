import { LOOK_LABELS, LOOKS, storeLook, type Look } from './look';
import './look.css';

/** A select for the visual direction proposals, placed in each screen's settings. */
export function LookPicker({ look, onChange }: { look: Look; onChange: (look: Look) => void }) {
  return <label><span>見た目（試作）</span><select value={look} onChange={e => { const next = e.target.value as Look; storeLook(next); onChange(next); }}>
    {LOOKS.map(l => <option key={l} value={l}>{LOOK_LABELS[l]}</option>)}
  </select></label>;
}
