/** Node 用: world/ ディレクトリからワールドデータを読み込む（CLI・テスト共用） */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorldData } from '../src/worldgen/schema.ts';

export const WORLD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'world');

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`${path} を JSON として読めません: ${(e as Error).message}`);
  }
}

export function loadWorldFiles(dir = WORLD_DIR) {
  const regions: Record<string, unknown> = {};
  for (const f of readdirSync(join(dir, 'regions'))) {
    if (f.endsWith('.json')) regions[basename(f, '.json')] = readJson(join(dir, 'regions', f));
  }
  return parseWorldData(readJson(join(dir, 'world.json')), regions);
}
