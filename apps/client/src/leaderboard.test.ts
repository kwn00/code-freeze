import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEntry, findMine } from './leaderboard';

const ok = { rank: 1, name: '버그헌터', cleared: 10, lives: 5, kills: 300, won: true, endedAt: 1, towers: [[0, 2]], version: '0.1.1' };

test('서버에서 온 줄은 모양을 확인하고 쓴다', () => {
  assert.deepEqual(checkEntry(ok), ok);
  assert.equal(checkEntry({ ...ok, name: '<img src=x onerror=alert(1)>' }), null);
  assert.equal(checkEntry({ ...ok, cleared: 99 }), null);
  assert.equal(checkEntry({ ...ok, rank: 0 }), null);
  assert.equal(checkEntry(null), null);
  // 타워·버전만 틀리면 그것만 빼고 쓴다
  const bad = checkEntry({ ...ok, towers: [[42, 0]], version: '<b>' })!;
  assert.equal(bad.towers, undefined);
  assert.equal(bad.version, undefined);
});

test('내 기록은 순위가 아니라 내용으로 찾는다 (그 사이 밀렸어도)', () => {
  const a = { ...ok, towers: undefined, version: undefined };
  const rows = [
    { ...a, rank: 1, name: '남', kills: 1 },
    { ...a, rank: 2 },
    { ...a, rank: 3, kills: 9 },
  ];
  assert.equal(findMine(rows, { rank: 1, name: '버그헌터', cleared: 10, lives: 5, kills: 300 }), 2);
  assert.equal(findMine(rows, { rank: 1, name: '없음', cleared: 10, lives: 5, kills: 300 }), -1);
});
