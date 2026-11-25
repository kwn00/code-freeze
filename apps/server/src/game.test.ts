import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_LIMIT_MS, RESUME_WINDOW_MS, START_MONEY, TOWERS, type ServerMsg, type Snapshot } from '@code-freeze/shared';
import { Game, type RunReport } from './game';
import { Leaderboard, MemoryStore } from './leaderboard';

function setup(record: (r: RunReport) => Promise<number | null> = async () => null) {
  const out: ServerMsg[] = [];
  const g = new Game('tester', (m) => out.push(m), record, 0);
  const last = (): Snapshot => out.filter((m): m is Snapshot => m.t === 'state').at(-1)!;
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
  while (g.state.status === 'build') {
    g.handle({ t: 'wave' });
    for (let i = 0; i < 30 * 600 && g.state.status === 'wave'; i++) g.tick(1e6);
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
  const base = { name: 'a', won: false, lives: 5, kills: 10, simSeconds: 100, wallSeconds: 100 };
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
