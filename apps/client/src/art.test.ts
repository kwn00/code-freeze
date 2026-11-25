import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_IDS, TOWER_IDS } from '@code-freeze/shared';
import { ENEMY_ART, PAL, TOWER_ART, PROD_SERVER, DEV, SHOT_ART } from './art';

test('그림은 모두 네모이고 팔레트에 있는 글자만 쓴다', () => {
  const all: [string, readonly string[]][] = [
    ...ENEMY_IDS.map((id) => [id, ENEMY_ART[id]] as [string, string[]]),
    ...TOWER_IDS.map((id) => [id, TOWER_ART[id]] as [string, string[]]),
    ...Object.entries(SHOT_ART).map(([k, v]) => [k, v!] as [string, string[]]),
    ['prod', PROD_SERVER],
    ['dev', DEV],
  ];
  for (const [name, rows] of all) {
    const w = rows[0]!.length;
    for (const r of rows) {
      assert.equal(r.length, w, `${name} 줄 길이`);
      for (const ch of r) assert.ok(ch === '.' || PAL[ch], `${name}: 팔레트에 없는 글자 ${ch}`);
    }
  }
  for (const id of TOWER_IDS) assert.equal(TOWER_ART[id].length, 14, `${id} 높이`);
});
