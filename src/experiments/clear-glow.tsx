/**
 * The moment after a clear: a ring of light widens across the board and a
 * soft bloom fades, and the result appears a beat later (stages.css). It
 * lets the finished drop be looked at before anything asks for a tap.
 */
export function ClearGlow({ show }: { show: boolean }) {
  return show ? <div className="clear-glow" aria-hidden="true"><i/><i/></div> : null;
}
