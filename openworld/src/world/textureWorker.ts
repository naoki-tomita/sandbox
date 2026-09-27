/** テクスチャ生成を別スレッドで行う（起動時にワールド合成と並行させるため） */
import { generateMacroTexture, generateSurfaceTextures, generateWaterNormals } from './textures.ts';

const layers = generateSurfaceTextures();
const macro = generateMacroTexture();
const water = generateWaterNormals();
(self as unknown as Worker).postMessage({ layers, macro, water }, [layers.buffer, macro.buffer, water.buffer]);
