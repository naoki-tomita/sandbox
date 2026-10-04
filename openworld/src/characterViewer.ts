/**
 * 開発用キャラクタービューア（npm run dev → /character.html）。本番ビルドには含まれない。
 * 各アニメーション状態のキャラクターを横に並べて表示する。
 *   ?t=秒     時間を止めて表示（スクリーンショット用）
 *   ?yaw=度   キャラクターの向き（0 = 正面、90 = 左側面、180 = 背面）
 *   ?slot=番号 1 体だけ大きく表示（0 始まり）
 */
import * as THREE from 'three';
import { CharacterModel } from './player/character/CharacterModel.ts';
import { blend, fall, idle, jumpUp, landing, run, swimStroke, treadWater, walk, type Pose } from './player/character/poses.ts';

const params = new URLSearchParams(location.search);
const frozen = params.has('t') ? Number(params.get('t')) : null;
const yaw = (Number(params.get('yaw') ?? 25) * Math.PI) / 180;
const only = params.has('slot') ? Number(params.get('slot')) : null;

const slots: { name: string; pose: (t: number) => Pose }[] = [
  { name: '待機', pose: (t) => idle(t) },
  { name: '歩き', pose: (t) => walk(t * 2 * Math.PI * 0.9) },
  { name: '走り', pose: (t) => run(t * 2 * Math.PI * 1.4) },
  { name: 'ジャンプ', pose: () => jumpUp() },
  { name: '落下', pose: (t) => fall(t) },
  { name: '着地', pose: (t) => blend([[idle(t), 1], [landing(0.8), 1]]) },
  { name: '平泳ぎ', pose: (t) => swimStroke(t * 3) },
  { name: '立ち泳ぎ', pose: (t) => treadWater(t) },
];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfdbe6);
scene.add(new THREE.HemisphereLight(0xdfeaff, 0x7a6a50, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(4, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 6, bottom: -2 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fb48a }));
ground.receiveShadow = true;
scene.add(ground);

// 4 列 x 2 行に並べる（slot 指定時は 1 体だけ）
const shown = slots.map((slot, i) => ({ slot, i })).filter(({ i }) => only === null || i === only);
const cols = only === null ? 4 : 1;
const models = shown.map(({ slot }, k) => {
  const m = new CharacterModel();
  const col = k % cols;
  const row = Math.floor(k / cols);
  m.root.position.set((col - (cols - 1) / 2) * 1.7, 0, -row * 2.6);
  m.root.rotation.y = yaw;
  // 泳ぎは水面の高さ（地面より上）に浮かせる
  if (slot.name.includes('泳ぎ')) m.root.position.y += 0.35;
  scene.add(m.root);
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = slot.name;
  document.body.appendChild(label);
  return { m, label, slot };
});

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
if (only === null) {
  camera.position.set(0, 4.2, 9.5);
  camera.lookAt(0, 0.4, -1.3);
} else {
  camera.position.set(0, 1.3, 4.2);
  camera.lookAt(0, 0.95, 0);
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const start = performance.now();
const v = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const t = frozen ?? (performance.now() - start) / 1000;
  for (const { m, label, slot } of models) {
    m.apply(slot.pose(t));
    v.set(m.root.position.x, -0.15, m.root.position.z).project(camera);
    label.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    label.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
  }
  renderer.render(scene, camera);
});
