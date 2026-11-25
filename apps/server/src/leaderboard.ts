/**
 * 리더보드. 기록은 판이 끝날 때 서버(game.ts)가 직접 남긴다. 클라이언트가 점수를 보내는 통로는 없다 (`/api/leaderboard` 는 읽기 전용).
 *
 * - 순위: 막은 스프린트 수 → 남은 가용성 → 잡은 버그 수 → 먼저 세운 기록.
 * - 지금 시즌의 상위 기록은 메모리에 들고 답한다. DB 가 느리거나 죽어도 게임과 조회는 멈추지 않는다.
 *   저장은 뒤에서 하고, 실패하면 다시 시도한다.
 * - 기록은 지우지 않는다 (CLAUDE.md). 시즌(LEADERBOARD_SEASON = 메이저 버전)이 바뀌면 기본 순위표에서만 빠진다.
 */
import { randomUUID } from 'node:crypto';
import { APP_VERSION, LEADERBOARD_SIZE, MAX_CLEARED, MAX_SPEED, OLD_WIN_WAVE, WIN_WAVE, isBoardTowers, isCleanName, type BoardEntry, type LeaderboardEntry } from '@code-freeze/shared';
import type { RunReport } from './game';

export interface RunRecord extends BoardEntry {
  id: string;
  season: number;
  version: string;
}

export interface LeaderboardStore {
  readonly persistent: boolean;
  /** 그 시즌의 상위 limit 개 (순위대로) */
  top(season: number, limit: number): Promise<RunRecord[]>;
  /** 기록이 있는 시즌들 */
  seasons(): Promise<number[]>;
  save(r: RunRecord): Promise<void>;
  close(): Promise<void>;
}

/** 순위표에 보여 주는 개수 */
export const BOARD_SIZE = LEADERBOARD_SIZE;
/** 저장을 다시 시도하는 간격 */
const RETRY_MS = 15_000;
/** 저장하지 못하고 쌓아 둘 수 있는 기록 수 (넘치면 오래된 것부터 버린다: 메모리를 지킨다) */
const MAX_PENDING = 500;

export function compareRuns(a: BoardEntry, b: BoardEntry): number {
  return b.cleared - a.cleared || b.lives - a.lives || b.kills - a.kills || a.endedAt - b.endedAt;
}

/** 서버가 만든 기록인지 한 번 더 확인 (저장소에서 읽은 값에도 쓴다) */
export function isValidEntry(e: BoardEntry): boolean {
  return (
    isCleanName(e.name) &&
    Number.isInteger(e.cleared) &&
    e.cleared >= 1 &&
    e.cleared <= MAX_CLEARED &&
    Number.isInteger(e.lives) &&
    e.lives >= 0 &&
    Number.isInteger(e.kills) &&
    e.kills >= 0 &&
    // 프리즈 성공: 지금은 30 스프린트, 0.1.x 는 10 스프린트였다 (예전 기록도 읽을 수 있게)
    (e.won ? e.cleared >= OLD_WIN_WAVE : e.cleared < WIN_WAVE) &&
    Number.isFinite(e.endedAt) &&
    (e.towers === undefined || isBoardTowers(e.towers))
  );
}

export class MemoryStore implements LeaderboardStore {
  readonly persistent = false;
  private rows: RunRecord[] = [];
  async top(season: number, limit: number): Promise<RunRecord[]> {
    return this.rows.filter((r) => r.season === season).sort(compareRuns).slice(0, limit);
  }
  async save(r: RunRecord): Promise<void> {
    if (!this.rows.some((x) => x.id === r.id)) this.rows.push(r);
  }
  async seasons(): Promise<number[]> {
    return [...new Set(this.rows.map((r) => r.season))].sort((a, b) => a - b);
  }
  async close(): Promise<void> {}
}

export class Leaderboard {
  private entries: RunRecord[] = [];
  private pending: RunRecord[] = [];
  private retry: NodeJS.Timeout | null = null;
  ready = false;

  constructor(
    private readonly store: LeaderboardStore,
    readonly season: number,
  ) {}

  get persistent(): boolean {
    return this.store.persistent;
  }

  /** 저장소에서 지금 시즌의 상위 기록을 읽는다. 실패하면 잠시 뒤 다시 (그동안 새 기록은 메모리에 쌓인다) */
  async init(): Promise<void> {
    try {
      const rows = (await this.store.top(this.season, BOARD_SIZE)).filter(isValidEntry);
      const ids = new Set(this.entries.map((e) => e.id));
      this.entries = [...this.entries, ...rows.filter((r) => !ids.has(r.id))].sort(compareRuns).slice(0, BOARD_SIZE);
      this.ready = true;
    } catch (err) {
      console.error('[leaderboard] 불러오기 실패, 다시 시도합니다', err instanceof Error ? err.message : err);
      setTimeout(() => void this.init(), RETRY_MS).unref();
    }
  }

  /** 순위표 응답의 줄들 (순위를 붙여서). 저장소 id·시즌은 내보내지 않는다 */
  top(): LeaderboardEntry[] {
    return toEntries(this.entries);
  }

  private seasonCache: { at: number; list: number[] } | null = null;
  private seasonLoad: Promise<number[] | null> | null = null;
  private seasonFailAt = 0;
  /**
   * 기록이 있는 시즌들 (지금 시즌은 늘 들어 있다). 1분 동안 들고 있고, 한 번에 하나만 읽는다.
   * 저장소가 실패하면 30초 동안 다시 묻지 않고, 아는 것이 없으면 null (화면은 지금 시즌만 보여 준다)
   */
  async seasons(now = Date.now()): Promise<number[] | null> {
    const withCurrent = (list: number[]): number[] => [...new Set([...list, this.season])].filter((n) => Number.isInteger(n) && n >= 0 && n <= this.season).sort((a, b) => a - b);
    if (this.seasonCache && now - this.seasonCache.at < 60_000) return this.seasonCache.list;
    if (now - this.seasonFailAt < 30_000) return this.seasonCache?.list ?? null;
    this.seasonLoad ??= this.store
      .seasons()
      .then((list) => {
        this.seasonCache = { at: Date.now(), list: withCurrent(list) };
        return this.seasonCache.list;
      })
      .catch((err) => {
        console.error('[leaderboard] 시즌 목록을 읽지 못했습니다', err instanceof Error ? err.message : err);
        this.seasonFailAt = Date.now();
        return this.seasonCache?.list ?? null;
      })
      .finally(() => (this.seasonLoad = null));
    return this.seasonLoad;
  }

  private past = new Map<number, { at: number; entries: LeaderboardEntry[] } | Promise<LeaderboardEntry[]>>();
  /** 지난 시즌의 순위표: 저장소에서 한 번 읽어 10분 동안 들고 있는다 (같은 것을 동시에 물어도 한 번만 읽는다) */
  async pastTop(season: number, now = Date.now()): Promise<LeaderboardEntry[]> {
    const hit = this.past.get(season);
    if (hit && !(hit instanceof Promise) && now - hit.at < 10 * 60_000) return hit.entries;
    if (hit instanceof Promise) return hit;
    const load = this.store
      .top(season, BOARD_SIZE)
      .then((rows) => {
        const entries = toEntries(rows.filter(isValidEntry).sort(compareRuns));
        this.past.set(season, { at: Date.now(), entries });
        return entries;
      })
      .catch((err) => {
        this.past.delete(season);
        throw err;
      });
    this.past.set(season, load);
    return load;
  }

  /**
   * 판 하나를 남긴다. 스프린트를 하나도 막지 못한 판, 서버 시간으로 말이 안 되는 판(빨리 감기 상한 MAX_SPEED 를 넘는 판)은 남기지 않는다.
   * 순위표에 들면 몇 등인지 돌려준다.
   */
  record(r: RunReport, now = Date.now()): number | null {
    if (r.cleared < 1) return null;
    if (r.simSeconds > r.wallSeconds * MAX_SPEED + 5) {
      console.warn('[leaderboard] 서버 시간보다 빠른 판을 버렸습니다', r.simSeconds, r.wallSeconds);
      return null;
    }
    const rec: RunRecord = {
      id: randomUUID(),
      season: this.season,
      version: APP_VERSION,
      name: r.name,
      cleared: r.cleared,
      lives: r.lives,
      kills: r.kills,
      won: r.won,
      endedAt: now,
      towers: r.towers,
    };
    if (!isValidEntry(rec)) return null;
    this.pending.push(rec);
    if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
    void this.flush();
    this.entries.push(rec);
    this.entries.sort(compareRuns);
    const rank = this.entries.indexOf(rec);
    this.entries = this.entries.slice(0, BOARD_SIZE);
    return rank >= 0 && rank < BOARD_SIZE ? rank + 1 : null;
  }

  private running: Promise<void> | null = null;
  /** 저장 중이면 그 저장이 끝나기를 기다린다 (같은 저장을 두 번 돌리지 않는다) */
  flush(): Promise<void> {
    this.running ??= this.doFlush().finally(() => (this.running = null));
    return this.running;
  }
  private async doFlush(): Promise<void> {
    try {
      while (this.pending.length) {
        await this.store.save(this.pending[0]!);
        this.pending.shift();
      }
    } catch (err) {
      console.error('[leaderboard] 저장 실패, 다시 시도합니다', err instanceof Error ? err.message : err);
      if (!this.retry) {
        this.retry = setTimeout(() => {
          this.retry = null;
          void this.flush();
        }, RETRY_MS);
        this.retry.unref();
      }
    }
  }

  /** 종료할 때: 남은 기록을 마저 쓰고 저장소를 닫는다 */
  async close(): Promise<void> {
    if (this.retry) clearTimeout(this.retry);
    // 돌고 있는 저장을 기다린 뒤, 남은 것을 몇 번 더 시도한다 (index.ts 가 전체 시간에 상한을 둔다)
    for (let i = 0; i < 3 && (this.running || this.pending.length); i++) await this.flush();
    if (this.retry) clearTimeout(this.retry);
    await this.store.close();
  }
}

function toEntries(rows: readonly RunRecord[]): LeaderboardEntry[] {
  return rows.map(({ name, cleared, lives, kills, won, endedAt, towers, version }, i) => ({
      rank: i + 1,
      name,
      cleared,
      lives,
      kills,
      won,
      endedAt,
      ...(towers ? { towers } : {}),
      ...(version ? { version } : {}),
    }));
}
