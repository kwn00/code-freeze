import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_TTL_MS, Pending } from './pending';

test('누른 값은 늦게 도착한 옛 상태에 밀리지 않고, 서버가 같은 값을 보내면 서버를 따른다', () => {
  const p = new Pending<number>();
  p.set(2, 0);
  assert.equal(p.shown(1, 50), 2, '옛 상태(×1)가 와도 ×2');
  assert.equal(p.shown(1, 120), 2);
  assert.equal(p.shown(2, 180), 2, '확인됨');
  assert.equal(p.peek(181), null, '확인되면 잊는다');
  assert.equal(p.shown(3, 200), 3, '그 뒤로는 서버 값');
});

test('서버가 끝내 받지 않으면 잠시 뒤 서버 값을 따른다', () => {
  const p = new Pending<boolean>();
  p.set(true, 0);
  assert.equal(p.shown(false, PENDING_TTL_MS - 1), true);
  assert.equal(p.shown(false, PENDING_TTL_MS + 1), false);
});

test('연달아 누르면 마지막 것을 기다린다', () => {
  const p = new Pending<number>();
  p.set(2, 0);
  p.set(3, 10);
  assert.equal(p.shown(2, 30), 3, '2 를 확인해도 3 을 기다린다');
  assert.equal(p.shown(3, 60), 3);
});
