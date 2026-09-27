import { describe, expect, it } from 'vitest';
import { generateSurfaceTextures, LAYER_COUNT, TEX_SIZE } from '../src/world/textures.ts';

describe('テクスチャ生成', () => {
  const data = generateSurfaceTextures();

  it('全層ぶんのデータがある', () => {
    expect(data.length).toBe(TEX_SIZE * TEX_SIZE * 4 * LAYER_COUNT);
  });

  // 板や瓦の段の境目（本来の模様の切れ目）は 128px ごとにもあるので、端の差を 127|128 の差と比べる
  it('継ぎ目なく繰り返せる（端どうしの差が、内部の 127|128 の差と同程度）', () => {
    const px = (layer: number, x: number, y: number) => {
      const i = (layer * TEX_SIZE * TEX_SIZE + y * TEX_SIZE + x) * 4;
      return data[i] + data[i + 1] + data[i + 2];
    };
    for (let layer = 0; layer < LAYER_COUNT; layer++) {
      let seam = 0;
      let inner = 0;
      for (let k = 0; k < TEX_SIZE; k++) {
        seam += Math.abs(px(layer, TEX_SIZE - 1, k) - px(layer, 0, k)) + Math.abs(px(layer, k, TEX_SIZE - 1) - px(layer, k, 0));
        inner += Math.abs(px(layer, 127, k) - px(layer, 128, k)) + Math.abs(px(layer, k, 127) - px(layer, k, 128));
      }
      expect(seam).toBeLessThan(inner * 2 + TEX_SIZE * 6);
    }
  });
});
