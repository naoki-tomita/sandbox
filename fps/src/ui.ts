import { PLAYER_HP_MAX } from './config';

export interface HUDSnapshot {
  score:            number;
  wave:             number;
  enemiesRemaining: number;
  hp:               number;
  ammo:             number;
  reserve:          number;
}

function el(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

export function updateHUD(s: HUDSnapshot): void {
  el('scoreVal').textContent    = String(s.score);
  el('waveVal').textContent     = String(s.wave);
  el('enemyCount').textContent  = `残り ${s.enemiesRemaining} 体`;

  const hpPct = s.hp / PLAYER_HP_MAX * 100;
  const fill  = el('healthFill');
  fill.style.width      = hpPct + '%';
  fill.style.background = hpPct > 50 ? '#22ee44' : hpPct > 25 ? '#ffaa00' : '#ff2222';
  el('healthVal').textContent  = s.hp + ' / ' + PLAYER_HP_MAX;

  el('ammoCurrent').textContent = String(s.ammo);
  el('ammoReserve').textContent = String(s.reserve);
}

export function flashHitMarker(): void {
  const e = el('hitMarker');
  e.classList.remove('hidden');
  setTimeout(() => e.classList.add('hidden'), 90);
}

export function showKillMsg(): void {
  flashHitMarker();
  const e = el('killMsg');
  e.classList.remove('hidden');
  e.style.animation = 'none';
  void e.offsetWidth; // reflow — forces animation to restart
  e.style.animation = 'fadeUp 0.8s forwards';
  setTimeout(() => e.classList.add('hidden'), 800);
}

export function announceWave(wave: number): void {
  const e = el('waveAnnounce');
  e.textContent = `WAVE ${wave}`;
  e.classList.remove('hidden');
  setTimeout(() => e.classList.add('hidden'), 2500);
}

export function setReloading(visible: boolean): void {
  el('reloadMsg').classList.toggle('hidden', !visible);
}

export function showHUD():    void { el('hud').classList.remove('hidden'); }
export function hideHUD():    void { el('hud').classList.add('hidden'); }
export function hideMenu():   void { el('menu').classList.add('hidden'); }
export function hideGameOver(): void { el('gameOver').classList.add('hidden'); }
export function showPause():  void { el('pauseScreen').classList.remove('hidden'); }
export function hidePause():  void { el('pauseScreen').classList.add('hidden'); }

export function showGameOver(stats: { score: number; kills: number; wave: number }): void {
  hideHUD();
  el('finalScore').textContent = String(stats.score);
  el('finalKills').textContent = String(stats.kills);
  el('finalWave').textContent  = String(stats.wave);
  el('gameOver').classList.remove('hidden');
}

export function bindButtons(handlers: {
  onStart():   void;
  onRestart(): void;
  onResume():  void;
}): void {
  el('startBtn').addEventListener('click',   handlers.onStart);
  el('restartBtn').addEventListener('click', handlers.onRestart);
  el('resumeBtn').addEventListener('click',  handlers.onResume);
}
