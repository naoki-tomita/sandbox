/**
 * 配置できるオブジェクトの種類。見た目（world/Props.ts）とプレビュー・当たり判定の寸法はここを基準にする。
 * 寸法は scale = 1 のときの値 (m)。
 */
export const OBJECT_TYPES = [
  'pine', 'oak', 'bush', 'rock', 'boulder', 'house', 'tower', 'well', 'sign', 'campfire', 'marker',
  'lighthouse', 'pier', 'bridge', 'fence', 'ruin_wall', 'ruin_pillar', 'tent', 'barrel', 'crate', 'stable', 'horse',
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export type ColliderShape =
  | { kind: 'none' }
  | { kind: 'cylinder'; radius: number; height: number }
  /** offsetY: 箱の中心の高さ（省略時は高さの半分 = 地面に置く） */
  | { kind: 'box'; size: [number, number, number]; offsetY?: number }
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
  house: { description: '家（8x6m、切妻屋根。扉は +Z 側）', footprint: 6, collider: { kind: 'box', size: [8.4, 6.5, 6.4] }, previewColor: [190, 70, 50] },
  tower: { description: '見張り塔（高さ 14m）', footprint: 4, collider: { kind: 'cylinder', radius: 2.5, height: 14 }, previewColor: [150, 60, 150] },
  well: { description: '井戸', footprint: 2, collider: { kind: 'cylinder', radius: 1.1, height: 1 }, previewColor: [90, 90, 200] },
  sign: { description: '立て看板（props.text に文言）', footprint: 0.5, collider: { kind: 'box', size: [1.2, 1.8, 0.2] }, previewColor: [230, 200, 60] },
  campfire: { description: '焚き火', footprint: 1.5, collider: { kind: 'none' }, previewColor: [255, 140, 20] },
  marker: { description: 'イベント用の目印（ゲーム中は不可視。デバッグ時のみ表示）', footprint: 0, collider: { kind: 'none' }, previewColor: [255, 0, 255] },
  lighthouse: { description: '灯台（高さ約 20m）', footprint: 5, collider: { kind: 'cylinder', radius: 3, height: 20 }, previewColor: [245, 245, 245] },
  pier: { description: '桟橋（幅 3m・長さ 20m、+Z 方向に延びる。中心に置き、level で床の高さを指定）', footprint: 10, collider: { kind: 'box', size: [3, 0.3, 20], offsetY: -0.15 }, previewColor: [150, 110, 70] },
  bridge: { description: '木橋（幅 3.2m・長さ 16m、+Z 方向に架かる。中心に置き、level で床の高さを指定）', footprint: 8, collider: { kind: 'box', size: [3.2, 0.35, 16], offsetY: -0.18 }, previewColor: [170, 120, 70] },
  fence: { description: '木の柵（長さ 4m、X 方向）', footprint: 2, collider: { kind: 'box', size: [4, 1.2, 0.2] }, previewColor: [140, 100, 60] },
  ruin_wall: { description: '崩れた石壁（長さ 6m、X 方向）', footprint: 3, collider: { kind: 'box', size: [6, 3, 1] }, previewColor: [160, 150, 130] },
  ruin_pillar: { description: '古い石柱（高さ約 5m）', footprint: 1.2, collider: { kind: 'cylinder', radius: 0.7, height: 5 }, previewColor: [180, 170, 150] },
  tent: { description: 'テント（3x4m、入口は +Z 側）', footprint: 2.5, collider: { kind: 'box', size: [3, 2, 4] }, previewColor: [210, 190, 140] },
  barrel: { description: '樽', footprint: 0.6, collider: { kind: 'cylinder', radius: 0.45, height: 1 }, previewColor: [120, 80, 40] },
  crate: { description: '木箱（1m）', footprint: 0.8, collider: { kind: 'box', size: [1, 1, 1] }, previewColor: [150, 110, 60] },
  stable: { description: '厩舎（7x4m、正面 +Z 側が開いている。前に水桶と馬つなぎの横木）', footprint: 5, collider: { kind: 'box', size: [7.2, 3.2, 4.2] }, previewColor: [120, 75, 40] },
  horse: {
    description: '乗れる馬（E で乗り降り）。rotation の向きに立つ。props.coat で毛色: bay / chestnut / black / grey / dun',
    footprint: 1.6,
    // 当たり判定は馬自身（src/mount/Horse.ts）が持つ。動くので配置物の当たり判定には入れない
    collider: { kind: 'none' },
    previewColor: [200, 140, 60],
  },
};
