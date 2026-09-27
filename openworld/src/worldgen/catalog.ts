/**
 * 配置できるオブジェクトの種類。見た目（world/Props.ts）とプレビュー・当たり判定の寸法はここを基準にする。
 * 寸法は scale = 1 のときの値 (m)。
 */
export const OBJECT_TYPES = [
  'pine', 'oak', 'bush', 'rock', 'boulder', 'house', 'tower', 'well', 'sign', 'campfire', 'marker',
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export type ColliderShape =
  | { kind: 'none' }
  | { kind: 'cylinder'; radius: number; height: number }
  | { kind: 'box'; size: [number, number, number] }
  | { kind: 'ball'; radius: number };

export interface ObjectInfo {
  description: string;
  /** 他の配置物（scatter）を寄せ付けない半径 */
  footprint: number;
  collider: ColliderShape;
  /** プレビュー画像での色 */
  previewColor: [number, number, number];
}

export const CATALOG: Record<ObjectType, ObjectInfo> = {
  pine: { description: '針葉樹（高さ約 10m）', footprint: 1.5, collider: { kind: 'cylinder', radius: 0.35, height: 10 }, previewColor: [24, 70, 40] },
  oak: { description: '広葉樹（高さ約 8m）', footprint: 2, collider: { kind: 'cylinder', radius: 0.45, height: 8 }, previewColor: [40, 95, 35] },
  bush: { description: '低木（当たり判定なし）', footprint: 0.8, collider: { kind: 'none' }, previewColor: [70, 120, 50] },
  rock: { description: '小岩（約 1.2m）', footprint: 1, collider: { kind: 'ball', radius: 0.7 }, previewColor: [120, 118, 112] },
  boulder: { description: '大岩（約 4m）', footprint: 3, collider: { kind: 'ball', radius: 2.2 }, previewColor: [95, 93, 90] },
  house: { description: '家（8x6m、切妻屋根）', footprint: 6, collider: { kind: 'box', size: [8, 6.5, 6] }, previewColor: [190, 70, 50] },
  tower: { description: '見張り塔（高さ 14m）', footprint: 4, collider: { kind: 'cylinder', radius: 2.5, height: 14 }, previewColor: [150, 60, 150] },
  well: { description: '井戸', footprint: 2, collider: { kind: 'cylinder', radius: 1.1, height: 1 }, previewColor: [90, 90, 200] },
  sign: { description: '立て看板（props.text に文言）', footprint: 0.5, collider: { kind: 'box', size: [1.2, 1.8, 0.2] }, previewColor: [230, 200, 60] },
  campfire: { description: '焚き火', footprint: 1.5, collider: { kind: 'none' }, previewColor: [255, 140, 20] },
  marker: { description: 'イベント用の目印（ゲーム中は不可視。デバッグ時のみ表示）', footprint: 0, collider: { kind: 'none' }, previewColor: [255, 0, 255] },
};
