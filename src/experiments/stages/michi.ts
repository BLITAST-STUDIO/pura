import { getLevel, type LevelDef } from '../../game/levels';
import type { BoardDrop } from '../boards';

/**
 * 道 (the path), chapter 3 「混ぜて、分ける」: the first hand-placed boards of
 * the reorganised course (DESIGN_DIRECTION.md). Same rules as the stages —
 * different colours bounce, a held press mixes, a quick double tap separates.
 * These boards start with cloudy drops, and the numbers are set so the goal
 * cannot be met without separating them:
 *
 * 3-1 にごり: pure cyan alone is 2028 of the 2454 needed (80% of 3068), and
 * taking in the cloudy drop's cyan drags purity to 85% (< 90%). Separating its
 * rose (560) both purifies the cyan and supplies the rose goal (1152 + 560 of
 * 1370 needed).
 * 3-2 ほどく: every colour is mostly locked inside two cloudy drops; each goal
 * (75%) needs its pure drop plus what two separations release.
 */
export type MichiStage = LevelDef & {
  layout: BoardDrop[];
  /** A quiet line offered only if the player has not separated anything by then. */
  discovery?: { after: number; text: string };
};

const designed = { perColor: 0, rMin: 0, rMax: 0 } as const;

export const MICHI_STAGES: MichiStage[] = [
  {
    id: 31, code: '3-1', name: 'にごり', hint: '濁った雫がひとつ。澄ませるには。', colors: ['cyan', 'rose'], targetFrac: 0.8, purity: 0.9, ...designed,
    layout: [
      { x: 210, y: 300, r: 40, hue: 'cyan', mix: { rose: 0.35 } },
      { x: 100, y: 150, r: 26, hue: 'cyan' },
      { x: 330, y: 140, r: 26, hue: 'cyan' },
      { x: 110, y: 460, r: 26, hue: 'cyan' },
      { x: 320, y: 460, r: 24, hue: 'rose' },
      { x: 320, y: 300, r: 24, hue: 'rose' },
    ],
    discovery: { after: 25, text: '濁った雫を、すばやく2回たたくと……' },
  },
  {
    id: 32, code: '3-2', name: 'ほどく', hint: '絡んだ色を、ほどいて集める。', colors: ['cyan', 'rose', 'amber'], targetFrac: 0.75, purity: 0.9, ...designed,
    layout: [
      { x: 120, y: 170, r: 38, hue: 'cyan', mix: { rose: 0.4 } },
      { x: 300, y: 170, r: 38, hue: 'amber', mix: { cyan: 0.4 } },
      { x: 210, y: 390, r: 34, hue: 'rose', mix: { amber: 0.4 } },
      { x: 330, y: 470, r: 22, hue: 'cyan' },
      { x: 90, y: 470, r: 22, hue: 'rose' },
      { x: 210, y: 262, r: 22, hue: 'amber' },
    ],
    discovery: { after: 40, text: 'ひとつずつ、2回たたいてほどく。' },
  },
];

export const MICHI_IDS = MICHI_STAGES.map(s => s.id);

/** A legacy stage or a designed 道 board. */
export function stageLevel(id: number): LevelDef | MichiStage | undefined {
  return MICHI_STAGES.find(s => s.id === id) ?? getLevel(id);
}

export function isMichi(def: LevelDef): def is MichiStage { return 'layout' in def; }
