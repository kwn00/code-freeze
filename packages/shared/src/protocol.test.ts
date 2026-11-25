import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMsg } from './protocol';
import { sanitizeName } from './names';

const TOKEN = 'a'.repeat(40);

test('올바른 의도만 받는다', () => {
  assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'build', kind: 'log', col: 0, row: 0 })), { t: 'build', kind: 'log', col: 0, row: 0 });
  assert.deepEqual(parseClientMsg('{"t":"wave"}'), { t: 'wave' });
  assert.deepEqual(parseClientMsg('{"t":"speed","s":3}'), { t: 'speed', s: 3 });
  assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'hello', v: 1, token: TOKEN, name: '버그헌터' })), { t: 'hello', v: 1, token: TOKEN, name: '버그헌터' });
});

test('돈·체력·시간 같은 값을 보내는 통로는 없고, 모양이 틀린 것은 버린다', () => {
  const bad = [
    'not json',
    '[]',
    'null',
    '{"t":"money","amount":9999}',
    '{"t":"lives","n":99}',
    '{"t":"step","n":1000}',
    '{"t":"build","kind":"nuke","col":0,"row":0}',
    '{"t":"build","kind":"log","col":-1,"row":0}',
    '{"t":"build","kind":"log","col":9,"row":0}',
    '{"t":"build","kind":"log","col":1.5,"row":0}',
    '{"t":"build","kind":"__proto__","col":0,"row":0}',
    '{"t":"speed","s":10}',
    '{"t":"speed","s":0}',
    '{"t":"pause","on":"yes"}',
    '{"t":"upgrade","id":-1}',
    '{"t":"sell","id":"1"}',
    '{"t":"hello","v":1,"token":"short","name":"x"}',
    `{"t":"hello","v":1,"token":"${TOKEN}","name":"x","resume":"../../etc"}`,
  ];
  for (const raw of bad) assert.equal(parseClientMsg(raw), null, raw);
});

test('이름은 정리해서 쓴다 (보이지 않는 글자·태그·너무 긴 이름)', () => {
  assert.equal(sanitizeName('<script>alert(1)</script>'), 'scriptalert1');
  assert.equal(sanitizeName('ㅤㅤ'), 'anonymous');
  assert.equal(sanitizeName('   '), 'anonymous');
  assert.equal(sanitizeName('가'.repeat(30)), '가'.repeat(12));
  assert.equal(sanitizeName(123), 'anonymous');
  assert.equal(sanitizeName('a​b'), 'ab');
});
