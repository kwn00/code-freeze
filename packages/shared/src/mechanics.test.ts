/** 0.2.0 의 규칙: 해금, 야근, 얼림, 줄 뚫기, 튕기기, 사라지기, 낳기, 빨라지기, 버그 수 상한, 퇴근 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES, TOWERS, WAVES, WIN_WAVE, hpScaleAt, waveAt } from './content';
import { MAX_ENEMIES, build, clearedOf, isPhased, isUnlocked, newGame, retire, startWave, step, type Enemy, type State } from './sim';
import { parseClientMsg } from './protocol';

function enemy(s: State, kind: Enemy['kind'], dist: number, hp?: number): Enemy {
  const e: Enemy = { id: s.nextId++, kind, hp: hp ?? ENEMIES[kind].hp, maxHp: hp ?? ENEMIES[kind].hp, dist, slow: 1, burnDps: 0, burnLeft: 0, flash: 0, stunLeft: 0, age: 0 };
  s.enemies.push(e);
  return e;
}
function waveState(): State {
  const s = newGame();
  s.status = 'wave';
  s.wave = 20;
  s.money = 1e6;
  return s;
}

test('새 타워는 정해진 스프린트부터 지을 수 있고, 서버가 확인한다', () => {
  const s = newGame();
  s.money = 1e6;
  assert.equal(isUnlocked(s, 'regex'), false);
  assert.equal(build(s, 'regex', 0, 0), null, '해금 전에는 못 짓는다');
  s.wave = (TOWERS.regex.unlock ?? 1) - 1; // 짓는 중: 다음 스프린트가 해금 스프린트
  assert.ok(build(s, 'regex', 0, 0));
  assert.equal(build(s, 'lb', 8, 0), null);
});

test('30 스프린트 뒤에도 웨이브가 끝없이 나오고, 같은 번호면 언제나 같다 (결정론)', () => {
  assert.equal(WAVES.length, WIN_WAVE);
  for (const n of [31, 35, 40, 77, 200]) {
    assert.deepEqual(waveAt(n), waveAt(n));
    assert.ok(waveAt(n).groups.length >= 3);
    assert.match(waveAt(n).name, /야근/);
  }
  assert.ok(waveAt(35).groups.some((g) => ENEMIES[g.kind].boss), '야근 5일마다 보스');
  assert.ok(hpScaleAt(40) > hpScaleAt(30) * 1.5, '야근은 가파르게');
  const s = newGame();
  s.wave = 30;
  assert.ok(startWave(s));
  assert.equal(s.wave, 31);
});

test('30 스프린트를 막으면 프리즈 성공 알림이 오고 판은 이어진다', () => {
  const s = newGame();
  s.wave = 29;
  startWave(s);
  s.queue = [];
  s.events.length = 0;
  step(s);
  assert.equal(s.status, 'build');
  assert.ok(s.events.some((e) => e.t === 'freeze_done'));
});

test('퇴근: 막은 스프린트까지로 끝난다 (웨이브 중이면 그 웨이브는 빼고)', () => {
  const s = newGame();
  s.wave = 12;
  assert.ok(retire(s));
  assert.equal(s.status, 'retired');
  assert.equal(clearedOf(s), 12);
  assert.equal(retire(s), false, '한 번만');
  const w = newGame();
  w.wave = 12;
  startWave(w);
  retire(w);
  assert.equal(clearedOf(w), 12);
  assert.equal(build(w, 'log', 0, 0), null, '끝난 판은 바꿀 수 없다');
  assert.deepEqual(parseClientMsg('{"t":"retire"}'), { t: 'retire' });
});

test('코드 프리즈는 둘레를 얼리고(보스는 절반), 얼면 움직이지 않는다', () => {
  const s = waveState();
  const t = build(s, 'freeze', 2, 1)!;
  const bug = enemy(s, 'bug', 3, 1e6); // (1.5, 2.5) 근처: 사거리 안
  const boss = enemy(s, 'boss_bug', 3.2, 1e6);
  step(s);
  const stun = TOWERS.freeze.levels[t.level]!.stun!;
  assert.ok(bug.stunLeft > stun - 0.1, `버그 ${bug.stunLeft}`);
  assert.ok(boss.stunLeft > 0 && boss.stunLeft <= stun / 2 + 0.01, `보스 ${boss.stunLeft}`);
  const d = bug.dist;
  step(s);
  assert.equal(bug.dist, d, '얼어 있는 동안 멈춤');
});

test('정규표현식은 한 줄 위의 버그를 모두 맞힌다', () => {
  const s = waveState();
  s.wave = 6;
  build(s, 'regex', 4, 3); // 아래로 길(4,5) 줄 위: (1..7,5) 가로 줄의 위쪽
  // (7,2)→(7,5) 세로 구간에 셋을 세워 두고, 타워 (6,4) 에서 쏘면 세로로 뚫린다
  const s2 = waveState();
  build(s2, 'regex', 7, 6);
  const hits = [enemy(s2, 'bug', 9.0, 1e6), enemy(s2, 'bug', 10.0, 1e6), enemy(s2, 'bug', 11.0, 1e6)];
  step(s2);
  const hurt = hits.filter((e) => e.hp < 1e6).length;
  assert.ok(hurt >= 2, `줄 위에서 맞은 수 ${hurt}`);
});

test('로드 밸런서는 맞히고 가까운 버그로 튕긴다', () => {
  const s = waveState();
  build(s, 'lb', 2, 1);
  const es = [enemy(s, 'bug', 3, 1e6), enemy(s, 'bug', 4, 1e6), enemy(s, 'bug', 5, 1e6), enemy(s, 'bug', 6, 1e6)];
  step(s);
  assert.ok(es.filter((e) => e.hp < 1e6).length >= 3);
});

test('깨지는 테스트는 사라진 동안 겨냥되지 않는다 (둘레 공격은 맞는다)', () => {
  const s = waveState();
  build(s, 'ai', 2, 1);
  const f = enemy(s, 'flaky_test', 3, 1e6);
  f.age = ENEMIES.flaky_test.phase![0] + 0.1; // 사라진 때
  assert.equal(isPhased(f), true);
  step(s);
  assert.equal(f.hp, 1e6, 'AI 에이전트가 겨냥하지 못한다');
  const s2 = waveState();
  build(s2, 'firewall', 2, 1);
  const f2 = enemy(s2, 'flaky_test', 2.5, 1e6);
  f2.age = ENEMIES.flaky_test.phase![0] + 0.1;
  step(s2);
  assert.ok(f2.hp < 1e6, '방화벽은 맞힌다');
});

test('레거시 코드는 걸으며 오타를 낳고, 레이스 컨디션은 다치면 빨라진다', () => {
  const s = waveState();
  const boss = enemy(s, 'legacy_code', 2, 1e9);
  for (let i = 0; i < 30 * (ENEMIES.legacy_code.spawns!.every + 0.2); i++) step(s);
  assert.ok(s.enemies.some((e) => e.kind === 'typo'), '오타가 나왔다');
  assert.ok(boss.hp > 0);
  const r = waveState();
  const fast = enemy(r, 'race_condition', 2, 100);
  const slow = enemy(r, 'race_condition', 2, 100);
  fast.hp = 40;
  step(r);
  assert.ok(fast.dist - 2 > (slow.dist - 2) * 1.5);
});

test('맵의 버그 수에는 상한이 있다 (서버 계산량·전송량을 지킨다)', () => {
  const s = waveState();
  for (let i = 0; i < MAX_ENEMIES + 50; i++) s.queue.push({ at: 0, kind: 'typo' });
  step(s);
  assert.ok(s.enemies.length <= MAX_ENEMIES);
});
