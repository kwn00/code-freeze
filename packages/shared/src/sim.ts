/**
 * 시뮬레이션: 게임 규칙 전부. 화면(DOM)을 쓰지 않고, 같은 입력이면 같은 결과가 나온다 (단위 테스트에서 검사한다).
 * 시간은 고정 간격(STEP)으로만 흐른다. 화면은 state 를 읽어서 그리고, 바꿀 때는 아래 명령 함수만 부른다.
 */
import {
  COLS,
  ENEMIES,
  HP_GROWTH,
  PATH,
  ROWS,
  SELL_RATE,
  START_LIVES,
  START_MONEY,
  TOWERS,
  WAVE_BONUS,
  WAVES,
  type EnemyId,
  type TowerId,
} from './content';

export const STEP = 1 / 30;
/** 화상이 이어지는 시간 (초) */
const BURN_TIME = 1.5;
/** 이만큼 걸어 들어와야 맵 안에 보이고, 그때부터 맞는다 (길은 맵 위 바깥 한 칸에서 시작) */
export const ENTER_DIST = 0.5;
/** 탄 속도 (칸/초) */
const SHOT_SPEED = 9;

export interface Enemy {
  id: number;
  kind: EnemyId;
  hp: number;
  maxHp: number;
  /** 길 위에서 간 거리 (칸) */
  dist: number;
  /** 이번 틱의 속도 배수 (가장 센 둔화 하나만) */
  slow: number;
  burnDps: number;
  burnLeft: number;
  /** 맞은 직후 번쩍임 (초) */
  flash: number;
}

export interface Tower {
  id: number;
  kind: TowerId;
  col: number;
  row: number;
  /** 0 부터 */
  level: number;
  cd: number;
  /** 지금까지 쓴 값 (팔 때) */
  spent: number;
  /** 바라보는 방향 (화면용, 라디안) */
  aim: number;
}

export interface Shot {
  id: number;
  tower: TowerId;
  x: number;
  y: number;
  target: number;
  /** 대상이 사라지면 마지막 자리로 날아간다 */
  tx: number;
  ty: number;
  damage: number;
  splash: number;
  pierce: boolean;
}

/** 화면이 효과를 그리라고 남기는 일. 화면이 읽고 비운다 */
export type GameEvent =
  | { t: 'hit'; x: number; y: number; splash: number; tower: TowerId }
  | { t: 'beam'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'kill'; x: number; y: number; kind: EnemyId; bounty: number }
  | { t: 'leak'; kind: EnemyId; amount: number }
  | { t: 'wave_start'; wave: number }
  | { t: 'wave_clear'; wave: number; bonus: number }
  | { t: 'boss'; kind: EnemyId }
  | { t: 'won' }
  | { t: 'lost' };

export type Status = 'build' | 'wave' | 'won' | 'lost';

interface Spawn {
  at: number;
  kind: EnemyId;
}

export interface State {
  time: number;
  money: number;
  lives: number;
  /** 지금(또는 마지막으로) 진행한 웨이브 번호. 0 = 아직 시작 전 */
  wave: number;
  status: Status;
  /** 웨이브가 시작된 뒤 흐른 시간 */
  waveTime: number;
  queue: Spawn[];
  enemies: Enemy[];
  towers: Tower[];
  shots: Shot[];
  events: GameEvent[];
  kills: number;
  nextId: number;
}

// ── 길 ─────────────────────────────────────────

/** 꺾임점 사이 길이의 누적 (칸) */
const SEG: number[] = [0];
for (let i = 1; i < PATH.length; i++) {
  const [ax, ay] = PATH[i - 1]!;
  const [bx, by] = PATH[i]!;
  SEG.push(SEG[i - 1]! + Math.abs(bx - ax) + Math.abs(by - ay));
}
export const PATH_LENGTH = SEG[SEG.length - 1]!;

/** 길 위 거리 → 칸 좌표 (칸의 가운데가 정수 + 0.5) */
export function pathPoint(dist: number): [number, number] {
  const d = Math.max(0, Math.min(PATH_LENGTH, dist));
  let i = 1;
  while (i < SEG.length - 1 && SEG[i]! < d) i++;
  const [ax, ay] = PATH[i - 1]!;
  const [bx, by] = PATH[i]!;
  const len = SEG[i]! - SEG[i - 1]!;
  const k = len === 0 ? 0 : (d - SEG[i - 1]!) / len;
  return [ax + (bx - ax) * k + 0.5, ay + (by - ay) * k + 0.5];
}

/** 길이 지나는 칸 ("col,row"). 여기에는 지을 수 없다 */
export const PATH_TILES: ReadonlySet<string> = (() => {
  const s = new Set<string>();
  for (let i = 1; i < PATH.length; i++) {
    let [x, y] = PATH[i - 1]!;
    const [bx, by] = PATH[i]!;
    s.add(`${x},${y}`);
    while (x !== bx || y !== by) {
      x += Math.sign(bx - x);
      y += Math.sign(by - y);
      s.add(`${x},${y}`);
    }
  }
  return s;
})();

/** prod 서버가 놓인 칸 (길의 끝) */
export const PROD_TILE = PATH[PATH.length - 1]!;

// ── 만들기와 명령 ───────────────────────────────

export function newGame(): State {
  return {
    time: 0,
    money: START_MONEY,
    lives: START_LIVES,
    wave: 0,
    status: 'build',
    waveTime: 0,
    queue: [],
    enemies: [],
    towers: [],
    shots: [],
    events: [],
    kills: 0,
    nextId: 1,
  };
}

export function towerAt(s: State, col: number, row: number): Tower | undefined {
  return s.towers.find((t) => t.col === col && t.row === row);
}

/** 이 칸에 지을 수 있는가 (돈은 따로) */
export function canBuildAt(s: State, col: number, row: number): boolean {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false;
  if (PATH_TILES.has(`${col},${row}`)) return false;
  return !towerAt(s, col, row);
}

export function build(s: State, kind: TowerId, col: number, row: number): Tower | null {
  if (s.status === 'won' || s.status === 'lost') return null;
  const cost = TOWERS[kind].levels[0]!.cost;
  if (!canBuildAt(s, col, row) || s.money < cost) return null;
  s.money -= cost;
  const t: Tower = { id: s.nextId++, kind, col, row, level: 0, cd: 0, spent: cost, aim: Math.PI / 2 };
  s.towers.push(t);
  return t;
}

/** 다음 단계 값. 이미 최대면 null */
export function upgradeCost(t: Tower): number | null {
  return TOWERS[t.kind].levels[t.level + 1]?.cost ?? null;
}

export function upgrade(s: State, towerId: number): boolean {
  if (s.status === 'won' || s.status === 'lost') return false;
  const t = s.towers.find((x) => x.id === towerId);
  if (!t) return false;
  const cost = upgradeCost(t);
  if (cost === null || s.money < cost) return false;
  s.money -= cost;
  t.spent += cost;
  t.level++;
  return true;
}

export function sellValue(t: Tower): number {
  return Math.floor(t.spent * SELL_RATE);
}

export function sell(s: State, towerId: number): boolean {
  if (s.status === 'won' || s.status === 'lost') return false;
  const i = s.towers.findIndex((x) => x.id === towerId);
  if (i < 0) return false;
  s.money += sellValue(s.towers[i]!);
  s.towers.splice(i, 1);
  return true;
}

/** 다음 웨이브 시작. 짓는 중일 때만 */
export function startWave(s: State): boolean {
  if (s.status !== 'build' || s.wave >= WAVES.length) return false;
  s.wave++;
  s.status = 'wave';
  s.waveTime = 0;
  const def = WAVES[s.wave - 1]!;
  for (const g of def.groups) {
    for (let i = 0; i < g.count; i++) s.queue.push({ at: (g.delay ?? 0) + i * g.gap, kind: g.kind });
  }
  s.queue.sort((a, b) => a.at - b.at);
  s.events.push({ t: 'wave_start', wave: s.wave });
  return true;
}

export function hpScale(wave: number): number {
  return 1 + HP_GROWTH * Math.max(0, wave - 1);
}

function spawn(s: State, kind: EnemyId, dist = 0): Enemy {
  const hp = Math.round(ENEMIES[kind].hp * hpScale(s.wave));
  const e: Enemy = { id: s.nextId++, kind, hp, maxHp: hp, dist, slow: 1, burnDps: 0, burnLeft: 0, flash: 0 };
  s.enemies.push(e);
  if (ENEMIES[kind].boss) s.events.push({ t: 'boss', kind });
  return e;
}

// ── 한 틱 ──────────────────────────────────────

export function enemyPos(e: Enemy): [number, number] {
  return pathPoint(e.dist);
}

function damage(e: Enemy, amount: number, pierce: boolean): void {
  if (e.hp <= 0) return;
  const armor = pierce ? 0 : ENEMIES[e.kind].armor;
  e.hp -= Math.max(1, amount - armor);
  e.flash = 0.08;
}

/** 사거리 안에서 prod 에 가장 가까운(가장 멀리 간) 버그 */
function pickTarget(s: State, x: number, y: number, range: number): Enemy | undefined {
  let best: Enemy | undefined;
  for (const e of s.enemies) {
    if (e.hp <= 0 || e.dist < ENTER_DIST) continue;
    const [ex, ey] = enemyPos(e);
    if ((ex - x) ** 2 + (ey - y) ** 2 > range * range) continue;
    if (!best || e.dist > best.dist) best = e;
  }
  return best;
}

export function step(s: State): void {
  if (s.status !== 'wave') return;
  const dt = STEP;
  s.time += dt;
  s.waveTime += dt;

  // 나오기
  while (s.queue.length && s.queue[0]!.at <= s.waveTime) spawn(s, s.queue.shift()!.kind);

  // 타워
  for (const e of s.enemies) e.slow = 1;
  for (const t of s.towers) {
    const def = TOWERS[t.kind];
    const lv = def.levels[t.level]!;
    const x = t.col + 0.5;
    const y = t.row + 0.5;
    if (def.attack === 'aura') {
      // 둔화는 늘 걸고, 피해는 쿨다운마다
      t.cd -= dt;
      const hitNow = t.cd <= 0;
      if (hitNow) t.cd += lv.cooldown;
      for (const e of s.enemies) {
        if (e.hp <= 0 || e.dist < ENTER_DIST) continue;
        const [ex, ey] = enemyPos(e);
        if ((ex - x) ** 2 + (ey - y) ** 2 > lv.range * lv.range) continue;
        if (lv.slow) e.slow = Math.min(e.slow, lv.slow);
        if (hitNow) {
          damage(e, lv.damage, !!lv.pierce);
          if (lv.burn && lv.burn >= e.burnDps) {
            e.burnDps = lv.burn;
            e.burnLeft = BURN_TIME;
          }
        }
      }
      if (t.cd < 0) t.cd = 0;
      continue;
    }
    t.cd -= dt;
    if (t.cd > 1e-9) continue;
    const target = pickTarget(s, x, y, lv.range);
    if (!target) {
      t.cd = 0;
      continue;
    }
    const [tx, ty] = enemyPos(target);
    t.aim = Math.atan2(ty - y, tx - x);
    // 남은 몫을 이어 가서 평균 간격이 적힌 값과 같게
    t.cd += lv.cooldown;
    if (def.attack === 'beam') {
      damage(target, lv.damage, !!lv.pierce);
      s.events.push({ t: 'beam', x1: x, y1: y, x2: tx, y2: ty });
    } else {
      s.shots.push({ id: s.nextId++, tower: t.kind, x, y, target: target.id, tx, ty, damage: lv.damage, splash: lv.splash ?? 0, pierce: !!lv.pierce });
    }
  }

  // 탄
  const byId = new Map(s.enemies.map((e) => [e.id, e]));
  s.shots = s.shots.filter((sh) => {
    const tgt = byId.get(sh.target);
    if (tgt && tgt.hp > 0) [sh.tx, sh.ty] = enemyPos(tgt);
    const dx = sh.tx - sh.x;
    const dy = sh.ty - sh.y;
    const d = Math.hypot(dx, dy);
    const move = SHOT_SPEED * dt;
    if (d > move) {
      sh.x += (dx / d) * move;
      sh.y += (dy / d) * move;
      return true;
    }
    // 닿음
    if (sh.splash > 0) {
      for (const e of s.enemies) {
        if (e.dist < ENTER_DIST) continue;
        const [ex, ey] = enemyPos(e);
        if ((ex - sh.tx) ** 2 + (ey - sh.ty) ** 2 <= sh.splash * sh.splash) damage(e, sh.damage, sh.pierce);
      }
    } else if (tgt) {
      damage(tgt, sh.damage, sh.pierce);
    }
    s.events.push({ t: 'hit', x: sh.tx, y: sh.ty, splash: sh.splash, tower: sh.tower });
    return false;
  });

  // 버그: 화상, 회복, 걷기, 쓰러짐, 새어 나감
  const born: [EnemyId, number][] = [];
  s.enemies = s.enemies.filter((e) => {
    const def = ENEMIES[e.kind];
    if (e.hp > 0 && e.burnLeft > 0) {
      e.hp -= e.burnDps * dt;
      e.burnLeft -= dt;
      if (e.burnLeft <= 0) e.burnDps = 0;
    }
    if (e.hp > 0 && def.regen) e.hp = Math.min(e.maxHp, e.hp + def.regen * dt);
    e.flash = Math.max(0, e.flash - dt);
    if (e.hp <= 0) {
      const [x, y] = enemyPos(e);
      s.money += def.bounty;
      s.kills++;
      s.events.push({ t: 'kill', x, y, kind: e.kind, bounty: def.bounty });
      if (def.splits) for (let i = 0; i < def.splits.count; i++) born.push([def.splits.kind, Math.max(0, e.dist - i * 0.25)]);
      return false;
    }
    e.dist += def.speed * e.slow * dt;
    if (e.dist >= PATH_LENGTH) {
      s.lives = Math.max(0, s.lives - def.leak);
      s.events.push({ t: 'leak', kind: e.kind, amount: def.leak });
      return false;
    }
    return true;
  });
  for (const [kind, dist] of born) spawn(s, kind, dist);

  if (s.lives <= 0) {
    s.status = 'lost';
    s.events.push({ t: 'lost' });
    return;
  }
  if (s.queue.length === 0 && s.enemies.length === 0) {
    s.shots = [];
    const bonus = WAVE_BONUS.base + WAVE_BONUS.perWave * s.wave;
    s.money += bonus;
    s.events.push({ t: 'wave_clear', wave: s.wave, bonus });
    if (s.wave >= WAVES.length) {
      s.status = 'won';
      s.events.push({ t: 'won' });
    } else {
      s.status = 'build';
    }
  }
}
