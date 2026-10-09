/**
 * 開発用の馬ビューア（npm run dev → /horse.html）。本番ビルドには含まれない。
 * 歩法ごとの馬と、乗り手を乗せた馬を並べて表示する。
 *   ?t=秒     時間を止めて表示（スクリーンショット用）
 *   ?yaw=度   向き（0 = 正面、90 = 左側面）
 *   ?slot=番号 1 頭だけ大きく表示（0 始まり）
 */
import * as THREE from 'three';
import { HorseModel, type Coat } from './mount/HorseModel.ts';
import { horseGallop, horseIdle, horseJump, horseTrot, horseWalk, riderPose } from './mount/horsePoses.ts';
import { CharacterModel, HIP_HEIGHT } from './player/character/CharacterModel.ts';
import type { Pose } from './player/character/poses.ts';

const params = new URLSearchParams(location.search);
const frozen = params.has('t') ? Number(params.get('t')) : null;
const yaw = (Number(params.get('yaw') ?? 70) * Math.PI) / 180;
const only = params.has('slot') ? Number(params.get('slot')) : null;

/** 周期 (s) あたりの位相の進み: 速さ / 歩幅 */
const slots: { name: string; coat: Coat; pose: (t: number) => Pose; rider?: boolean }[] = [
  { name: '待機', coat: 'bay', pose: (t) => horseIdle(t) },
  { name: '草を食む', coat: 'grey', pose: (t) => horseIdle(t, 1) },
  { name: '常歩', coat: 'chestnut', pose: (t) => horseWalk(t * 0.9) },
  { name: '速歩', coat: 'black', pose: (t) => horseTrot(t * 1.5) },
  { name: '襲歩', coat: 'dun', pose: (t) => horseGallop(t * 2.2) },
  { name: '跳躍', coat: 'bay', pose: (t) => horseJump((t * 0.8) % 1) },
  { name: '乗馬（常歩）', coat: 'grey', pose: (t) => horseWalk(t * 0.9), rider: true },
  { name: '乗馬（襲歩）', coat: 'chestnut', pose: (t) => horseGallop(t * 2.2), rider: true },
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
sun.position.set(6, 10, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 10, bottom: -6 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fb48a }));
ground.receiveShadow = true;
scene.add(ground);

const shown = slots.map((slot, i) => ({ slot, i })).filter(({ i }) => only === null || i === only);
const cols = only === null ? 4 : 1;
const models = shown.map(({ slot }, k) => {
  const horse = new HorseModel(slot.coat);
  const col = k % cols;
  const row = Math.floor(k / cols);
  horse.root.position.set((col - (cols - 1) / 2) * 3.6, 0, -row * 4.2);
  horse.root.rotation.y = yaw;
  scene.add(horse.root);
  let rider: CharacterModel | null = null;
  if (slot.rider) {
    rider = new CharacterModel();
    scene.add(rider.root);
  }
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = slot.name;
  document.body.appendChild(label);
  return { horse, rider, label, slot };
});

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);
if (only === null) {
  camera.position.set(0, 7, 20);
  camera.lookAt(0, 0.8, -2);
} else {
  camera.position.set(0, 2.2, 8);
  camera.lookAt(0, 1.2, 0);
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
  for (const { horse, rider, label, slot } of models) {
    const pose = slot.pose(t);
    horse.apply(pose);
    horse.root.updateMatrixWorld(true);
    if (rider) {
      const s = horse.saddle.getWorldPosition(new THREE.Vector3());
      rider.root.position.set(s.x, s.y - HIP_HEIGHT + 0.07, s.z);
      rider.root.rotation.y = yaw;
      const gallop = slot.name.includes('襲歩') ? 1 : 0;
      const rp = riderPose(t, pose.bodyY ?? 0, gallop, 0);
      rp.rootPitch = pose.bodyPitch ?? 0;
      rider.apply(rp);
    }
    v.set(horse.root.position.x, -0.3, horse.root.position.z + 1).project(camera);
    label.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    label.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
  }
  renderer.render(scene, camera);
});
