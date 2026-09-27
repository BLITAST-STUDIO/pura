import type { Ghost } from './ghost-touch-logic';
import './ghost-touch.css';

export { pullGhost, type Ghost } from './ghost-touch-logic';

/**
 * The ghost fingertip that shows a move without words (the welcome, and the
 * first visit to the shot modes). Positions are in the board section's
 * pixels. `pull` also draws a faint dashed link from the drop being aimed to
 * where the finger lands, so a pull from open floor reads as aiming that drop.
 */
export function GhostTouch({ ghost }: { ghost: Ghost }) {
  const move = { left: ghost.x0, top: ghost.y0, ['--dx' as string]: `${ghost.x1 - ghost.x0}px`, ['--dy' as string]: `${ghost.y1 - ghost.y0}px` };
  return <>
    {ghost.kind === 'pull' && <svg className="ghost-link" aria-hidden="true"><line x1={ghost.dropX} y1={ghost.dropY} x2={ghost.x0} y2={ghost.y0}/></svg>}
    <span className={`ghost-touch is-${ghost.kind}`} style={move} aria-hidden="true"><i/></span>
  </>;
}
