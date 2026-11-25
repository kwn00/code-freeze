/**
 * 통신 규격 (WebSocket, JSON 텍스트).
 *
 * 서버 권위: 클라이언트는 "의도"(이 칸에 이 타워를 지어 줘, 웨이브 시작해 줘)만 보낸다.
 * 돈·가용성·버그·피해·결과는 전부 서버가 sim.ts 로 계산하고, 화면은 서버가 보낸 상태를 그리기만 한다.
 * 클라이언트에서 온 값은 parseClientMsg 로 모양·범위를 확인한 것만 쓴다.
 */
import { SPEEDS, type Speed } from './constants';
import { sanitizeName } from './names';
import { COLS, ENEMY_IDS, ROWS, TOWERS, TOWER_IDS, type EnemyId, type TowerId } from './content';
import { isPhased, type GameEvent, type State, type Status } from './sim';

// ── 클라이언트 → 서버 ──

export type ClientMsg =
  | { t: 'hello'; v: number; token: string; name: string; resume?: string }
  | { t: 'build'; kind: TowerId; col: number; row: number }
  | { t: 'upgrade'; id: number }
  | { t: 'sell'; id: number }
  | { t: 'wave' }
  | { t: 'speed'; s: Speed }
  | { t: 'pause'; on: boolean }
  | { t: 'restart' }
  | { t: 'retire' }
  | { t: 'ping' };

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const TOKEN_RE = /^[A-Za-z0-9_.-]{20,200}$/;
/** 이어받기 키: 서버가 CSPRNG 로 만든 24바이트의 base64url (32자) */
export const RESUME_KEY_RE = /^[A-Za-z0-9_-]{32}$/;

/** 모양이 맞지 않으면 null (서버는 null 을 받으면 그 메시지를 버리고 셈한다) */
export function parseClientMsg(raw: string): ClientMsg | null {
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
  const m = o as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      if (!isInt(m.v, 0, 1e6) || typeof m.token !== 'string' || !TOKEN_RE.test(m.token)) return null;
      if (m.resume !== undefined && (typeof m.resume !== 'string' || !RESUME_KEY_RE.test(m.resume))) return null;
      return { t: 'hello', v: m.v, token: m.token, name: sanitizeName(m.name), ...(m.resume ? { resume: m.resume } : {}) };
    case 'build':
      return typeof m.kind === 'string' && (TOWER_IDS as readonly string[]).includes(m.kind) && isInt(m.col, 0, COLS - 1) && isInt(m.row, 0, ROWS - 1)
        ? { t: 'build', kind: m.kind as TowerId, col: m.col, row: m.row }
        : null;
    case 'upgrade':
    case 'sell':
      return isInt(m.id, 1, 2 ** 31) ? { t: m.t, id: m.id } : null;
    case 'speed':
      return (SPEEDS as readonly unknown[]).includes(m.s) ? { t: 'speed', s: m.s as Speed } : null;
    case 'pause':
      return typeof m.on === 'boolean' ? { t: 'pause', on: m.on } : null;
    case 'wave':
    case 'restart':
    case 'retire':
    case 'ping':
      return { t: m.t };
    default:
      return null;
  }
}

// ── 서버 → 클라이언트 ──

/**
 * 버그 한 마리: [id, 종류 번호, 간 거리×100, 남은 체력 %(1~100, 올림), 상태 비트(1 둔화, 2 화상, 4 번쩍, 8 사라짐, 16 얼음)].
 * 체력은 막대를 그리는 데만 쓰므로 비율만 보낸다 (전송량을 줄인다. 0.2.0)
 */
export type EnemyRow = [number, number, number, number, number];
/** 타워 하나: [id, 종류 번호, 칸 x, 칸 y, 단계, 쓴 값, 그중 원가로 돌려받을 수 있는 값] */
export type TowerRow = [number, number, number, number, number, number, number];
/** 탄 하나: [쏜 타워 종류 번호, x×100, y×100] */
export type ShotRow = [number, number, number];

export interface Snapshot {
  t: 'state';
  money: number;
  lives: number;
  wave: number;
  status: Status;
  speed: Speed;
  paused: boolean;
  kills: number;
  enemies: EnemyRow[];
  /** 타워 목록. 지난 상태와 같으면 빠진다 (화면은 마지막으로 받은 것을 그대로 쓴다. 전송량을 줄인다) */
  towers?: TowerRow[];
  shots: ShotRow[];
  /** 지난 상태 뒤에 일어난 일 (효과·소리용) */
  events: GameEvent[];
}

export interface RunResult {
  /** 프리즈 성공 (WIN_WAVE 스프린트를 막았다) */
  won: boolean;
  /** 어떻게 끝났나: prod 가 내려갔다 / 스스로 퇴근했다 */
  reason: 'lost' | 'retired';
  /** 막은 스프린트 수 */
  cleared: number;
  lives: number;
  kills: number;
  /** 순위표에 올랐으면 몇 등인지 (없으면 null) */
  rank: number | null;
}

/** 판이 끝날 때 서 있던 타워 하나: [종류 번호(TOWER_IDS), 단계(0부터)] */
export type BoardTower = [number, number];

export interface BoardEntry {
  name: string;
  cleared: number;
  lives: number;
  kills: number;
  won: boolean;
  endedAt: number;
  /** 판이 끝날 때 서 있던 타워들 (종류 순, 단계 높은 것부터). 이 값을 남기기 전의 기록에는 없다 */
  towers?: BoardTower[];
  /** 기록을 세운 게임 버전 (x.y.z) */
  version?: string;
}

/** 순위표 한 줄 (응답) */
export interface LeaderboardEntry extends BoardEntry {
  rank: number;
}

/** GET /api/leaderboard 의 응답 */
export interface LeaderboardResponse {
  /** 보고 있는 시즌 */
  season: number;
  /** 지금 시즌 (새 기록이 쌓이는 곳). 지난 시즌은 읽기만 한다 */
  current: number;
  /** 기록이 있는 시즌들 (오름차순, 지금 시즌은 늘 들어 있다) */
  seasons: number[];
  /** false 면 기록이 서버 메모리에만 있어서 서버가 다시 시작되면 사라진다 */
  persistent: boolean;
  /** true 면 저장된 기록을 아직 불러오지 못했다 (DB 가 깨어나는 중). 지금 목록은 일부일 수 있다 */
  loading: boolean;
  entries: LeaderboardEntry[];
}

/** 막은 스프린트 수의 상한 (야근은 끝이 없지만, 말이 안 되는 값은 버린다. 서버·화면이 함께 쓴다) */
export const MAX_CLEARED = 9999;

/** 순위표에 보여 주는 개수 */
export const LEADERBOARD_SIZE = 50;

/** 서버가 만든 타워 목록 모양인지 (저장·응답·화면에서 함께 쓴다) */
export function isBoardTowers(v: unknown): v is BoardTower[] {
  return (
    Array.isArray(v) &&
    v.length <= COLS * ROWS &&
    v.every(
      (t) =>
        Array.isArray(t) &&
        t.length === 2 &&
        Number.isInteger(t[0]) &&
        TOWER_IDS[t[0] as number] !== undefined &&
        Number.isInteger(t[1]) &&
        t[1] >= 0 &&
        t[1] < TOWERS[TOWER_IDS[t[0] as number]!].levels.length,
    )
  );
}

/** 판의 타워들 → 순위표에 남길 모양 (종류 순, 단계 높은 것부터) */
export function boardTowersOf(s: State): BoardTower[] {
  return s.towers
    .map((t): BoardTower => [TOWER_IDS.indexOf(t.kind), t.level])
    .sort((a, b) => a[0] - b[0] || b[1] - a[1]);
}

export type ServerMsg =
  | { t: 'welcome'; version: string; name: string; resumed: boolean; resume: string }
  | Snapshot
  | { t: 'result'; result: RunResult }
  | { t: 'error'; code: 'version_mismatch' | 'bad_token' | 'resume_failed' | 'replaced' | 'idle' | 'rate_limited' | 'server_full' | 'bad_message'; message: string }
  | { t: 'pong' };

/** 효과용 좌표는 소수 둘째 자리까지만 보낸다 (그리기에는 충분하고, 전송량이 크게 준다) */
function roundEvent(e: GameEvent): GameEvent {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) out[k] = typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
  return out as GameEvent;
}

export function towerRowsOf(s: State): TowerRow[] {
  return s.towers.map((t) => [t.id, TOWER_IDS.indexOf(t.kind), t.col, t.row, t.level, t.spent, t.fresh]);
}

export function snapshotOf(s: State, speed: Speed, paused: boolean, events: GameEvent[]): Snapshot {
  return {
    t: 'state',
    money: s.money,
    lives: s.lives,
    wave: s.wave,
    status: s.status,
    speed,
    paused,
    kills: s.kills,
    enemies: s.enemies.map((e) => [
      e.id,
      ENEMY_IDS.indexOf(e.kind),
      Math.round(e.dist * 100),
      Math.max(1, Math.min(100, Math.ceil((e.hp / e.maxHp) * 100))),
      (e.slow < 1 ? 1 : 0) | (e.burnLeft > 0 ? 2 : 0) | (e.flash > 0 ? 4 : 0) | (isPhased(e) ? 8 : 0) | (e.stunLeft > 0 ? 16 : 0),
    ]),
    towers: towerRowsOf(s),
    shots: s.shots.map((sh) => [TOWER_IDS.indexOf(sh.tower), Math.round(sh.x * 100), Math.round(sh.y * 100)]),
    events: events.map(roundEvent),
  };
}

/** 번호 → 종류 (서버에서 온 값을 확인할 때) */
export function enemyKindAt(i: number): EnemyId | undefined {
  return ENEMY_IDS[i];
}
export function towerKindAt(i: number): TowerId | undefined {
  return TOWER_IDS[i];
}
