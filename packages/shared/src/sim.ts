/**
 * 시뮬레이션: 게임 규칙 전부. 화면(DOM)을 쓰지 않고, 같은 입력이면 같은 결과가 나온다 (단위 테스트에서 검사한다).
 * 시간은 고정 간격(STEP)으로만 흐른다. 화면은 state 를 읽어서 그리고, 바꿀 때는 아래 명령 함수만 부른다.
 */
import {
  COLS,
  ENEMIES,
  PATH,
  ROWS,
  SELL_RATE,
  START_LIVES,
  START_MONEY,
  TOWERS,
  ECONOMY,
  waveBonusAt,
  WIN_WAVE,
  bountyScaleAt,
  hpScaleAt,
  normalHpScaleAt,
  waveAt,
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
/** 보스 체력이 난이도 곡선을 따라가는 몫 */
export const BOSS_HP_SHARE = 0.5;
/** 맵에 있을 수 있는 버그 수 (넘치면 더 나오지 않는다: 서버 계산량과 전송량을 지킨다) */
export const MAX_ENEMIES = 400;
/** 정규표현식의 줄 굵기 (줄에서 이만큼 안이면 맞는다, 칸) */
const LINE_HALF_WIDTH = 0.45;
/** 로드 밸런서가 튕겨 갈 수 있는 거리 (칸) */
const CHAIN_JUMP = 1.8;

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
  /** 얼어 있는 남은 시간 (초) */
  stunLeft: number;
  /** 나온 뒤 흐른 시간 (초): 깨지는 테스트의 사라짐, 보스의 낳기에 쓴다 */
  age: number;
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
  /**
   * spent 중 이번 짓는 시간(웨이브 사이)에 쓴 값. 다음 웨이브가 시작되기 전에 팔면 이만큼은 원가로 돌려받는다
   * (잘못 지은 것을 되돌릴 수 있게). 웨이브가 시작되면 0 이 된다. 웨이브 중에 쓴 값은 들어가지 않는다
   */
  fresh: number;
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
  | { t: 'beam'; x1: number; y1: number; x2: number; y2: number; tower: TowerId }
  | { t: 'stun'; x: number; y: number; r: number }
  | { t: 'kill'; x: number; y: number; kind: EnemyId; bounty: number }
  | { t: 'leak'; kind: EnemyId; amount: number }
  | { t: 'wave_start'; wave: number }
  | { t: 'wave_clear'; wave: number; bonus: number }
  | { t: 'boss'; kind: EnemyId }
  /** WIN_WAVE 스프린트를 막았다 (판은 야근으로 이어진다) */
  | { t: 'freeze_done'; wave: number }
  | { t: 'lost' }
  | { t: 'retired' };

/**
 * build: 짓는 중 / wave: 웨이브 중 / lost: prod 가 내려가 끝 / retired: 스스로 퇴근해서 끝.
 * 'won' 은 0.1.x 의 끝(10 스프린트)이었고 지금은 쓰지 않는다 (30 스프린트 뒤에도 야근이 이어진다)
 */
export type Status = 'build' | 'wave' | 'won' | 'lost' | 'retired';

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
  /** 지금 웨이브가 시작될 때의 kills. 웨이브 중에 끝나면(퇴근·장애·닫힘) 막지 못한 웨이브에서 잡은 것은 기록에 넣지 않는다 */
  killsAtWaveStart: number;
  /** 지금 웨이브가 시작될 때의 time (= 막은 스프린트까지 걸린 게임 안 시간) */
  timeAtWaveStart: number;
  /** 이번 웨이브의 보스가 아닌 버그 체력 배수 (content.ts normalHpScaleAt) */
  waveHpScale: number;
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
    killsAtWaveStart: 0,
    timeAtWaveStart: 0,
    waveHpScale: 1,
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

/** 이 타워를 지금 지을 수 있는 차례인가 (unlock: 그 스프린트부터. 짓는 중이면 다음 스프린트 기준) */
export function isUnlocked(s: State, kind: TowerId): boolean {
  const need = TOWERS[kind].unlock ?? 1;
  const next = s.status === 'build' ? s.wave + 1 : s.wave;
  return next >= need;
}

export function build(s: State, kind: TowerId, col: number, row: number): Tower | null {
  if (isOver(s) || !isUnlocked(s, kind)) return null;
  const cost = TOWERS[kind].levels[0]!.cost;
  if (!canBuildAt(s, col, row) || s.money < cost) return null;
  s.money -= cost;
  const t: Tower = { id: s.nextId++, kind, col, row, level: 0, cd: 0, spent: cost, fresh: s.status === 'build' ? cost : 0, aim: Math.PI / 2 };
  s.towers.push(t);
  return t;
}

/** 다음 단계 값. 이미 최대면 null */
export function upgradeCost(t: Tower): number | null {
  return TOWERS[t.kind].levels[t.level + 1]?.cost ?? null;
}

export function upgrade(s: State, towerId: number): boolean {
  if (isOver(s)) return false;
  const t = s.towers.find((x) => x.id === towerId);
  if (!t) return false;
  const cost = upgradeCost(t);
  if (cost === null || s.money < cost) return false;
  s.money -= cost;
  t.spent += cost;
  if (s.status === 'build') t.fresh += cost;
  t.level++;
  return true;
}

/** 팔 때 돌려받는 값: 이번 짓는 시간에 쓴 값은 원가로, 그 전에 쓴 값은 SELL_RATE 만큼 */
export function sellValue(t: Tower): number {
  return t.fresh + Math.floor((t.spent - t.fresh) * SELL_RATE);
}

export function sell(s: State, towerId: number): boolean {
  if (isOver(s)) return false;
  const i = s.towers.findIndex((x) => x.id === towerId);
  if (i < 0) return false;
  s.money += sellValue(s.towers[i]!);
  s.towers.splice(i, 1);
  return true;
}

/** 판이 끝났는가 (더 바꿀 수 없다) */
export function isOver(s: State): boolean {
  return s.status === 'won' || s.status === 'lost' || s.status === 'retired';
}

/** 기록에 넣을 잡은 버그 수: 막은 스프린트까지만 (웨이브 중에 끝났으면 그 웨이브 시작 때까지) */
export function recordedKills(s: State): number {
  return s.status === 'wave' || s.status === 'lost' ? s.killsAtWaveStart : s.kills;
}

/**
 * 기록에 넣을 클리어 시간 (초): 막은 스프린트까지 웨이브가 돈 게임 안 시간의 합.
 * 빠르기·멈춤·짓는 시간과 상관없다 (게임 안 시간은 웨이브 중에만 흐른다). 웨이브 중에 끝났으면 그 웨이브는 빼고
 */
export function recordedTime(s: State): number {
  return s.status === 'wave' || s.status === 'lost' ? s.timeAtWaveStart : s.time;
}

/** 막은 스프린트 수 (순위표의 점수) */
export function clearedOf(s: State): number {
  return s.status === 'wave' || s.status === 'lost' ? s.wave - 1 : s.wave;
}

/** 스스로 끝내기 (퇴근). 웨이브 중이면 그 웨이브는 막지 못한 것으로 친다 */
export function retire(s: State): boolean {
  if (isOver(s)) return false;
  s.queue = [];
  s.shots = [];
  s.kills = recordedKills(s);
  s.time = recordedTime(s);
  s.wave = clearedOf(s);
  s.status = 'retired';
  s.events.push({ t: 'retired' });
  return true;
}

/** 다음 웨이브 시작. 짓는 중일 때만 (30 스프린트 뒤에도 끝없이) */
export function startWave(s: State): boolean {
  if (s.status !== 'build') return false;
  s.wave++;
  s.status = 'wave';
  s.killsAtWaveStart = s.kills;
  s.timeAtWaveStart = s.time;
  // 웨이브가 시작되면 원가로 되돌리기는 끝난다
  for (const t of s.towers) t.fresh = 0;
  s.waveTime = 0;
  s.waveHpScale = normalHpScaleAt(s.wave);
  const def = waveAt(s.wave);
  for (const g of def.groups) {
    for (let i = 0; i < g.count; i++) s.queue.push({ at: (g.delay ?? 0) + i * g.gap, kind: g.kind });
  }
  s.queue.sort((a, b) => a.at - b.at);
  s.events.push({ t: 'wave_start', wave: s.wave });
  return true;
}

export function hpScale(wave: number): number {
  return hpScaleAt(wave);
}

function spawn(s: State, kind: EnemyId, dist = 0): Enemy | null {
  if (s.enemies.length >= MAX_ENEMIES) return null;
  // 보스는 체력이 절반 속도로 늘어난다 (늦은 막의 보스도 4단계를 다 올리지 않고 잡을 수 있게)
  // 보스가 아닌 버그: 이 웨이브의 체력 예산에 맞춘 배수 (startWave). 보스: 난이도 곡선의 절반 속도
  const scale = hpScale(s.wave);
  const hp = Math.max(1, Math.round(ENEMIES[kind].hp * (ENEMIES[kind].boss ? 1 + (scale - 1) * BOSS_HP_SHARE : s.waveHpScale || scale)));
  const e: Enemy = { id: s.nextId++, kind, hp, maxHp: hp, dist, slow: 1, burnDps: 0, burnLeft: 0, flash: 0, stunLeft: 0, age: 0 };
  s.enemies.push(e);
  if (ENEMIES[kind].boss) s.events.push({ t: 'boss', kind });
  return e;
}

// ── 한 틱 ──────────────────────────────────────

export function enemyPos(e: Enemy): [number, number] {
  return pathPoint(e.dist);
}

/** 깨지는 테스트가 지금 사라져 있는가 (겨냥되지 않는다. 둘레 공격은 맞는다) */
export function isPhased(e: Enemy): boolean {
  const ph = ENEMIES[e.kind].phase;
  if (!ph) return false;
  return e.age % (ph[0] + ph[1]) >= ph[0];
}

function damage(e: Enemy, amount: number, pierce: boolean): void {
  if (e.hp <= 0) return;
  const armor = pierce ? 0 : ENEMIES[e.kind].armor;
  e.hp -= Math.max(1, amount - armor);
  e.flash = 0.08;
}

/** 겨냥할 수 있는 버그인가 (맵에 들어왔고, 살아 있고, 사라져 있지 않다) */
function targetable(e: Enemy): boolean {
  return e.hp > 0 && e.dist >= ENTER_DIST && !isPhased(e);
}

/** 사거리 안에서 prod 에 가장 가까운(가장 멀리 간) 버그 */
function pickTarget(s: State, x: number, y: number, range: number): Enemy | undefined {
  let best: Enemy | undefined;
  for (const e of s.enemies) {
    if (!targetable(e)) continue;
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
      // 둔화는 늘 걸고, 피해·화상·얼림은 쿨다운마다
      t.cd -= dt;
      const hitNow = t.cd <= 0;
      if (hitNow) t.cd += lv.cooldown;
      let hitAny = false;
      for (const e of s.enemies) {
        if (e.hp <= 0 || e.dist < ENTER_DIST) continue;
        const [ex, ey] = enemyPos(e);
        if ((ex - x) ** 2 + (ey - y) ** 2 > lv.range * lv.range) continue;
        if (lv.slow) e.slow = Math.min(e.slow, lv.slow);
        if (hitNow) {
          hitAny = true;
          damage(e, lv.damage, !!lv.pierce);
          if (lv.burn && lv.burn >= e.burnDps) {
            e.burnDps = lv.burn;
            e.burnLeft = BURN_TIME;
          }
          if (lv.stun) e.stunLeft = Math.max(e.stunLeft, ENEMIES[e.kind].boss ? lv.stun / 2 : lv.stun);
        }
      }
      if (hitNow && hitAny && lv.stun) s.events.push({ t: 'stun', x, y, r: lv.range });
      // 둘레에 아무도 없으면 얼림을 아껴 둔다 (들어오자마자 얼린다)
      if (hitNow && !hitAny && lv.stun) t.cd = 0;
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
      s.events.push({ t: 'beam', x1: x, y1: y, x2: tx, y2: ty, tower: t.kind });
    } else if (def.attack === 'line') {
      // 대상 쪽으로 사거리 끝까지: 그 줄 위의 모든 버그 (사라진 것은 빼고)
      const len = Math.hypot(tx - x, ty - y) || 1;
      const ux = (tx - x) / len;
      const uy = (ty - y) / len;
      for (const e of s.enemies) {
        if (!targetable(e)) continue;
        const [ex, ey] = enemyPos(e);
        const along = (ex - x) * ux + (ey - y) * uy;
        if (along < 0 || along > lv.range) continue;
        const off = Math.abs((ex - x) * uy - (ey - y) * ux);
        if (off <= LINE_HALF_WIDTH) damage(e, lv.damage, !!lv.pierce);
      }
      s.events.push({ t: 'beam', x1: x, y1: y, x2: x + ux * lv.range, y2: y + uy * lv.range, tower: t.kind });
    } else if (def.attack === 'chain') {
      // 맞히고, 아직 안 맞은 가장 가까운 버그로 튕긴다. 튕길 때마다 피해 ×0.8
      const hit = new Set<number>();
      let cur: Enemy = target;
      let from: [number, number] = [x, y];
      let dmg = lv.damage;
      for (let j = 0; j <= (lv.chain ?? 0); j++) {
        const at = enemyPos(cur);
        damage(cur, dmg, !!lv.pierce);
        hit.add(cur.id);
        s.events.push({ t: 'beam', x1: from[0], y1: from[1], x2: at[0], y2: at[1], tower: t.kind });
        let next: Enemy | undefined;
        let bestD = CHAIN_JUMP * CHAIN_JUMP;
        for (const e of s.enemies) {
          if (hit.has(e.id) || !targetable(e)) continue;
          const [ex, ey] = enemyPos(e);
          const d = (ex - at[0]) ** 2 + (ey - at[1]) ** 2;
          if (d <= bestD) {
            bestD = d;
            next = e;
          }
        }
        if (!next) break;
        from = at;
        cur = next;
        dmg *= 0.8;
      }
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

  // 버그: 화상, 회복, 낳기, 걷기, 쓰러짐, 새어 나감
  const born: [EnemyId, number][] = [];
  const bountyScale = bountyScaleAt(s.wave);
  s.enemies = s.enemies.filter((e) => {
    const def = ENEMIES[e.kind];
    e.age += dt;
    if (e.hp > 0 && e.burnLeft > 0) {
      e.hp -= e.burnDps * dt;
      e.burnLeft -= dt;
      if (e.burnLeft <= 0) e.burnDps = 0;
    }
    if (e.hp > 0 && def.regen) e.hp = Math.min(e.maxHp, e.hp + def.regen * (e.maxHp / def.hp) * dt);
    e.flash = Math.max(0, e.flash - dt);
    if (e.hp <= 0) {
      const [x, y] = enemyPos(e);
      const bounty = Math.max(1, Math.round(def.bounty * bountyScale * (def.boss ? ECONOMY.boss : 1)));
      s.money += bounty;
      s.kills++;
      s.events.push({ t: 'kill', x, y, kind: e.kind, bounty });
      if (def.splits) for (let i = 0; i < def.splits.count; i++) born.push([def.splits.kind, Math.max(0, e.dist - i * 0.25)]);
      return false;
    }
    // 낳기: 걸어 다니며 정해진 간격마다 (맵에 들어온 뒤부터)
    if (def.spawns && e.dist >= ENTER_DIST && Math.floor((e.age - dt) / def.spawns.every) < Math.floor(e.age / def.spawns.every)) born.push([def.spawns.kind, Math.max(0, e.dist - 0.3)]);
    let speed = def.speed * e.slow;
    if (def.enrage && e.hp < e.maxHp / 2) speed *= def.enrage;
    if (e.stunLeft > 0) {
      e.stunLeft = Math.max(0, e.stunLeft - dt);
      speed = 0;
    }
    e.dist += speed * dt;
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
    s.queue = [];
    s.events.push({ t: 'lost' });
    return;
  }
  if (s.queue.length === 0 && s.enemies.length === 0) {
    s.shots = [];
    const bonus = waveBonusAt(s.wave);
    s.money += bonus;
    s.status = 'build';
    s.events.push({ t: 'wave_clear', wave: s.wave, bonus });
    if (s.wave === WIN_WAVE) s.events.push({ t: 'freeze_done', wave: s.wave });
  }
}
