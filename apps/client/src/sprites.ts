/** 픽셀아트 스프라이트: 외부 이미지 없이 글자 격자(art.ts) → 오프스크린 캔버스로 굽는다 */
import { ENEMY_IDS, TOWER_IDS, type EnemyId, type TowerId } from '@code-freeze/shared';
import { DEV, ENEMY_ART, PAL, PROD_SERVER, SHOT_ART, TOWER_ART } from './art';

export type Sprite = HTMLCanvasElement;

export function bake(rows: readonly string[]): Sprite {
  const c = document.createElement('canvas');
  c.width = Math.max(...rows.map((r) => r.length));
  c.height = rows.length;
  const ctx = c.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = PAL[row[x]!];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

function tint(src: Sprite, color: string, alpha = 1): Sprite {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export interface Sprites {
  enemy: Record<EnemyId, Sprite>;
  enemyFlash: Record<EnemyId, Sprite>;
  /** 얼어 있을 때 (하늘색으로 덧칠) */
  enemyFrozen: Record<EnemyId, Sprite>;
  tower: Record<TowerId, Sprite>;
  shot: Partial<Record<TowerId, Sprite>>;
  prod: Sprite;
  dev: Sprite;
}

export function makeSprites(): Sprites {
  const enemy = {} as Record<EnemyId, Sprite>;
  const enemyFlash = {} as Record<EnemyId, Sprite>;
  const enemyFrozen = {} as Record<EnemyId, Sprite>;
  for (const id of ENEMY_IDS) {
    enemy[id] = bake(ENEMY_ART[id]);
    enemyFlash[id] = tint(enemy[id], '#ffffff');
    enemyFrozen[id] = tint(enemy[id], '#89dceb', 0.55);
  }
  const tower = {} as Record<TowerId, Sprite>;
  for (const id of TOWER_IDS) tower[id] = bake(TOWER_ART[id]);
  const shot: Partial<Record<TowerId, Sprite>> = {};
  for (const id of TOWER_IDS) {
    const art = SHOT_ART[id];
    if (art) shot[id] = bake(art);
  }
  return { enemy, enemyFlash, enemyFrozen, tower, shot, prod: bake(PROD_SERVER), dev: bake(DEV) };
}
