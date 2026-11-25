/**
 * 게임 콘텐츠: 맵, 타워, 버그, 웨이브. 화면(DOM)을 쓰지 않는다 (단위 테스트에서 검사한다).
 * 새 타워·버그·웨이브는 이 파일에 데이터로 넣으면 된다.
 */

export const GAME_TITLE = 'CODE FREEZE';
export const GAME_TAGLINE = '코드 프리즈 전날 밤, prod 를 지켜라';

/** 맵 크기 (칸). 칸 하나 = 16 논리 픽셀. 세로 폰에 맞춘 세로 맵 */
export const COLS = 9;
export const ROWS = 13;
export const TILE = 16;

/** 버그가 걷는 길 (main 브랜치). 칸 좌표 꺾임점. 첫 점은 맵 위쪽 바깥에서 들어오고, 마지막 점이 prod 서버 */
export const PATH: readonly (readonly [number, number])[] = [
  [1, -1],
  [1, 2],
  [7, 2],
  [7, 5],
  [1, 5],
  [1, 8],
  [7, 8],
  [7, 10],
  [4, 10],
  [4, 12],
];

export const START_MONEY = 150;
/** prod 서버 가용성. 버그가 prod 에 닿을 때마다 그 버그의 피해만큼 줄고, 0 이 되면 장애 */
export const START_LIVES = 20;
/** 팔 때 돌려받는 비율 */
export const SELL_RATE = 0.7;

export type TowerId = 'log' | 'duck' | 'test' | 'ai' | 'firewall' | 'regex' | 'freeze' | 'lb';
export const TOWER_IDS: readonly TowerId[] = ['log', 'duck', 'test', 'ai', 'firewall', 'regex', 'freeze', 'lb'];

export interface TowerLevel {
  /** 이 단계로 짓거나 올리는 값 */
  cost: number;
  /** 한 번 맞힐 때 피해 */
  damage: number;
  /** 사거리 (칸) */
  range: number;
  /** 공격 간격 (초) */
  cooldown: number;
  /** 맞은 자리 둘레에 같은 피해 (칸). 0 이면 한 마리만 */
  splash?: number;
  /** 느리게: 속도를 이 배로 (러버덕) */
  slow?: number;
  /** 갑옷 무시 */
  pierce?: boolean;
  /** 화상: 초당 피해 (방화벽) */
  burn?: number;
  /** 얼림: 이 시간(초) 동안 멈춘다 (코드 프리즈. 보스는 절반) */
  stun?: number;
  /** 튕기기: 처음 맞힌 뒤 가까운 버그에게 이만큼 더 (로드 밸런서). 튕길 때마다 피해 ×0.8 */
  chain?: number;
}

export interface TowerDef {
  id: TowerId;
  name: string;
  /** 아래 버튼에 들어가는 짧은 이름 */
  short: string;
  icon: string;
  desc: string;
  /**
   * 'shot' = 탄을 쏜다, 'beam' = 바로 맞힌다, 'aura' = 둘레 전체에 계속,
   * 'line' = 대상 쪽으로 사거리 끝까지 곧게 뚫는다 (그 줄의 모든 버그), 'chain' = 맞히고 가까운 버그로 튕긴다
   */
  attack: 'shot' | 'beam' | 'aura' | 'line' | 'chain';
  /** 이 스프린트부터 지을 수 있다 (없으면 처음부터) */
  unlock?: number;
  levels: readonly TowerLevel[];
}

export const TOWERS: Record<TowerId, TowerDef> = {
  log: {
    id: 'log',
    name: 'console.log()',
    short: 'log()',
    icon: '🖨️',
    desc: '싸고 빠르게 한 마리씩',
    attack: 'shot',
    levels: [
      { cost: 50, damage: 6, range: 2.4, cooldown: 0.5 },
      { cost: 45, damage: 10, range: 2.6, cooldown: 0.42 },
      { cost: 80, damage: 16, range: 2.9, cooldown: 0.34 },
      { cost: 260, damage: 20, range: 3.0, cooldown: 0.3 },
    ],
  },
  duck: {
    id: 'duck',
    name: '러버덕',
    short: '러버덕',
    icon: '🦆',
    desc: '둘레의 버그를 느리게 (피해 조금)',
    attack: 'aura',
    levels: [
      { cost: 60, damage: 2, range: 1.6, cooldown: 0.5, slow: 0.6 },
      { cost: 55, damage: 3, range: 1.9, cooldown: 0.5, slow: 0.5 },
      { cost: 90, damage: 5, range: 2.2, cooldown: 0.5, slow: 0.4 },
      { cost: 200, damage: 9, range: 2.5, cooldown: 0.5, slow: 0.32 },
    ],
  },
  test: {
    id: 'test',
    name: '테스트 커버리지',
    short: '테스트',
    icon: '🧪',
    desc: '맞은 자리 둘레까지 터뜨린다',
    attack: 'shot',
    levels: [
      { cost: 90, damage: 12, range: 2.2, cooldown: 1.3, splash: 0.9 },
      { cost: 80, damage: 20, range: 2.4, cooldown: 1.15, splash: 1.1 },
      { cost: 130, damage: 34, range: 2.6, cooldown: 1.0, splash: 1.3 },
      { cost: 300, damage: 70, range: 2.8, cooldown: 0.85, splash: 1.5 },
    ],
  },
  ai: {
    id: 'ai',
    name: 'AI 에이전트',
    short: 'AI',
    icon: '🤖',
    desc: '멀리서 세게. 갑옷 무시',
    attack: 'beam',
    levels: [
      { cost: 130, damage: 40, range: 4.0, cooldown: 2.0, pierce: true },
      { cost: 120, damage: 70, range: 4.5, cooldown: 1.8, pierce: true },
      { cost: 180, damage: 120, range: 5.0, cooldown: 1.6, pierce: true },
      { cost: 380, damage: 260, range: 5.5, cooldown: 1.4, pierce: true },
    ],
  },
  firewall: {
    id: 'firewall',
    name: '방화벽',
    short: '방화벽',
    icon: '🔥',
    desc: '둘레를 태운다 (화상: 계속 피해)',
    attack: 'aura',
    levels: [
      { cost: 110, damage: 4, range: 1.3, cooldown: 0.5, burn: 6 },
      { cost: 100, damage: 6, range: 1.5, cooldown: 0.5, burn: 10 },
      { cost: 150, damage: 9, range: 1.7, cooldown: 0.5, burn: 16 },
      { cost: 320, damage: 16, range: 1.9, cooldown: 0.5, burn: 32 },
    ],
  },
  regex: {
    id: 'regex',
    name: '정규표현식',
    short: '정규식',
    icon: '🔣',
    desc: '한 줄로 뚫어서 줄 선 버그를 모두',
    attack: 'line',
    unlock: 6,
    levels: [
      { cost: 140, damage: 18, range: 3.2, cooldown: 1.4 },
      { cost: 120, damage: 30, range: 3.5, cooldown: 1.25 },
      { cost: 190, damage: 50, range: 3.8, cooldown: 1.1 },
      { cost: 360, damage: 95, range: 4.2, cooldown: 0.95 },
    ],
  },
  freeze: {
    id: 'freeze',
    name: '코드 프리즈',
    short: '프리즈',
    icon: '🧊',
    desc: '둘레를 잠깐 얼린다 (보스는 절반)',
    attack: 'aura',
    unlock: 11,
    levels: [
      { cost: 160, damage: 6, range: 1.5, cooldown: 3.0, stun: 0.8 },
      { cost: 140, damage: 10, range: 1.7, cooldown: 2.7, stun: 1.0 },
      { cost: 200, damage: 16, range: 1.9, cooldown: 2.4, stun: 1.2 },
      { cost: 380, damage: 30, range: 2.2, cooldown: 2.1, stun: 1.5 },
    ],
  },
  lb: {
    id: 'lb',
    name: '로드 밸런서',
    short: 'LB',
    icon: '📡',
    desc: '맞히고 가까운 버그로 튕긴다',
    attack: 'chain',
    unlock: 16,
    levels: [
      { cost: 180, damage: 22, range: 2.8, cooldown: 1.2, chain: 3 },
      { cost: 160, damage: 34, range: 3.0, cooldown: 1.1, chain: 4 },
      { cost: 230, damage: 52, range: 3.2, cooldown: 1.0, chain: 5 },
      { cost: 420, damage: 90, range: 3.5, cooldown: 0.9, chain: 7 },
    ],
  },
};

export type EnemyId =
  | 'bug'
  | 'off_by_one'
  | 'null_ptr'
  | 'merge_conflict'
  | 'mem_leak'
  | 'tech_debt'
  | 'typo'
  | 'flaky_test'
  | 'race_condition'
  | 'boss_bug'
  | 'god_class'
  | 'legacy_code'
  | 'spaghetti'
  | 'monolith';
export const ENEMY_IDS: readonly EnemyId[] = [
  'bug',
  'off_by_one',
  'null_ptr',
  'merge_conflict',
  'mem_leak',
  'tech_debt',
  'boss_bug',
  'god_class',
  // 0.2.0 에 더한 것 (통신 번호가 바뀌지 않게 뒤에 붙인다)
  'typo',
  'flaky_test',
  'race_condition',
  'legacy_code',
  'spaghetti',
  'monolith',
];

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  /** 칸/초 */
  speed: number;
  /** 맞을 때마다 피해에서 뺀다 (최소 1) */
  armor: number;
  /** 쓰러뜨리면 받는 스토리 포인트 */
  bounty: number;
  /** prod 에 닿으면 줄어드는 가용성 */
  leak: number;
  /** 쓰러질 때 나오는 것 */
  splits?: { kind: EnemyId; count: number };
  /** 초당 체력 회복 */
  regen?: number;
  /** 걸으면서 이만큼(초)마다 낳는 것 */
  spawns?: { kind: EnemyId; every: number };
  /** 이만큼(초)마다 반쯤 사라져서 겨냥되지 않는다 (깨지는 테스트): [보이는 시간, 사라진 시간] */
  phase?: readonly [number, number];
  /** 체력이 절반 아래면 이만큼 빨라진다 (레이스 컨디션) */
  enrage?: number;
  boss?: boolean;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  bug: { id: 'bug', name: '버그', hp: 20, speed: 1.0, armor: 0, bounty: 4, leak: 1 },
  off_by_one: { id: 'off_by_one', name: 'Off-by-one', hp: 16, speed: 1.9, armor: 0, bounty: 5, leak: 1 },
  null_ptr: { id: 'null_ptr', name: 'NullPointerException', hp: 70, speed: 0.75, armor: 2, bounty: 9, leak: 2 },
  merge_conflict: { id: 'merge_conflict', name: 'Merge Conflict', hp: 55, speed: 0.9, armor: 0, bounty: 8, leak: 2, splits: { kind: 'bug', count: 2 } },
  mem_leak: { id: 'mem_leak', name: 'Memory Leak', hp: 90, speed: 0.8, armor: 0, bounty: 10, leak: 2, regen: 6 },
  tech_debt: { id: 'tech_debt', name: '기술 부채', hp: 260, speed: 0.45, armor: 6, bounty: 22, leak: 4 },
  typo: { id: 'typo', name: '오타', hp: 8, speed: 2.2, armor: 0, bounty: 2, leak: 1 },
  flaky_test: { id: 'flaky_test', name: '깨지는 테스트', hp: 60, speed: 1.1, armor: 1, bounty: 9, leak: 2, phase: [2.0, 1.0] },
  race_condition: { id: 'race_condition', name: '레이스 컨디션', hp: 80, speed: 1.2, armor: 1, bounty: 10, leak: 2, enrage: 1.8 },
  boss_bug: { id: 'boss_bug', name: '왕버그', hp: 900, speed: 0.5, armor: 3, bounty: 80, leak: 10, boss: true, splits: { kind: 'off_by_one', count: 4 } },
  god_class: { id: 'god_class', name: 'God Class', hp: 2600, speed: 0.38, armor: 8, bounty: 200, leak: 20, boss: true, splits: { kind: 'null_ptr', count: 3 } },
  legacy_code: { id: 'legacy_code', name: '레거시 코드', hp: 3200, speed: 0.32, armor: 10, bounty: 220, leak: 10, boss: true, regen: 8, spawns: { kind: 'typo', every: 3 } },
  spaghetti: { id: 'spaghetti', name: '스파게티 코드', hp: 2400, speed: 0.42, armor: 4, bounty: 200, leak: 10, boss: true, splits: { kind: 'merge_conflict', count: 6 } },
  monolith: { id: 'monolith', name: '모놀리스', hp: 5500, speed: 0.28, armor: 12, bounty: 600, leak: 12, boss: true, spawns: { kind: 'null_ptr', every: 8 } },
};

/** 웨이브 한 무리: kind 를 count 마리, gap 초 간격으로. delay 는 웨이브 시작부터 이 무리가 나오기까지 */
export interface SpawnGroup {
  kind: EnemyId;
  count: number;
  gap: number;
  delay?: number;
}

export interface WaveDef {
  /** 화면에 뜨는 이름 */
  name: string;
  groups: readonly SpawnGroup[];
}

/** 막 (10 스프린트씩). 화면의 안내와 결과에 쓴다 */
export const ACTS: readonly { from: number; name: string }[] = [
  { from: 1, name: '1막: 코드 프리즈 전야' },
  { from: 11, name: '2막: 핫픽스 주간' },
  { from: 21, name: '3막: 레거시 마이그레이션' },
];

export const WAVES: readonly WaveDef[] = [
  // ── 1막 ──
  { name: '월요일: 신규 기능 요청', groups: [{ kind: 'bug', count: 8, gap: 1.0 }] },
  { name: '화요일: 엣지 케이스', groups: [{ kind: 'bug', count: 8, gap: 0.8 }, { kind: 'off_by_one', count: 6, gap: 0.7, delay: 4 }] },
  { name: '수요일: QA 리포트', groups: [{ kind: 'null_ptr', count: 5, gap: 1.6 }, { kind: 'bug', count: 10, gap: 0.6, delay: 2 }] },
  { name: '목요일: 동시 머지', groups: [{ kind: 'merge_conflict', count: 6, gap: 1.5 }, { kind: 'off_by_one', count: 10, gap: 0.5, delay: 5 }] },
  { name: '금요일 오후: 왕버그 출몰', groups: [{ kind: 'bug', count: 12, gap: 0.5 }, { kind: 'boss_bug', count: 1, gap: 1, delay: 6 }] },
  { name: '금요일 저녁: 메모리가 샌다', groups: [{ kind: 'mem_leak', count: 6, gap: 1.4 }, { kind: 'null_ptr', count: 6, gap: 1.2, delay: 3 }] },
  { name: '토요일: 쌓인 기술 부채', groups: [{ kind: 'tech_debt', count: 4, gap: 3 }, { kind: 'off_by_one', count: 14, gap: 0.4, delay: 2 }] },
  { name: '일요일: 핫픽스의 핫픽스', groups: [{ kind: 'merge_conflict', count: 10, gap: 0.9 }, { kind: 'mem_leak', count: 6, gap: 1.2, delay: 4 }, { kind: 'bug', count: 20, gap: 0.3, delay: 8 }] },
  { name: '프리즈 D-1: 레거시 총출동', groups: [{ kind: 'tech_debt', count: 6, gap: 2.2 }, { kind: 'null_ptr', count: 10, gap: 0.8, delay: 1 }, { kind: 'boss_bug', count: 2, gap: 6, delay: 10 }] },
  { name: '프리즈 전야: God Class', groups: [{ kind: 'off_by_one', count: 20, gap: 0.35 }, { kind: 'mem_leak', count: 8, gap: 1, delay: 4 }, { kind: 'god_class', count: 1, gap: 1, delay: 12 }] },
  // ── 2막: 프리즈 중에도 장애는 난다 ──
  { name: '핫픽스 1일: 오타 대량 발생', groups: [{ kind: 'typo', count: 30, gap: 0.25 }, { kind: 'bug', count: 15, gap: 0.5, delay: 3 }] },
  { name: '핫픽스 2일: 가끔 깨지는 테스트', groups: [{ kind: 'flaky_test', count: 10, gap: 1.1 }, { kind: 'null_ptr', count: 8, gap: 1.2, delay: 4 }] },
  { name: '핫픽스 3일: 레이스 컨디션', groups: [{ kind: 'race_condition', count: 12, gap: 0.9 }, { kind: 'off_by_one', count: 16, gap: 0.4, delay: 3 }] },
  { name: '핫픽스 4일: 롤백 실패', groups: [{ kind: 'merge_conflict', count: 14, gap: 0.8 }, { kind: 'flaky_test', count: 8, gap: 1, delay: 6 }, { kind: 'typo', count: 20, gap: 0.2, delay: 10 }] },
  { name: '핫픽스 5일: 스파게티 코드', groups: [{ kind: 'mem_leak', count: 10, gap: 1 }, { kind: 'spaghetti', count: 1, gap: 1, delay: 8 }] },
  { name: '주말 당직: 새벽 알림', groups: [{ kind: 'race_condition', count: 14, gap: 0.7 }, { kind: 'tech_debt', count: 6, gap: 2, delay: 2 }] },
  { name: '주말 당직: 메모리 폭주', groups: [{ kind: 'mem_leak', count: 16, gap: 0.7 }, { kind: 'typo', count: 30, gap: 0.2, delay: 5 }] },
  { name: '주말 당직: 장애 전파', groups: [{ kind: 'flaky_test', count: 14, gap: 0.8 }, { kind: 'race_condition', count: 10, gap: 0.8, delay: 4 }, { kind: 'boss_bug', count: 2, gap: 5, delay: 8 }] },
  { name: '주말 당직: 기술 부채 상환일', groups: [{ kind: 'tech_debt', count: 12, gap: 1.4 }, { kind: 'null_ptr', count: 14, gap: 0.7, delay: 2 }] },
  { name: '2막 끝: 레거시 코드 깨어나다', groups: [{ kind: 'race_condition', count: 16, gap: 0.6 }, { kind: 'legacy_code', count: 1, gap: 1, delay: 10 }] },
  // ── 3막: 결국 마이그레이션 ──
  { name: '마이그레이션 1주: 스키마 변경', groups: [{ kind: 'merge_conflict', count: 20, gap: 0.6 }, { kind: 'flaky_test', count: 12, gap: 0.8, delay: 4 }] },
  { name: '마이그레이션 2주: 데이터 깨짐', groups: [{ kind: 'null_ptr', count: 24, gap: 0.5 }, { kind: 'typo', count: 40, gap: 0.15, delay: 3 }] },
  { name: '마이그레이션 3주: 이중 쓰기', groups: [{ kind: 'race_condition', count: 22, gap: 0.5 }, { kind: 'mem_leak', count: 12, gap: 0.9, delay: 4 }] },
  { name: '마이그레이션 4주: 남은 부채', groups: [{ kind: 'tech_debt', count: 16, gap: 1.1 }, { kind: 'spaghetti', count: 1, gap: 1, delay: 12 }] },
  { name: '마이그레이션 5주: God Class 쪼개기', groups: [{ kind: 'flaky_test', count: 18, gap: 0.6 }, { kind: 'god_class', count: 2, gap: 8, delay: 6 }] },
  { name: '전환 D-5: 트래픽 폭증', groups: [{ kind: 'typo', count: 60, gap: 0.12 }, { kind: 'off_by_one', count: 30, gap: 0.25, delay: 2 }, { kind: 'race_condition', count: 16, gap: 0.6, delay: 6 }] },
  { name: '전환 D-4: 롤백 계획', groups: [{ kind: 'mem_leak', count: 20, gap: 0.6 }, { kind: 'tech_debt', count: 12, gap: 1.2, delay: 3 }] },
  { name: '전환 D-3: 레거시의 반격', groups: [{ kind: 'legacy_code', count: 1, gap: 1 }, { kind: 'flaky_test', count: 20, gap: 0.5, delay: 4 }] },
  { name: '전환 D-2: 전부 다', groups: [{ kind: 'merge_conflict', count: 20, gap: 0.5 }, { kind: 'race_condition', count: 20, gap: 0.5, delay: 4 }, { kind: 'boss_bug', count: 3, gap: 4, delay: 8 }] },
  { name: '전환 D-day: 모놀리스', groups: [{ kind: 'tech_debt', count: 5, gap: 2 }, { kind: 'null_ptr', count: 12, gap: 0.8, delay: 2 }, { kind: 'monolith', count: 1, gap: 1, delay: 16 }] },
];

/** 이 스프린트를 막으면 "프리즈 성공" (순위표의 🎉). 그 뒤로는 끝없는 야근이 이어진다 */
export const WIN_WAVE = 30;
/** 0.1.x 의 "프리즈 성공" 기준 (예전 기록을 읽을 때만 쓴다) */
export const OLD_WIN_WAVE = 10;

/** 야근(30 스프린트 뒤)에 섞여 나오는 것 */
const ENDLESS_POOL: readonly EnemyId[] = ['bug', 'off_by_one', 'null_ptr', 'merge_conflict', 'mem_leak', 'tech_debt', 'typo', 'flaky_test', 'race_condition'];
const ENDLESS_BOSSES: readonly EnemyId[] = ['boss_bug', 'spaghetti', 'god_class', 'legacy_code', 'monolith'];

/**
 * n 번째 스프린트 (1 부터). WAVES 뒤로는 끝없이 만들어 낸다 (같은 번호면 언제나 같은 웨이브: 결정론).
 * 야근 k 일차: 무리 셋, 마릿수가 늘고, 5일마다 보스.
 */
export function waveAt(n: number): WaveDef {
  const fixed = WAVES[n - 1];
  if (fixed) return fixed;
  const k = n - WAVES.length; // 1, 2, 3...
  const pick = (i: number): EnemyId => ENDLESS_POOL[(k * 7 + i * 3) % ENDLESS_POOL.length]!;
  const count = (base: number): number => base + Math.floor(k * 1.5);
  const groups: SpawnGroup[] = [
    { kind: pick(0), count: count(14), gap: 0.5 },
    { kind: pick(1), count: count(10), gap: 0.6, delay: 3 },
    { kind: pick(2), count: count(6), gap: 0.9, delay: 6 },
  ];
  if (k % 5 === 0) groups.push({ kind: ENDLESS_BOSSES[(k / 5 - 1) % ENDLESS_BOSSES.length]!, count: 1 + Math.floor(k / 25), gap: 5, delay: 10 });
  return { name: `야근 ${k}일차`, groups };
}

/** 몇 막인지 (야근은 null) */
export function actOf(n: number): string | null {
  if (n > WAVES.length) return null;
  let name: string | null = null;
  for (const a of ACTS) if (n >= a.from) name = a.name;
  return name;
}

/**
 * 난이도 곡선. 스프린트가 오를수록 버그 체력이 늘어난다: 1막은 완만하게, 2·3막은 가파르게, 야근부터는 더 가파르게.
 * (밸런스 테스트가 이 값으로 30 스프린트를 이길 수 있는지, 대충 지으면 2막에서 지는지, 야근이 결국 끝나는지 확인한다)
 */
export const DIFFICULTY = {
  /** 1~10 스프린트: 스프린트마다 */
  act1: 0.08,
  /** 11~30 스프린트: 스프린트마다 */
  later: 0.55,
  /** 야근 n 일차: × (1 + over1·n + over2·n²) */
  over1: 0.12,
  over2: 0.03,
};
/** @deprecated 0.1.x 이름. DIFFICULTY.act1 과 같다 */
export const HP_GROWTH = DIFFICULTY.act1;
export function hpScaleAt(wave: number): number {
  const w = Math.max(1, wave);
  const d = DIFFICULTY;
  const base = 1 + d.act1 * (Math.min(w, 10) - 1) + d.later * Math.max(0, Math.min(w, WAVES.length) - 10);
  const over = Math.max(0, w - WAVES.length);
  return base * (1 + d.over1 * over + d.over2 * over * over);
}
/**
 * 스프린트마다 보스가 아닌 버그들의 체력 합계 (예산). 한 곡선으로 매끄럽게 오른다: 막이 바뀌어도 쉬워지지 않는다.
 * 웨이브가 시작될 때 그 웨이브의 마릿수·종류로 나눠 한 마리의 체력 배수를 정한다 (sim.ts startWave).
 * 그래서 오타 떼 웨이브든 기술 부채 웨이브든 같은 스프린트면 버텨야 하는 양이 같다. 보스는 따로 hpScaleAt 을 따른다.
 */
export const BUDGET = {
  /** 크기: 1 스프린트의 합계가 대략 이것 × growth */
  base: 150,
  /** 스프린트 번호의 몇 제곱 (처음에 빠르게) */
  power: 1.02,
  /** 스프린트마다 곱해지는 배수 (꾸준히) */
  growth: 1.075,
  /** 야근 n 일차: × (1 + over·n)² */
  over: 0.03,
};
export function hpBudgetAt(wave: number): number {
  const w = Math.max(1, wave);
  const over = Math.max(0, w - WAVES.length);
  return BUDGET.base * w ** BUDGET.power * BUDGET.growth ** w * (1 + BUDGET.over * over) ** 2;
}

/** 버그 한 마리가 쓰러질 때까지의 체력 (갈라져 나오는 것까지 합쳐서, 배수 1 기준) */
export function baseHpWithSplits(kind: EnemyId): number {
  const d = ENEMIES[kind];
  return d.hp + (d.splits && !d.boss ? d.splits.count * baseHpWithSplits(d.splits.kind) : 0);
}

/** n 스프린트에서 보스가 아닌 버그의 체력 배수: 예산 ÷ (마릿수 × 기본 체력) */
export function normalHpScaleAt(wave: number): number {
  let raw = 0;
  for (const g of waveAt(wave).groups) if (!ENEMIES[g.kind].boss) raw += g.count * baseHpWithSplits(g.kind);
  return raw > 0 ? hpBudgetAt(wave) / raw : hpScaleAt(wave);
}

/**
 * 돈(SP) 곡선. 잡을 때 받는 SP = 버그의 bounty × kill × (1 + growth·(스프린트-1)), 보스는 × boss.
 * 웨이브를 막으면 bonusBase + bonusPerWave × 스프린트 (30 까지).
 * (밸런스 테스트가 이 값으로 보통 실력이 30 스프린트를 깨는지, 30 스프린트까지 다 올리지는 못하는지 확인한다)
 */
export const ECONOMY = {
  kill: 1,
  /** 1.1.0 까지 0.025 (30 스프린트에 ×1.7). 1.2.0 부터 늘지 않는다 */
  growth: 0,
  /** 보스를 잡을 때 받는 SP 배수 (1.1.0 까지 1) */
  boss: 0.5,
  /** 1.1.0 까지 20 + 6 × 스프린트 */
  bonusBase: 15,
  bonusPerWave: 3,
};
export function bountyScaleAt(wave: number): number {
  return ECONOMY.kill * (1 + ECONOMY.growth * Math.max(0, wave - 1));
}
/** 웨이브를 막으면 받는 보너스 */
export function waveBonusAt(wave: number): number {
  return Math.round(ECONOMY.bonusBase + ECONOMY.bonusPerWave * Math.min(wave, WIN_WAVE));
}
/** @deprecated waveBonusAt 을 쓴다 */
export const WAVE_BONUS = { base: 20, perWave: 6 };
