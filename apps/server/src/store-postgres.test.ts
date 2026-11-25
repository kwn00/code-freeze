/**
 * PostgreSQL 저장소 테스트. TEST_DATABASE_URL 이 있을 때만 돈다 (없으면 건너뛴다).
 * 테스트마다 새 스키마를 만들어 그 안에서만 쓴다 (search_path). 운영 DB 주소를 넣지 말 것.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPostgresStore } from './store-postgres';
import { Leaderboard, type RunRecord } from './leaderboard';

const BASE = process.env.TEST_DATABASE_URL;
const opts = { skip: BASE ? false : 'TEST_DATABASE_URL 이 없어 건너뜀' };

async function freshSchema(): Promise<string> {
  const name = `t_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const c = new pg.Client({ connectionString: BASE });
  await c.connect();
  await c.query(`CREATE SCHEMA ${name}`);
  await c.end();
  const u = new URL(BASE!);
  u.searchParams.set('options', `-c search_path=${name}`);
  return u.toString();
}

const rec = (over: Partial<RunRecord>): RunRecord => ({
  id: `id-${Math.random()}`,
  season: 0,
  version: '0.1.1',
  name: 'a',
  cleared: 3,
  lives: 5,
  kills: 10,
  won: false,
  endedAt: 1000,
  ...over,
});

test('저장하고 순위대로 읽는다 (타워 포함)', opts, async () => {
  const store = createPostgresStore(await freshSchema());
  await store.save(rec({ name: 'low', cleared: 2 }));
  await store.save(rec({ name: 'top', cleared: 10, won: true, lives: 7, towers: [[0, 2], [4, 1]] }));
  await store.save(rec({ name: 'mid', cleared: 5 }));
  const rows = await store.top(0, 50);
  assert.deepEqual(rows.map((r) => r.name), ['top', 'mid', 'low']);
  assert.deepEqual(rows[0]!.towers, [[0, 2], [4, 1]]);
  assert.equal(rows[1]!.towers, undefined);
  await store.close();
});

test('0.1.0 의 표(towers 열 없음)와 그 기록을 그대로 두고 열을 더한다', opts, async () => {
  const url = await freshSchema();
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query(`CREATE TABLE runs (id text PRIMARY KEY, season integer NOT NULL, app_version text NOT NULL, name text NOT NULL,
    cleared integer NOT NULL, lives integer NOT NULL, kills integer NOT NULL, won boolean NOT NULL, ended_at bigint NOT NULL)`);
  await c.query(`INSERT INTO runs VALUES ('old', 0, '0.1.0', '옛기록', 4, 3, 50, false, 500)`);
  await c.end();
  const store = createPostgresStore(url);
  await store.save(rec({ name: 'new', cleared: 6, towers: [[1, 0]] }));
  const rows = await store.top(0, 50);
  assert.deepEqual(rows.map((r) => [r.name, r.version]), [['new', '0.1.1'], ['옛기록', '0.1.0']]);
  await store.close();
});

test('저장소에 이상한 값이 들어 있어도 화면에 내보내지 않는다', opts, async () => {
  const url = await freshSchema();
  const store = createPostgresStore(url);
  await store.save(rec({ name: 'ok', cleared: 4 }));
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query(`INSERT INTO runs (id, season, app_version, name, cleared, lives, kills, won, ended_at, towers) VALUES
    ('x1', 0, '0.1.1', '<script>', 9, 9, 9, false, 1, null),
    ('x2', 0, '0.1.1', 'bad', 99, 9, 9, false, 1, null),
    ('x3', 0, '0.1.1', 'tw', 8, 9, 9, false, 1, '[[99, 0]]')`);
  await c.end();
  const lb = new Leaderboard(store, 0);
  await lb.init();
  const names = lb.top().map((e) => e.name);
  assert.ok(!names.includes('<script>') && !names.includes('bad'), names.join(','));
  // 타워 값만 틀린 기록은 타워 없이 남는다
  assert.equal(lb.top().find((e) => e.name === 'tw')?.towers, undefined);
  await lb.close();
});

test('시즌 목록을 읽는다', opts, async () => {
  const store = createPostgresStore(await freshSchema());
  await store.save(rec({ season: 0 }));
  await store.save(rec({ season: 1 }));
  await store.save(rec({ season: 1 }));
  assert.deepEqual(await store.seasons(), [0, 1]);
  await store.close();
});
