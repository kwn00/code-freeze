import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_LIMIT_MS, RESUME_WINDOW_MS, START_MONEY, TOWERS, type ServerMsg, type Snapshot } from '@code-freeze/shared';
import { Game, GameManager, type RunReport } from './game';
import { Leaderboard, MemoryStore, isValidEntry } from './leaderboard';

function setup(record: (r: RunReport) => Promise<number | null> = async () => null) {
  const out: ServerMsg[] = [];
  const g = new Game('tester', (m) => out.push(m), record, 0);
  const snaps = (): Snapshot[] => out.filter((m): m is Snapshot => m.t === 'state');
  // 타워는 바뀔 때만 오므로, 마지막으로 받은 타워 목록을 함께 돌려준다
  const last = (): Snapshot & { towers: NonNullable<Snapshot['towers']> } => {
    const all = snaps();
    return { ...all.at(-1)!, towers: all.filter((m) => m.towers).at(-1)?.towers ?? [] };
  };
  return { g, out, last };
}

test('클라이언트는 의도만 보내고, 돈은 서버가 계산한다', () => {
  const { g, last } = setup();
  g.handle({ t: 'build', kind: 'log', col: 0, row: 0 });
  g.tick(0);
  assert.equal(last().money, START_MONEY - TOWERS.log.levels[0]!.cost);
  assert.equal(last().towers.length, 1);
  // 길 위, 이미 지은 칸, 돈이 모자란 짓기는 서버가 무시한다
  g.handle({ t: 'build', kind: 'log', col: 1, row: 0 });
  g.handle({ t: 'build', kind: 'log', col: 0, row: 0 });
  for (let i = 0; i < 10; i++) g.handle({ t: 'build', kind: 'ai', col: 8, row: i });
  g.tick(0);
  assert.equal(last().towers.length, 1);
  assert.ok(last().money >= 0);
});

test('웨이브는 서버 틱으로만 흐르고, 빠르기는 ×3 을 넘지 않는다', () => {
  const { g } = setup();
  g.handle({ t: 'wave' });
  g.handle({ t: 'speed', s: 3 });
  for (let i = 0; i < 30; i++) g.tick(0);
  assert.ok(Math.abs(g.state.time - 3) < 1e-6, `서버 1초(30틱)에 sim 3초: ${g.state.time}`);
});

test('멈추면 시간이 흐르지 않고, 멈춘 동안 웨이브를 시작하지 못한다', () => {
  const { g } = setup();
  g.handle({ t: 'pause', on: true });
  g.handle({ t: 'wave' });
  assert.equal(g.state.status, 'build');
  g.handle({ t: 'pause', on: false });
  g.handle({ t: 'wave' });
  g.handle({ t: 'pause', on: true });
  const t = g.state.time;
  for (let i = 0; i < 30; i++) g.tick(0);
  assert.equal(g.state.time, t);
});

test('끊기면 멈추고, 다시 붙으면 멈춤 상태로 이어 간다. 오래 끊기면 닫는다', () => {
  const { g } = setup();
  g.handle({ t: 'wave' });
  g.tick(0);
  g.detach(1000);
  const t = g.state.time;
  for (let i = 0; i < 30; i++) g.tick(1000);
  assert.equal(g.state.time, t, '끊긴 동안 멈춤');
  assert.equal(g.expired(1000 + RESUME_WINDOW_MS - 1), null);
  const out: ServerMsg[] = [];
  g.attach((m) => out.push(m), 2000);
  assert.equal(g.paused, true);
  assert.equal(out[0]?.t, 'state');
  g.detach(3000);
  assert.equal(g.expired(3000 + RESUME_WINDOW_MS + 1), 'away');
});

test('아무것도 안 하면 닫힌다 (서버 메모리를 붙잡아 두지 못한다)', () => {
  const { g } = setup();
  assert.equal(g.expired(IDLE_LIMIT_MS + 1), 'idle');
});

test('판이 끝나면 결과를 한 번만 남기고 보낸다', async () => {
  const reports: RunReport[] = [];
  const { g, out } = setup(async (r) => {
    reports.push(r);
    return 1;
  });
  g.handle({ t: 'wave' });
  for (let i = 0; i < 30 * 600 && g.state.status !== 'build'; i++) g.tick(i * 33);
  // 타워가 없어서 새어 나가지만 첫 웨이브만으로는 지지 않는다 → 계속
  while ((g.state.status as string) === 'build') {
    g.handle({ t: 'wave' });
    for (let i = 0; i < 30 * 600 && (g.state.status as string) === 'wave'; i++) g.tick(1e6);
  }
  assert.equal(g.state.status, 'lost');
  for (let i = 0; i < 5; i++) g.tick(1e6);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reports.length, 1);
  assert.equal(reports[0]!.won, false);
  assert.equal(out.filter((m) => m.t === 'result').length, 1);
});

test('리더보드: 서버가 만든 기록만, 순위대로, 스프린트 0 은 제외', () => {
  const lb = new Leaderboard(new MemoryStore(), 0);
  const base = { name: 'a', won: false, lives: 5, kills: 10, simSeconds: 100, wallSeconds: 100, towers: [[0, 2], [1, 0]] as [number, number][] };
  assert.equal(lb.record({ ...base, cleared: 0 }), null);
  assert.equal(lb.record({ ...base, cleared: 3 }), 1);
  assert.equal(lb.record({ ...base, name: 'b', cleared: 5 }), 1);
  assert.equal(lb.record({ ...base, name: 'c', cleared: 5, lives: 1 }), 2);
  // 서버 시간보다 빠른 판(빨리 감기 ×3 초과)은 버린다
  assert.equal(lb.record({ ...base, cleared: 9, simSeconds: 1000, wallSeconds: 10 }), null);
  // 이기지 않았는데 이겼다고 적힌 판, 이상한 이름은 버린다
  assert.equal(lb.record({ ...base, cleared: 3, won: true }), null);
  assert.equal(lb.record({ ...base, cleared: 3, name: '<b>' }), null);
  assert.deepEqual(lb.top().map((e) => e.name), ['b', 'c', 'a']);
});

test('리더보드: 종료할 때 돌고 있던 저장을 기다리고 남은 기록까지 쓴 뒤 저장소를 닫는다', async () => {
  const saved: string[] = [];
  let closed = false;
  const store = {
    persistent: true,
    top: async () => [],
    save: async (r: { name: string }) => {
      await new Promise((res) => setTimeout(res, 30));
      if (closed) throw new Error('closed');
      saved.push(r.name);
    },
    close: async () => {
      closed = true;
    },
  };
  const lb = new Leaderboard(store as never, 0);
  const base = { won: false, lives: 5, kills: 10, simSeconds: 100, wallSeconds: 100, cleared: 2, towers: [] as [number, number][] };
  for (const name of ['a', 'b', 'c']) lb.record({ ...base, name });
  await lb.close();
  assert.deepEqual(saved, ['a', 'b', 'c']);
  assert.equal(closed, true);
});

test('판 하나의 오류는 그 판만 닫고 소켓 정리 콜백을 부른다', () => {
  const expired: string[] = [];
  const m = new GameManager((_g, why) => expired.push(why));
  const g = new Game('x', () => {}, async () => null, 0);
  g.tick = () => {
    throw new Error('boom');
  };
  m.add(g);
  m.tickAll(0);
  m.stop();
  assert.equal(m.count, 0);
  assert.deepEqual(expired, ['idle']);
});

test('0.2.0: 퇴근하면 막은 스프린트로 결과를 남긴다', async () => {
  const reports: RunReport[] = [];
  const { g, out } = setup(async (r) => {
    reports.push(r);
    return 3;
  });
  g.state.wave = 33;
  g.handle({ t: 'retire' });
  g.tick(1e6);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reports.length, 1);
  assert.equal(reports[0]!.cleared, 33);
  assert.equal(reports[0]!.won, true, '30 스프린트를 넘겼으면 프리즈 성공');
  const res = out.find((m) => m.t === 'result');
  assert.ok(res && res.t === 'result' && res.result.reason === 'retired' && res.result.rank === 3);
});

test('0.2.0: 다시 시작하거나 판이 닫혀도 막은 스프린트는 기록된다 (결과 메시지는 보내지 않는다)', async () => {
  const reports: RunReport[] = [];
  const rec = async (r: RunReport): Promise<number | null> => {
    reports.push(r);
    return null;
  };
  const { g, out } = setup(rec);
  g.state.wave = 7;
  g.handle({ t: 'restart' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reports.at(-1)?.cleared, 7);
  assert.equal(out.filter((m) => m.t === 'result').length, 0);
  assert.equal(g.state.wave, 0);
  // 닫히는 판
  const m = new GameManager();
  const g2 = new Game('y', () => {}, rec, 0);
  g2.state.wave = 4;
  m.add(g2);
  g2.detach(0);
  m.tickAll(10 * 60 * 1000 + 1000);
  m.stop();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reports.at(-1)?.cleared, 4);
});

test('리더보드: 0.1.x 의 프리즈 성공 기록(10 스프린트)은 그대로 읽고, 30 스프린트부터는 반드시 성공', () => {
  const lb = new Leaderboard(new MemoryStore(), 0);
  const base = { name: 'a', lives: 5, kills: 10, simSeconds: 100, wallSeconds: 100, towers: [] as [number, number][] };
  assert.equal(lb.record({ ...base, cleared: 30, won: false }), null, '30 인데 성공이 아니면 버린다');
  assert.equal(lb.record({ ...base, cleared: 31, won: true }), 1);
  assert.ok(lb.record({ ...base, cleared: 10, won: false }));
});

test('리더보드: 저장소에서 읽은 0.1.x 기록(10 스프린트 성공)도 모양 검사를 통과한다', () => {
  assert.equal(isValidEntry({ name: '옛기록', cleared: 10, lives: 3, kills: 100, won: true, endedAt: 1 }), true);
  assert.equal(isValidEntry({ name: '옛기록', cleared: 9, lives: 3, kills: 100, won: true, endedAt: 1 }), false);
});

test('서버가 꺼질 때 진행 중인 판도 기록한다', async () => {
  const reports: RunReport[] = [];
  const m = new GameManager();
  const g = new Game('z', () => {}, async (r) => {
    reports.push(r);
    return null;
  }, 0);
  g.state.wave = 9;
  m.add(g);
  m.finishAll(1000);
  m.stop();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reports.length, 1);
  assert.equal(reports[0]!.cleared, 9);
});

test('시즌: 지난 시즌 순위표는 저장소에서 읽고, 시즌 목록에는 지금 시즌이 늘 들어 있다', async () => {
  const store = new MemoryStore();
  const base = { lives: 3, kills: 5, won: false, endedAt: 1, version: '0.1.1' };
  await store.save({ ...base, id: 'a', season: 0, name: '옛1', cleared: 5 });
  await store.save({ ...base, id: 'b', season: 0, name: '옛2', cleared: 9 });
  await store.save({ ...base, id: 'c', season: 0, name: '<x>', cleared: 9 });
  const lb = new Leaderboard(store, 1);
  await lb.init();
  assert.deepEqual(lb.top(), [], '시즌 1 은 비어 있다');
  assert.deepEqual(await lb.seasons(), [0, 1]);
  const past = await lb.pastTop(0);
  assert.deepEqual(past.map((e) => [e.rank, e.name]), [[1, '옛2'], [2, '옛1']], '모양이 틀린 기록은 빼고 순위대로');
  // 지난 시즌을 읽는 동안 지금 시즌 기록은 섞이지 않는다
  lb.record({ name: '새', won: false, cleared: 2, lives: 5, kills: 1, simSeconds: 10, wallSeconds: 10, towers: [] });
  assert.deepEqual(lb.top().map((e) => e.name), ['새']);
  assert.equal((await lb.pastTop(0)).length, 2);
});

test('시즌: 저장소가 시즌 목록을 못 읽으면 null (지금 시즌 순위표는 그대로 답한다)', async () => {
  const store = new MemoryStore();
  store.seasons = async () => {
    throw new Error('db down');
  };
  const lb = new Leaderboard(store, 1);
  assert.equal(await lb.seasons(), null);
});
