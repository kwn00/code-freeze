/**
 * 밸런스: 실력이 다른 봇으로 난이도 곡선을 확인한다 (content.ts 의 DIFFICULTY 를 바꾸면 여기가 알려 준다).
 * - 잘하는 봇: 30 스프린트를 막고(프리즈 성공) 야근에 들어가지만, 야근은 결국 끝난다
 * - 대충 하는 봇(싼 타워, 2단계까지): 30 스프린트 전에 진다
 * - console.log() 만 짓는 봇: 30 스프린트 전에 진다 (새 타워와 섞어 써야 한다)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, TOWERS, WIN_WAVE, type TowerId } from './content';
import { PATH_TILES, build, canBuildAt, clearedOf, isUnlocked, newGame, startWave, step, upgrade, type State } from './sim';

const pathCells = [...PATH_TILES].map((k) => k.split(',').map(Number) as [number, number]).filter(([, r]) => r >= 0);
function bestSpot(s: State, kind: TowerId): [number, number] | null {
  const range = TOWERS[kind].levels[0]!.range;
  let best: [number, number] | null = null;
  let bestN = -1;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (!canBuildAt(s, c, r)) continue;
      let n = r * 0.05;
      for (const [pc, pr] of pathCells) if ((pc - c) ** 2 + (pr - r) ** 2 <= range * range) n++;
      if (n > bestN) {
        bestN = n;
        best = [c, r];
      }
    }
  return best;
}

/** 길을 가장 많이 덮는 칸에 돌아가며 짓고, 남으면 낮은 단계부터 올리는 봇 */
function play(rotation: TowerId[], maxLevel: number, towersPerWave: (w: number) => number, maxWave = 90): number {
  const s = newGame();
  let rot = 0;
  while (s.status === 'build' && s.wave < maxWave) {
    for (let guard = 0; guard < 300; guard++) {
      const kinds = rotation.filter((k) => isUnlocked(s, k));
      const kind = kinds[rot % kinds.length]!;
      const wantBuild = s.towers.length < towersPerWave(s.wave + 1);
      if (wantBuild && s.money >= TOWERS[kind].levels[0]!.cost) {
        const spot = bestSpot(s, kind);
        if (spot && build(s, kind, spot[0], spot[1])) {
          rot++;
          continue;
        }
      }
      const up = [...s.towers]
        .filter((t) => t.level < maxLevel)
        .sort((a, b) => a.level - b.level || b.row - a.row)
        .find((t) => {
          const c = TOWERS[t.kind].levels[t.level + 1]?.cost;
          return c !== undefined && s.money >= c;
        });
      if (up && (!wantBuild || s.money >= TOWERS[kind].levels[0]!.cost * 2)) {
        upgrade(s, up.id);
        continue;
      }
      break;
    }
    startWave(s);
    for (let k = 0; k < 30 * 1500 && (s.status as string) === 'wave'; k++) step(s);
  }
  return clearedOf(s);
}

const EXPERT = (): number => play(['log', 'test', 'duck', 'ai', 'firewall', 'regex', 'freeze', 'lb'], 3, (w) => Math.min(40, 2 + Math.floor(w * 0.9)));

test('잘하는 봇은 프리즈에 성공하고 야근에 들어가지만, 야근은 끝이 있다', () => {
  const cleared = EXPERT();
  assert.ok(cleared >= WIN_WAVE + 5, `막은 스프린트 ${cleared}`);
  assert.ok(cleared < WIN_WAVE + 30, `야근이 너무 길다: ${cleared}`);
});

test('보통 실력(3단계까지, 타워를 섞어 씀)이면 30 스프린트를 깰 수 있다', () => {
  const mid = play(['log', 'test', 'duck', 'ai', 'regex', 'freeze', 'lb', 'firewall'], 2, (w) => Math.min(40, 2 + Math.floor(w * 0.75)));
  assert.ok(mid >= WIN_WAVE, `보통: ${mid}`);
  const mid2 = play(['log', 'test', 'ai', 'duck', 'lb', 'regex'], 2, (w) => Math.min(40, 2 + Math.floor(w * 0.6)));
  assert.ok(mid2 >= WIN_WAVE, `보통(타워 적게): ${mid2}`);
});

test('대충 하는 봇은 프리즈 전에 지고, console.log() 만 짓는 봇은 잘하는 봇보다 못 간다', () => {
  const casual = play(['log', 'test', 'log', 'duck'], 1, (w) => Math.min(40, 2 + Math.floor(w * 0.6)));
  assert.ok(casual >= 3 && casual < 20, `대충: ${casual}`);
  const spam = play(['log'], 3, (w) => Math.min(60, 3 + w));
  assert.ok(spam >= 10 && spam < EXPERT() - 5, `log 만: ${spam}`);
});
