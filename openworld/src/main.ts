import './style.css';
import { Game } from './Game.ts';
import { initPhysics } from './physics/Physics.ts';
import { generateTextureData } from './world/textureSet.ts';
import { loadWorld } from './worldData.ts';
import { WorldDataError } from './worldgen/schema.ts';

const status = document.getElementById('loadingStatus')!;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot(): Promise<void> {
  // テクスチャは Worker で並行して作る
  const textures = generateTextureData();
  status.textContent = '物理エンジンを準備中…';
  await initPhysics();
  status.textContent = 'ワールドを生成中…';
  await nextFrame();
  const world = loadWorld();
  status.textContent = 'テクスチャを生成中…';
  const game = new Game(
    document.getElementById('game') as HTMLCanvasElement,
    world,
    await textures,
    new URLSearchParams(location.search),
  );
  game.start();
  // デバッグ・自動テスト用
  (window as unknown as { game: Game }).game = game;
}

boot().catch((e) => {
  status.textContent = e instanceof WorldDataError ? e.message : `起動に失敗しました: ${e}`;
  status.classList.add('error');
  console.error(e);
});
