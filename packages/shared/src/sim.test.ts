import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ENEMIES, PATH, ROWS, START_LIVES, START_MONEY, TOWERS, WAVES } from './content';
import { PATH_LENGTH, PATH_TILES, build, canBuildAt, newGame, pathPoint, sell, startWave, step, upgrade, type State } from './sim';

function runWave(s: State, maxSteps = 30 * 600): void {
  for (let i = 0; i < maxSteps && s.status === 'wave'; i++) step(s);
}

test('길은 꺾임점마다 가로나 세로로만 움직이고 맵 안에서 끝난다', () => {
  for (let i = 1; i < PATH.length; i++) {
    const [ax, ay] = PATH[i - 1]!;
    const [bx, by] = PATH[i]!;
    assert.ok(ax === bx || ay === by, `${i}번째 구간이 대각선`);
  }
  const [ex, ey] = PATH[PATH.length - 1]!;
  assert.ok(ex >= 0 && ex < COLS && ey >= 0 && ey < ROWS);
  assert.deepEqual(pathPoint(0), [PATH[0]![0] + 0.5, PATH[0]![1] + 0.5]);
  assert.deepEqual(pathPoint(PATH_LENGTH), [ex + 0.5, ey + 0.5]);
});

test('길 위에는 지을 수 없고, 같은 칸에 두 번 지을 수 없다', () => {
  const s = newGame();
  for (const key of PATH_TILES) {
    const [c, r] = key.split(',').map(Number) as [number, number];
    assert.equal(canBuildAt(s, c, r), false);
  }
  assert.ok(build(s, 'log', 0, 0));
  assert.equal(build(s, 'log', 0, 0), null);
  assert.equal(canBuildAt(s, -1, 0), false);
  assert.equal(canBuildAt(s, 0.5, 0), false);
});

test('돈이 모자라면 짓지도 올리지도 못하고, 웨이브가 시작된 뒤에 팔면 70% 를 돌려받는다', () => {
  const s = newGame();
  s.money = 10;
  assert.equal(build(s, 'ai', 0, 0), null);
  s.money = 1000;
  const t = build(s, 'log', 0, 0)!;
  assert.equal(s.money, 1000 - TOWERS.log.levels[0]!.cost);
  assert.ok(upgrade(s, t.id));
  assert.ok(upgrade(s, t.id));
  assert.equal(upgrade(s, t.id), false, '최대 단계');
  const spent = TOWERS.log.levels.reduce((a, l) => a + l.cost, 0);
  startWave(s); // 웨이브가 시작된 뒤에 팔면 70% (그 전에는 원가: 아래 테스트)
  const before = s.money;
  assert.ok(sell(s, t.id));
  assert.equal(s.money, before + Math.floor(spent * 0.7));
  assert.equal(s.towers.length, 0);
});

test('타워가 없으면 첫 웨이브 버그가 모두 prod 에 닿는다', () => {
  const s = newGame();
  assert.ok(startWave(s));
  assert.equal(startWave(s), false, '웨이브 중에는 다시 시작 못 함');
  runWave(s);
  const n = WAVES[0]!.groups.reduce((a, g) => a + g.count * ENEMIES[g.kind].leak, 0);
  assert.equal(s.lives, START_LIVES - n);
  assert.equal(s.status, 'build');
});

test('타워를 깔면 첫 웨이브를 하나도 새지 않고 막는다', () => {
  const s = newGame();
  build(s, 'log', 2, 1);
  build(s, 'log', 6, 3);
  startWave(s);
  runWave(s);
  assert.equal(s.lives, START_LIVES);
  assert.equal(s.status, 'build');
  assert.ok(s.money > START_MONEY - 100);
});

test('머지 충돌은 쓰러지면 버그 둘로 갈라진다', () => {
  const s = newGame();
  s.wave = 1;
  s.status = 'wave';
  s.queue = [{ at: 0, kind: 'merge_conflict' }];
  s.money = 0;
  step(s);
  const e = s.enemies[0]!;
  e.dist = 3;
  e.hp = 0;
  step(s);
  assert.equal(s.enemies.filter((x) => x.kind === 'bug').length, 2);
});

test('같은 입력이면 같은 결과 (결정론)', () => {
  const play = (): string => {
    const s = newGame();
    build(s, 'log', 2, 1);
    build(s, 'duck', 6, 3);
    startWave(s);
    runWave(s);
    return JSON.stringify([s.lives, s.money, s.kills, s.time.toFixed(4)]);
  };
  assert.equal(play(), play());
});

test('적당한 전략으로 10 웨이브를 모두 막을 수 있다 (밸런스 확인)', () => {
  const s = newGame();
  // 돈이 되는 대로 정해진 자리에 짓고, 남으면 올린다
  const plan: [keyof typeof TOWERS, number, number][] = [
    ['log', 2, 1], ['log', 6, 3], ['duck', 4, 3], ['test', 2, 6], ['ai', 4, 7], ['log', 6, 6], ['firewall', 2, 4],
    ['test', 6, 9], ['ai', 0, 9], ['duck', 3, 9], ['firewall', 8, 7], ['ai', 5, 11], ['test', 3, 11],
  ];
  let i = 0;
  while (s.status === 'build') {
    for (;;) {
      const p = plan[i];
      if (p && s.money >= TOWERS[p[0]].levels[0]!.cost) {
        assert.ok(build(s, p[0], p[1], p[2]), `${p} 자리에 지을 수 있어야 함`);
        i++;
        continue;
      }
      const t = [...s.towers].sort((a, b) => a.level - b.level).find((x) => {
        const c = TOWERS[x.kind].levels[x.level + 1]?.cost;
        return c !== undefined && s.money >= c;
      });
      if (t && (!p || i >= 6)) {
        upgrade(s, t.id);
        continue;
      }
      break;
    }
    startWave(s);
    runWave(s);
  }
  assert.equal(s.status, 'won', `웨이브 ${s.wave} 에서 짐 (가용성 ${s.lives})`);
});

test('타워 없이 버티기만 하면 진다', () => {
  const s = newGame();
  while (s.status === 'build') {
    startWave(s);
    runWave(s);
  }
  assert.equal(s.status, 'lost');
});


test('웨이브 전에 지은 것은 웨이브 전에 팔면 원가로, 웨이브가 시작되면 70%', () => {
  const s = newGame();
  const cost = TOWERS.log.levels[0]!.cost;
  const up = TOWERS.log.levels[1]!.cost;
  // 짓고 바로 팔기: 원가
  let t = build(s, 'log', 0, 0)!;
  assert.ok(sell(s, t.id));
  assert.equal(s.money, START_MONEY);
  // 짓고 올리고 팔기: 둘 다 원가
  t = build(s, 'log', 0, 0)!;
  upgrade(s, t.id);
  sell(s, t.id);
  assert.equal(s.money, START_MONEY);
  // 웨이브를 넘긴 타워: 70%
  t = build(s, 'log', 0, 0)!;
  startWave(s);
  const before = s.money;
  sell(s, t.id);
  assert.equal(s.money, before + Math.floor(cost * 0.7));
  // 웨이브 중에 지은 것도 70%
  const t2 = build(s, 'log', 0, 0)!;
  const b2 = s.money;
  sell(s, t2.id);
  assert.equal(s.money, b2 + Math.floor(cost * 0.7));
  // 웨이브를 넘긴 타워를 다음 짓는 시간에 올렸다면: 올린 값만 원가
  s.status = 'build';
  const t3 = build(s, 'log', 0, 0)!;
  startWave(s);
  s.status = 'build';
  s.money = 1000;
  upgrade(s, t3.id);
  sell(s, t3.id);
  assert.equal(s.money, 1000 - up + up + Math.floor(cost * 0.7));
});
