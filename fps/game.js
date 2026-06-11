'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAYER_HEIGHT   = 1.65;
const PLAYER_SPEED    = 7.5;
const PLAYER_RADIUS   = 0.35;
const PLAYER_HP_MAX   = 100;
const AMMO_MAG        = 30;
const AMMO_RESERVE    = 90;
const RELOAD_MS       = 1800;
const SHOOT_DELAY_MS  = 120;   // semi-auto rate limit

const BULLET_SPEED    = 60;
const BULLET_LIFE     = 0.12;

const ENEMY_SPEED_BASE   = 2.8;
const ENEMY_HP           = 100;
const ENEMY_DAMAGE       = 8;
const ENEMY_SHOOT_CD_MIN = 1500;
const ENEMY_SHOOT_CD_MAX = 3000;
const ENEMY_ALERT_R      = 18;
const ENEMY_SHOOT_R      = 14;
const ENEMY_BULLET_SPEED = 18;
const ENEMY_BULLET_LIFE  = 3;
const ENEMY_INACCURACY   = 0.14;

const CELL = 4;
const WALL_H = 3.2;

// ─── Maze (16×16, 1=wall, 0=open) ─────────────────────────────────────────────
const MAZE = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
  [1,0,1,0,1,0,1,1,1,1,0,1,1,0,1,1],
  [1,0,1,0,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,0,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,0,0,0,0,1,0,1],
  [1,1,1,0,1,1,1,1,0,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,0,1,0,0,0,0,0,1],
  [1,1,0,1,1,1,1,0,1,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,0,1,1,0,1],
  [1,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,1,1,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];
const ROWS = MAZE.length;
const COLS = MAZE[0].length;

// ─── State ────────────────────────────────────────────────────────────────────
let scene, camera, renderer;
let clock;

let gameState = 'menu';   // menu | playing | paused | gameover
let keys = {};
let isLocked = false;

let yaw = 0, pitch = 0;

let player = {};
let enemies = [];
let pBullets = [];
let eBullets = [];
let wallBoxes = [];
let openCells = [];

let wave = 1;
let enemiesLeft = 0;
let lastShootTime = 0;

let gunGroup;
let recoilT = 0;

// ─── Init ──────────────────────────────────────────────────────────────────────
function init() {
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 30, 70);

  // Camera
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 80);

  // Renderer
  const canvas = document.getElementById('gameCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  scene.add(new THREE.HemisphereLight(0xaabbff, 0x554433, 0.6));

  // Ceiling light grid — brighter, warmer, wider reach
  [
    [2,2],[4,4],[6,2],[2,6],[8,8],
    [10,6],[6,10],[10,10],[12,4],[4,12],
    [14,2],[2,14],[14,14],[12,12],[8,4],[4,8],
  ].forEach(([c, r]) => {
    const pl = new THREE.PointLight(0xfff0cc, 2.5, 22);
    pl.position.set(c * CELL, WALL_H - 0.2, r * CELL);
    scene.add(pl);
  });

  clock = new THREE.Clock();

  buildLevel();
  buildGun();
  scene.add(camera);

  // Events
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && gameState === 'playing') startReload();
    if (e.code === 'Escape') togglePause();
  });
  document.addEventListener('keyup', e => keys[e.code] = false);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (!isLocked && gameState === 'playing') { document.body.requestPointerLock(); return; }
    if (gameState === 'playing') tryShoot();
  });
  document.addEventListener('pointerlockchange', () => {
    isLocked = document.pointerLockElement === document.body;
    if (!isLocked && gameState === 'playing') togglePause();
  });

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('restartBtn').addEventListener('click', () => {
    document.getElementById('gameOver').classList.add('hidden');
    startGame();
  });
  document.getElementById('resumeBtn').addEventListener('click', resumeGame);
}

// ─── Level Builder ─────────────────────────────────────────────────────────────
function buildLevel() {
  wallBoxes = [];
  openCells = [];

  const floorGeo = new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL);
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x555566 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(COLS * CELL / 2, 0, ROWS * CELL / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceilGeo = new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL);
  const ceilMat = new THREE.MeshLambertMaterial({ color: 0x3a3a4a });
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(COLS * CELL / 2, WALL_H, ROWS * CELL / 2);
  scene.add(ceil);

  const wallColors = [0x9a7050, 0x8a6040, 0xaa8060, 0x7a5535];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = c * CELL + CELL / 2;
      const cz = r * CELL + CELL / 2;
      if (MAZE[r][c] === 1) {
        const geo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
        const mat = new THREE.MeshLambertMaterial({
          color: wallColors[(r * COLS + c) % wallColors.length]
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx, WALL_H / 2, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        wallBoxes.push({ minX: c * CELL, maxX: (c+1) * CELL, minZ: r * CELL, maxZ: (r+1) * CELL });
      } else {
        openCells.push(new THREE.Vector2(cx, cz));
      }
    }
  }
}

// ─── Gun ──────────────────────────────────────────────────────────────────────
function buildGun() {
  gunGroup = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x444455 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.42), dark);
  gunGroup.add(body);

  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.36), metal);
  barrel.position.set(0, 0.04, -0.36);
  gunGroup.add(barrel);

  const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.14), dark);
  scope.position.set(0, 0.1, -0.04);
  gunGroup.add(scope);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.09), dark);
  grip.position.set(0, -0.12, 0.08);
  gunGroup.add(grip);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.07), metal);
  mag.position.set(0, -0.1, -0.02);
  gunGroup.add(mag);

  gunGroup.position.set(0.22, -0.17, -0.38);
  camera.add(gunGroup);
}

// ─── Player ───────────────────────────────────────────────────────────────────
function resetPlayer() {
  player = {
    hp: PLAYER_HP_MAX,
    ammo: AMMO_MAG,
    reserve: AMMO_RESERVE,
    score: 0,
    kills: 0,
    reloading: false,
    reloadTimer: null,
    alive: true,
  };
  camera.position.set(CELL * 1.5, PLAYER_HEIGHT, CELL * 1.5);
  yaw = 0; pitch = 0;
}

function updatePlayer(dt) {
  const dir = new THREE.Vector3();
  if (keys['KeyW'] || keys['ArrowUp'])    dir.z -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  dir.z += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  dir.x -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dir.x += 1;
  dir.normalize();

  const world = dir.applyEuler(new THREE.Euler(0, yaw, 0));
  const nx = camera.position.x + world.x * PLAYER_SPEED * dt;
  const nz = camera.position.z + world.z * PLAYER_SPEED * dt;

  if (!wallHit(nx, camera.position.z, PLAYER_RADIUS)) camera.position.x = nx;
  if (!wallHit(camera.position.x, nz, PLAYER_RADIUS)) camera.position.z = nz;
  camera.position.y = PLAYER_HEIGHT;

  // Camera rotation
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  // Gun recoil settle
  if (recoilT > 0) {
    recoilT = Math.max(0, recoilT - dt * 8);
    gunGroup.position.z = -0.38 + recoilT * 0.07;
  }
}

function wallHit(x, z, r) {
  for (const w of wallBoxes) {
    if (x + r > w.minX && x - r < w.maxX && z + r > w.minZ && z - r < w.maxZ) return true;
  }
  return false;
}

// ─── Shooting ─────────────────────────────────────────────────────────────────
function tryShoot() {
  const now = performance.now();
  if (now - lastShootTime < SHOOT_DELAY_MS) return;
  if (player.reloading) return;
  if (!player.alive) return;

  if (player.ammo <= 0) { startReload(); return; }

  player.ammo--;
  lastShootTime = now;

  // Muzzle flash
  spawnMuzzleFlash();

  // Recoil
  recoilT = 1;

  // Raycast
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(0, 0), camera);

  const targets = enemies.filter(e => !e.dead).map(e => e.mesh);
  const hits = rc.intersectObjects(targets, true);

  if (hits.length > 0) {
    const hitMesh = hits[0].object;
    const e = enemies.find(en => en.mesh === hitMesh || en.mesh.children.includes(hitMesh));
    if (e && !e.dead) {
      const headshot = hits[0].object === e.headMesh;
      const dmg = headshot ? 100 : 25;
      e.hp -= dmg;
      if (e.hp <= 0) {
        e.dead = true;
        player.kills++;
        player.score += headshot ? 300 * wave : 100 * wave;
        enemiesLeft--;
        showKillMsg();
      } else {
        // Hit marker
        flashHitMarker();
      }
    }
  }

  // Bullet trace
  const traceGeo = new THREE.BoxGeometry(0.015, 0.015, 0.5);
  const traceMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
  const trace = new THREE.Mesh(traceGeo, traceMat);
  const start = rc.ray.origin.clone().addScaledVector(rc.ray.direction, 0.8);
  trace.position.copy(start);
  trace.lookAt(start.clone().addScaledVector(rc.ray.direction, 5));
  scene.add(trace);
  pBullets.push({ mesh: trace, vel: rc.ray.direction.clone().multiplyScalar(BULLET_SPEED), life: BULLET_LIFE });

  updateHUD();
}

function spawnMuzzleFlash() {
  const geo = new THREE.SphereGeometry(0.07, 6, 4);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffee88 });
  const flash = new THREE.Mesh(geo, mat);
  flash.position.set(0, 0.04, -0.58);
  gunGroup.add(flash);
  setTimeout(() => { if (gunGroup) gunGroup.remove(flash); }, 55);
}

function startReload() {
  if (player.reloading || player.reserve <= 0 || player.ammo === AMMO_MAG) return;
  player.reloading = true;
  document.getElementById('reloadMsg').classList.remove('hidden');
  player.reloadTimer = setTimeout(() => {
    const need = AMMO_MAG - player.ammo;
    const load = Math.min(need, player.reserve);
    player.ammo += load;
    player.reserve -= load;
    player.reloading = false;
    document.getElementById('reloadMsg').classList.add('hidden');
    updateHUD();
  }, RELOAD_MS);
}

// ─── Enemies ──────────────────────────────────────────────────────────────────
function spawnWave() {
  const count = 3 + (wave - 1) * 2;
  enemiesLeft = count;

  // Shuffle open cells far from player
  const pool = openCells.filter(c => {
    const dx = c.x - camera.position.x;
    const dy = c.y - camera.position.z;
    return Math.sqrt(dx*dx + dy*dy) > 16;
  });
  shuffleArr(pool);

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    spawnEnemy(pool[i].x, pool[i].y);
  }
  if (count > pool.length) enemiesLeft = pool.length;
}

function spawnEnemy(x, z) {
  const grp = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xcc1111 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.38), bodyMat);
  body.position.y = 0.55;
  grp.add(body);

  const headMat = new THREE.MeshLambertMaterial({ color: 0xe84444 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.44, 0.44), headMat);
  head.position.y = 1.32;
  grp.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  [-0.12, 0.12].forEach(ox => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.05), eyeMat);
    eye.position.set(ox, 1.35, -0.22);
    grp.add(eye);
  });

  grp.position.set(x, 0, z);
  scene.add(grp);

  const cd = ENEMY_SHOOT_CD_MIN + Math.random() * (ENEMY_SHOOT_CD_MAX - ENEMY_SHOOT_CD_MIN);
  enemies.push({
    mesh: grp,
    headMesh: head,
    hp: ENEMY_HP,
    maxHp: ENEMY_HP,
    pos: new THREE.Vector3(x, 0, z),
    patrolTarget: randomOpenCell(),
    state: 'patrol',
    shootCd: cd,
    lastShot: 0,
    speed: ENEMY_SPEED_BASE + (wave - 1) * 0.3,
    dead: false,
  });
}

function updateEnemies(dt, now) {
  for (const e of enemies) {
    if (e.dead) continue;

    const pPos = camera.position.clone();
    pPos.y = 0;
    const eDist = e.pos.distanceTo(pPos);

    // State machine
    if (eDist < ENEMY_ALERT_R) {
      e.state = eDist < ENEMY_SHOOT_R ? 'shoot' : 'chase';
    } else {
      e.state = 'patrol';
    }

    // Move
    let target;
    if (e.state === 'patrol') {
      if (!e.patrolTarget || e.pos.distanceTo(e.patrolTarget) < 0.8) e.patrolTarget = randomOpenCell();
      target = e.patrolTarget;
    } else {
      target = pPos.clone();
    }

    if (e.state !== 'shoot') {
      const dir = target.clone().sub(e.pos);
      dir.y = 0;
      if (dir.length() > 0.1) {
        dir.normalize();
        const spd = e.state === 'chase' ? e.speed * 1.6 : e.speed;
        const nx = e.pos.x + dir.x * spd * dt;
        const nz = e.pos.z + dir.z * spd * dt;
        if (!wallHit(nx, e.pos.z, 0.28)) e.pos.x = nx;
        if (!wallHit(e.pos.x, nz, 0.28)) e.pos.z = nz;
        e.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      }
    } else {
      const fd = pPos.clone().sub(e.pos);
      fd.y = 0;
      if (fd.length() > 0.01) e.mesh.rotation.y = Math.atan2(fd.x, fd.z);
    }

    e.mesh.position.copy(e.pos);

    // Shoot
    if (e.state === 'shoot' && now - e.lastShot > e.shootCd) {
      enemyShoot(e);
      e.lastShot = now;
    }
  }

  // Remove dead
  enemies = enemies.filter(e => {
    if (e.dead) { scene.remove(e.mesh); return false; }
    return true;
  });
}

function enemyShoot(e) {
  const origin = e.pos.clone();
  origin.y = 1.3;

  const dir = camera.position.clone().sub(origin).normalize();
  dir.x += (Math.random() - 0.5) * ENEMY_INACCURACY;
  dir.y += (Math.random() - 0.5) * ENEMY_INACCURACY;
  dir.z += (Math.random() - 0.5) * ENEMY_INACCURACY;
  dir.normalize();

  const geo = new THREE.SphereGeometry(0.08, 5, 5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff7700 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(origin);
  scene.add(mesh);

  eBullets.push({ mesh, vel: dir.multiplyScalar(ENEMY_BULLET_SPEED), life: ENEMY_BULLET_LIFE });
}

// ─── Bullets ──────────────────────────────────────────────────────────────────
function updateBullets(dt) {
  // Player bullets (traces)
  pBullets.forEach(b => {
    b.mesh.position.addScaledVector(b.vel, dt);
    b.life -= dt;
  });
  pBullets = pBullets.filter(b => { if (b.life <= 0) { scene.remove(b.mesh); return false; } return true; });

  // Enemy bullets
  eBullets.forEach(b => {
    b.mesh.position.addScaledVector(b.vel, dt);
    b.life -= dt;
    if (b.life > 0 && b.mesh.position.distanceTo(camera.position) < 0.45) {
      player.hp = Math.max(0, player.hp - ENEMY_DAMAGE);
      b.life = 0;
      updateHUD();
      if (player.hp <= 0 && player.alive) {
        player.alive = false;
        triggerGameOver();
      }
    }
    // Wall hit
    if (b.life > 0 && wallHit(b.mesh.position.x, b.mesh.position.z, 0.05)) {
      b.life = 0;
    }
  });
  eBullets = eBullets.filter(b => { if (b.life <= 0) { scene.remove(b.mesh); return false; } return true; });
}

// ─── Wave management ──────────────────────────────────────────────────────────
function checkWave() {
  if (enemies.length === 0 && enemiesLeft <= 0 && gameState === 'playing') {
    enemiesLeft = -1; // sentinel
    wave++;
    announceWave();
    setTimeout(() => {
      if (gameState === 'playing') spawnWave();
    }, 3000);
  }
}

function announceWave() {
  const el = document.getElementById('waveAnnounce');
  el.textContent = `WAVE ${wave}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('scoreVal').textContent = player.score;
  document.getElementById('waveVal').textContent = wave;
  document.getElementById('enemyCount').textContent = `残り ${enemies.filter(e=>!e.dead).length + Math.max(0, enemiesLeft)} 体`;

  const hpPct = player.hp / PLAYER_HP_MAX * 100;
  const fill = document.getElementById('healthFill');
  fill.style.width = hpPct + '%';
  fill.style.background = hpPct > 50 ? '#22ee44' : hpPct > 25 ? '#ffaa00' : '#ff2222';
  document.getElementById('healthVal').textContent = player.hp + ' / ' + PLAYER_HP_MAX;

  document.getElementById('ammoCurrent').textContent = player.ammo;
  document.getElementById('ammoReserve').textContent = player.reserve;
}

function flashHitMarker() {
  const el = document.getElementById('hitMarker');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 90);
}

function showKillMsg() {
  flashHitMarker();
  const el = document.getElementById('killMsg');
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'fadeUp 0.8s forwards';
  setTimeout(() => el.classList.add('hidden'), 800);
}

// ─── Game flow ────────────────────────────────────────────────────────────────
function startGame() {
  // Clear previous game objects
  enemies.forEach(e => scene.remove(e.mesh));
  pBullets.forEach(b => scene.remove(b.mesh));
  eBullets.forEach(b => scene.remove(b.mesh));
  enemies = []; pBullets = []; eBullets = [];

  wave = 1;
  resetPlayer();
  updateHUD();
  spawnWave();

  document.getElementById('menu').classList.add('hidden');
  document.getElementById('gameOver').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');

  gameState = 'playing';
  document.body.requestPointerLock();

  clock.start();
  requestAnimationFrame(loop);
}

function triggerGameOver() {
  gameState = 'gameover';
  if (player.reloadTimer) clearTimeout(player.reloadTimer);
  document.exitPointerLock();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('finalScore').textContent = player.score;
  document.getElementById('finalKills').textContent = player.kills;
  document.getElementById('finalWave').textContent = wave;
  document.getElementById('gameOver').classList.remove('hidden');
}

function togglePause() {
  if (gameState === 'playing') {
    gameState = 'paused';
    document.exitPointerLock();
    document.getElementById('pauseScreen').classList.remove('hidden');
  }
}

function resumeGame() {
  if (gameState !== 'paused') return;
  document.getElementById('pauseScreen').classList.add('hidden');
  gameState = 'playing';
  document.body.requestPointerLock();
  clock.getDelta(); // drain accumulated delta
  requestAnimationFrame(loop);
}

// ─── Game loop ────────────────────────────────────────────────────────────────
function loop() {
  if (gameState !== 'playing') return;
  requestAnimationFrame(loop);

  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  updatePlayer(dt);
  updateEnemies(dt, now);
  updateBullets(dt);
  checkWave();

  renderer.render(scene, camera);
}

// ─── Event handlers ───────────────────────────────────────────────────────────
function onMouseMove(e) {
  if (!isLocked) return;
  const sens = 0.0018;
  yaw   -= e.movementX * sens;
  pitch -= e.movementY * sens;
  pitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, pitch));
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randomOpenCell() {
  const c = openCells[Math.floor(Math.random() * openCells.length)];
  return new THREE.Vector3(c.x, 0, c.y);
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
init();
