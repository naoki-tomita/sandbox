/** 地表の種類。地形メッシュの色・プレビュー・scatter の配置条件に使う。 */
export const SURFACES = ['grass', 'forest', 'dirt', 'road', 'sand', 'rock', 'snow', 'riverbed'] as const;
export type Surface = (typeof SURFACES)[number];

export const SURFACE_INDEX: Record<Surface, number> = Object.fromEntries(
  SURFACES.map((s, i) => [s, i]),
) as Record<Surface, number>;

/** sRGB 0-255 */
export const SURFACE_COLORS: Record<Surface, [number, number, number]> = {
  grass: [104, 150, 64],
  forest: [66, 110, 48],
  dirt: [134, 108, 74],
  road: [168, 146, 108],
  sand: [214, 198, 150],
  rock: [122, 118, 112],
  snow: [236, 240, 245],
  riverbed: [110, 104, 84],
};

/** 高さと傾斜から自動で決める地表（paint で上書きされなかった所） */
export function autoSurface(height: number, slope: number, seaLevel: number): Surface {
  if (slope > 0.9) return 'rock';
  if (height > seaLevel + 150) return slope > 0.45 ? 'rock' : 'snow';
  if (height < seaLevel + 1.5) return 'sand';
  if (slope > 0.6) return 'rock';
  if (height > seaLevel + 100) return 'rock';
  return 'grass';
}
