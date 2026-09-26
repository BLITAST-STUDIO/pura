export type SceneHue = 'cyan' | 'rose';
export type Chapter = {
  id: number; name: string; title: string; description: string; hint: string;
  width: number; height: number; purity: number;
  goals: { hue: SceneHue; x: number; y: number; r: number }[];
  drops: { x: number; y: number; r: number; hue: SceneHue }[];
  obstacles: { x: number; y: number; r: number }[];
};
export const CHAPTERS: Chapter[] = [
  { id: 1, name: '澄んだ道', title: '澄んだまま、ひとつに。',
    description: '三つのシアンをひとつにして、左上の輪へ。',
    hint: '三つのシアンを集めます。ローズのそばは、少し遠回り。',
    width: 550, height: 650, purity: .9,
    goals: [{ hue: 'cyan', x: 155, y: 132, r: 103 }],
    drops: [{ x: 130, y: 510, r: 44, hue: 'cyan' }, { x: 125, y: 312, r: 44, hue: 'cyan' },
      { x: 410, y: 515, r: 44, hue: 'cyan' }, { x: 298, y: 377, r: 55, hue: 'rose' }, { x: 392, y: 221, r: 50, hue: 'rose' }], obstacles: [],
  },
  { id: 2, name: '小さなうちに', title: '通ってから、ひとつに。',
    description: '小さな雫は、石のあいだを通れます。',
    hint: '先に通すか、先に集めるか。大きくなったら、石の外側にも道があります。',
    width: 700, height: 700, purity: .9,
    goals: [{ hue: 'cyan', x: 350, y: 140, r: 90 }],
    drops: [{ x: 260, y: 540, r: 36, hue: 'cyan' }, { x: 350, y: 540, r: 36, hue: 'cyan' }, { x: 440, y: 540, r: 36, hue: 'cyan' }],
    obstacles: [{ x: 260, y: 350, r: 43 }, { x: 440, y: 350, r: 43 }],
  },
  { id: 3, name: 'ふたつの行き先', title: 'それぞれの、澄んだ場所へ。',
    description: 'シアンは左の輪へ。ローズは右の輪へ。',
    hint: '今度は、どちらの色も届けます。先に道を空ける色を考えてみましょう。',
    width: 650, height: 650, purity: .9,
    goals: [{ hue: 'cyan', x: 160, y: 135, r: 91 }, { hue: 'rose', x: 490, y: 135, r: 91 }],
    drops: [{ x: 155, y: 510, r: 42, hue: 'cyan' }, { x: 445, y: 375, r: 42, hue: 'cyan' },
      { x: 485, y: 515, r: 42, hue: 'rose' }, { x: 225, y: 340, r: 42, hue: 'rose' }], obstacles: [],
  },
];
export function getChapter(id: number): Chapter { return CHAPTERS.find(c => c.id === id) ?? CHAPTERS[0]; }
export const HUE_NAMES: Record<SceneHue, string> = { cyan: 'シアン', rose: 'ローズ' };
