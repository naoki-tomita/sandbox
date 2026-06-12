export const PLAYER_HEIGHT   = 1.65;
export const PLAYER_SPEED    = 7.5;
export const PLAYER_RADIUS   = 0.35;
export const PLAYER_HP_MAX   = 100;
export const AMMO_MAG        = 30;
export const AMMO_RESERVE    = 90;
export const RELOAD_MS       = 1800;
export const SHOOT_DELAY_MS  = 120;

export const BULLET_SPEED    = 60;
export const BULLET_LIFE     = 0.12;

export const ENEMY_SPEED_BASE   = 2.8;
export const ENEMY_HP           = 100;
export const ENEMY_DAMAGE       = 8;
export const ENEMY_SHOOT_CD_MIN = 1500;
export const ENEMY_SHOOT_CD_MAX = 3000;
export const ENEMY_ALERT_R      = 18;
export const ENEMY_SHOOT_R      = 14;
export const ENEMY_BULLET_SPEED = 18;
export const ENEMY_BULLET_LIFE  = 3;
export const ENEMY_INACCURACY   = 0.14;

export const CELL   = 4;
export const WALL_H = 3.2;

export const MAZE: number[][] = [
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

export const ROWS = MAZE.length;
export const COLS = MAZE[0].length;
