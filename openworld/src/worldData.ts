/** ブラウザ用: world/ の JSON をバンドルに取り込み、検証・合成する */
import worldJson from '../world/world.json';
import { composeWorld, type ComposedWorld } from './worldgen/compose.ts';
import { parseWorldData } from './worldgen/schema.ts';

const regionModules = import.meta.glob('../world/regions/*.json', { eager: true, import: 'default' });

export function loadWorld(): ComposedWorld {
  const regions: Record<string, unknown> = {};
  for (const [path, json] of Object.entries(regionModules)) {
    regions[path.replace(/^.*\//, '').replace(/\.json$/, '')] = json;
  }
  const { world, regions: defs } = parseWorldData(worldJson, regions);
  return composeWorld(world, defs);
}
