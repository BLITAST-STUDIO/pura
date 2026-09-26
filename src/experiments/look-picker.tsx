import { LOOK_LABELS, LOOKS, storeLook, storeUi, UI_LABELS, type Look, type Ui } from './look';
import './look.css';

/** Two selects for the design proposals: the page (menus, text) and the board. */
export function LookPicker({ look, onChange, ui, onUi }: { look: Look; onChange: (look: Look) => void; ui: Ui; onUi: (ui: Ui) => void }) {
  return <>
    <label><span>画面（試作）</span><select value={ui} onChange={e => { const next = e.target.value as Ui; storeUi(next); onUi(next); }}>
      {(['dark', 'light'] as const).map(u => <option key={u} value={u}>{UI_LABELS[u]}</option>)}
    </select></label>
    <label><span>盤面（試作）</span><select value={look} onChange={e => { const next = e.target.value as Look; storeLook(next); onChange(next); }}>
      {LOOKS.map(l => <option key={l} value={l}>{LOOK_LABELS[l]}</option>)}
    </select></label>
  </>;
}
