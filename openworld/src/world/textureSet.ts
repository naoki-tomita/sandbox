import * as THREE from 'three';
import { generateMacroTexture, generateSurfaceTextures, generateWaterNormals, LAYER_COUNT, TEX_SIZE } from './textures.ts';

export interface TextureData {
  layers: Uint8Array;
  macro: Uint8Array;
  water: Uint8Array;
}

/** Worker でテクスチャを生成する。Worker が使えなければメインスレッドで作る */
export function generateTextureData(): Promise<TextureData> {
  return new Promise((resolve) => {
    const fallback = () =>
      resolve({ layers: generateSurfaceTextures(), macro: generateMacroTexture(), water: generateWaterNormals() });
    try {
      const worker = new Worker(new URL('./textureWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<TextureData>) => {
        resolve(e.data);
        worker.terminate();
      };
      worker.onerror = () => {
        worker.terminate();
        fallback();
      };
    } catch {
      fallback();
    }
  });
}

/** GPU テクスチャ一式 */
export class TextureSet {
  readonly layers: THREE.DataArrayTexture;
  readonly macro: THREE.DataTexture;
  readonly waterNormal: THREE.DataTexture;

  constructor(data: TextureData, anisotropy: number) {
    this.layers = new THREE.DataArrayTexture(data.layers, TEX_SIZE, TEX_SIZE, LAYER_COUNT);
    this.layers.colorSpace = THREE.SRGBColorSpace;
    this.macro = new THREE.DataTexture(data.macro, TEX_SIZE, TEX_SIZE);
    this.waterNormal = new THREE.DataTexture(data.water, TEX_SIZE, TEX_SIZE);
    for (const t of [this.layers, this.macro, this.waterNormal]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = anisotropy;
      t.needsUpdate = true;
    }
  }
}
