/** リポジトリの実際のワールドデータ（world/）が壊れていないことを確認する */
import { describe, expect, it } from 'vitest';
import { loadWorldFiles } from '../scripts/loadWorld.ts';
import { checkWorld } from '../src/worldgen/checks.ts';
import { composeWorld } from '../src/worldgen/compose.ts';

describe('world/ のデータ', () => {
  it('検証を通り、見た目の破綻の警告もない', () => {
    const { world, regions } = loadWorldFiles();
    const w = composeWorld(world, regions);
    expect(checkWorld(w)).toEqual([]);
  }, 60_000);
});
