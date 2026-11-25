/**
 * PostgreSQL 저장소 (Neon). DATABASE_URL 이 있을 때만 쓴다.
 *
 * - 만들 때 DB 에 접속하지 않는다. 테이블도 첫 사용 때 만들고, 실패하면 다음 사용 때 다시 시도한다
 *   (Neon 무료 DB 는 한동안 쓰지 않으면 잠들었다가 느리게 깨어난다. 그동안에도 게임 서버는 떠 있어야 한다).
 * - 쿼리는 전부 매개변수로 보낸다. 이름은 데이터로만 저장하고 SQL 문자열에 섞지 않는다.
 * - Neon 의 풀링 주소(-pooler, PgBouncer)는 접속 매개변수로 statement_timeout 을 받지 않고, 세션 설정이 다음 쿼리로 이어지지 않는다.
 *   그래서 모든 작업을 트랜잭션으로 감싸 그 안에서만 SET LOCAL 로 시간 제한을 건다 (Friday Deploy 와 같은 방식).
 * - TLS: 주소에 sslmode=require 가 있으면 pg 가 인증서 검증을 켠 채로 접속한다. 검증을 끄는 옵션은 쓰지 않는다.
 * - 기록은 지우지 않는다 (CLAUDE.md). DELETE·TRUNCATE·DROP 을 쓰지 않는다.
 */
import pg from 'pg';
import { isBoardTowers } from '@code-freeze/shared';
import type { LeaderboardStore, RunRecord } from './leaderboard';

const POOL_MAX = 2;
const CONNECT_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 10_000;
/** DB 가 응답 없이 멈춰도 약속이 영원히 남지 않게 */
const QUERY_TIMEOUT_MS = 15_000;
const IDLE_TIMEOUT_MS = 10_000;

/** leaderboard.ts 의 compareRuns 와 같은 순서. 클리어 시간이 없는 예전 기록(NULL)은 같은 점수 안에서 뒤로 */
const ORDER = 'cleared DESC, lives DESC, play_seconds ASC NULLS LAST, kills DESC, ended_at ASC, id COLLATE "C" ASC';

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS runs (
    id          text    PRIMARY KEY,
    season      integer NOT NULL,
    app_version text    NOT NULL,
    name        text    NOT NULL,
    cleared     integer NOT NULL,
    lives       integer NOT NULL,
    kills       integer NOT NULL,
    won         boolean NOT NULL,
    ended_at    bigint  NOT NULL
  )`;
/** 판이 끝날 때 서 있던 타워들 (0.1.1 에 더한 열). 예전 기록은 NULL 로 남는다: 기존 행은 건드리지 않는다 */
const ADD_TOWERS = `ALTER TABLE runs ADD COLUMN IF NOT EXISTS towers jsonb`;
/** 클리어 시간 (1.2.1 에 더한 열, 게임 안 초). 예전 기록은 NULL 로 남는다: 기존 행은 건드리지 않는다 */
const ADD_TIME = `ALTER TABLE runs ADD COLUMN IF NOT EXISTS play_seconds integer`;
const CREATE_INDEX = `CREATE INDEX IF NOT EXISTS runs_top ON runs (season, cleared DESC, lives DESC, kills DESC, ended_at ASC)`;

interface Row {
  id: string;
  season: number;
  app_version: string;
  name: string;
  cleared: number;
  lives: number;
  kills: number;
  won: boolean;
  ended_at: string;
  towers: unknown;
  play_seconds: number | null;
}

export function createPostgresStore(url: string): LeaderboardStore {
  const pool = new pg.Pool({
    connectionString: url,
    max: POOL_MAX,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    allowExitOnIdle: true,
  });
  // 풀의 유휴 연결 오류(DB 재시작 등)가 프로세스를 죽이지 않게
  pool.on('error', (err) => console.error('[db] idle client error', err.message));

  let schema: Promise<void> | null = null;

  async function tx<T>(work: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      const out = await work(c);
      await c.query('COMMIT');
      return out;
    } catch (err) {
      await c.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      c.release();
    }
  }

  function ensureSchema(): Promise<void> {
    schema ??= tx(async (c) => {
      await c.query(CREATE_TABLE);
      await c.query(ADD_TOWERS);
      await c.query(ADD_TIME);
      await c.query(CREATE_INDEX);
    }).catch((err) => {
      schema = null; // 다음 사용 때 다시
      throw err;
    });
    return schema;
  }

  return {
    persistent: true,
    async top(season, limit) {
      await ensureSchema();
      const { rows } = await tx((c) =>
        c.query<Row>(`SELECT id, season, app_version, name, cleared, lives, kills, won, ended_at, towers, play_seconds FROM runs WHERE season = $1 ORDER BY ${ORDER} LIMIT $2`, [season, limit]),
      );
      return rows.map(
        (r): RunRecord => ({
          id: r.id,
          season: r.season,
          version: r.app_version,
          name: r.name,
          cleared: r.cleared,
          lives: r.lives,
          kills: r.kills,
          won: r.won,
          endedAt: Number(r.ended_at),
          // 저장된 값도 모양을 확인하고 쓴다 (틀리면 타워 없이)
          ...(isBoardTowers(r.towers) ? { towers: r.towers } : {}),
          ...(r.play_seconds !== null ? { time: r.play_seconds } : {}),
        }),
      );
    },
    async save(r) {
      await ensureSchema();
      await tx((c) =>
        c.query(
          `INSERT INTO runs (id, season, app_version, name, cleared, lives, kills, won, ended_at, towers, play_seconds)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING`,
          [r.id, r.season, r.version, r.name, r.cleared, r.lives, r.kills, r.won, r.endedAt, r.towers ? JSON.stringify(r.towers) : null, r.time ?? null],
        ),
      );
    },
    async seasons() {
      await ensureSchema();
      const { rows } = await tx((c) => c.query<{ season: number }>('SELECT DISTINCT season FROM runs ORDER BY season'));
      return rows.map((r) => r.season);
    },
    async close() {
      await pool.end();
    },
  };
}
