/**
 * 서버가 보낸 상태(Snapshot) → 화면이 그릴 상태.
 * 서버 상태는 초당 15번 온다. 그 사이는 버그의 "간 거리"를 앞뒤 두 상태 사이로 이어 그려 부드럽게 보이게 한다 (한 칸 늦게 그린다).
 * 이 파일은 DOM 을 쓰지 않는다. 서버에서 온 값은 여기서 모양과 범위를 확인한 것만 남긴다.
 */
import { COLS, ENEMIES, PATH_LENGTH, ROWS, SNAPSHOT_HZ, SPEEDS, TOWERS, enemyKindAt, towerKindAt, type Enemy, type GameEvent, type Shot, type Snapshot, type State, type Status, type Tower } from '@code-freeze/shared';

const STATUSES: readonly Status[] = ['build', 'wave', 'won', 'lost', 'retired'];
const INTERVAL = 1000 / SNAPSHOT_HZ;

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

export interface ViewState extends State {
  speed: number;
  paused: boolean;
}

/** 서버에서 온 값이 상태 모양인지 확인한다. 틀리면 null (그 상태는 버린다) */
export function checkSnapshot(m: Snapshot): Snapshot | null {
  if (num(m.money, 0, 1e9) === null || num(m.lives, 0, 1e6) === null || num(m.wave, 0, 1000) === null || num(m.kills, 0, 1e9) === null) return null;
  if (!STATUSES.includes(m.status) || !(SPEEDS as readonly unknown[]).includes(m.speed) || typeof m.paused !== 'boolean') return null;
  if (!Array.isArray(m.enemies) || (m.towers !== undefined && !Array.isArray(m.towers)) || !Array.isArray(m.shots) || !Array.isArray(m.events)) return null;
  if (m.enemies.length > 2000 || (m.towers?.length ?? 0) > COLS * ROWS || m.shots.length > 2000 || m.events.length > 5000) return null;
  return m;
}

export class View {
  private prev = new Map<number, number>();
  private cur: Snapshot | null = null;
  private at = 0;
  readonly events: GameEvent[] = [];

  push(m: Snapshot, now: number): void {
    // 이번 상태가 오기 직전에 그리던 거리를 출발점으로 (끊김 없이 이어진다)
    this.prev = new Map(this.cur ? this.enemies(now).map((e) => [e.id, e.dist]) : []);
    // 타워가 빠진 상태는 "지난번과 같다"는 뜻이다
    if (!m.towers) m = { ...m, towers: this.cur?.towers ?? [] };
    this.cur = m;
    this.at = now;
    this.events.push(...m.events);
  }

  get ready(): boolean {
    return this.cur !== null;
  }

  get snapshot(): Snapshot | null {
    return this.cur;
  }

  private enemies(now: number): Enemy[] {
    const m = this.cur;
    if (!m) return [];
    const k = Math.min(1, (now - this.at) / INTERVAL);
    const out: Enemy[] = [];
    for (const row of m.enemies) {
      if (!Array.isArray(row)) continue;
      const [id, kindIdx, dist100, hpPct, bits] = row;
      const kind = enemyKindAt(kindIdx);
      const d = num(dist100, 0, PATH_LENGTH * 100 + 100);
      if (!kind || d === null || num(id, 0, 2 ** 31) === null) continue;
      const to = d / 100;
      const from = this.prev.get(id) ?? to;
      out.push({
        id,
        kind,
        hp: num(hpPct, 0, 100) ?? 0,
        maxHp: 100,
        dist: from + (to - from) * k,
        slow: bits & 1 ? 0.5 : 1,
        burnDps: 0,
        burnLeft: bits & 2 ? 1 : 0,
        flash: bits & 4 ? 1 : 0,
        stunLeft: bits & 16 ? 1 : 0,
        // 사라져 있는 것은 화면에서 반투명하게 (isPhased 를 쓰지 않고 서버가 알려 준 대로)
        age: bits & 8 ? -1 : 0,
      });
    }
    return out;
  }

  /** 지금 그릴 상태 */
  state(now: number): ViewState | null {
    const m = this.cur;
    if (!m) return null;
    const towers: Tower[] = [];
    for (const row of m.towers ?? []) {
      if (!Array.isArray(row)) continue;
      const [id, kindIdx, col, rowN, level, spent, fresh] = row;
      const kind = towerKindAt(kindIdx);
      if (!kind || num(col, 0, COLS - 1) === null || num(rowN, 0, ROWS - 1) === null || num(level, 0, TOWERS[kind].levels.length - 1) === null) continue;
      const sp = num(spent, 0, 1e9) ?? 0;
      towers.push({ id, kind, col, row: rowN, level, cd: 0, spent: sp, fresh: num(fresh, 0, sp) ?? 0, aim: 0 });
    }
    const shots: Shot[] = [];
    for (const row of m.shots) {
      if (!Array.isArray(row)) continue;
      const [kindIdx, x, y] = row;
      const tower = towerKindAt(kindIdx);
      if (!tower || num(x, -500, 2000) === null || num(y, -500, 2000) === null) continue;
      shots.push({ id: 0, tower, x: x / 100, y: y / 100, target: 0, tx: 0, ty: 0, damage: 0, splash: 0, pierce: false });
    }
    return {
      time: 0,
      money: m.money,
      lives: m.lives,
      wave: m.wave,
      status: m.status,
      waveTime: 0,
      queue: [],
      enemies: this.enemies(now).filter((e) => ENEMIES[e.kind] !== undefined),
      towers,
      shots,
      events: [],
      kills: m.kills,
      killsAtWaveStart: 0,
      waveHpScale: 1,
      nextId: 0,
      speed: m.speed,
      paused: m.paused,
    };
  }
}
