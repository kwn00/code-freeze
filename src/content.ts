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

export type TowerId = 'log' | 'duck' | 'test' | 'ai' | 'firewall';
export const TOWER_IDS: readonly TowerId[] = ['log', 'duck', 'test', 'ai', 'firewall'];

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
  /** 느리게: 속도를 이 배로 (러버덕, 방화벽) */
  slow?: number;
  /** 갑옷 무시 */
  pierce?: boolean;
  /** 화상: 초당 피해 (방화벽) */
  burn?: number;
}

export interface TowerDef {
  id: TowerId;
  name: string;
  icon: string;
  desc: string;
  /** 'shot' = 탄을 쏜다, 'beam' = 바로 맞힌다, 'aura' = 둘레 전체에 계속 */
  attack: 'shot' | 'beam' | 'aura';
  levels: readonly TowerLevel[];
}

export const TOWERS: Record<TowerId, TowerDef> = {
  log: {
    id: 'log',
    name: 'console.log()',
    icon: '🖨️',
    desc: '싸고 빠르게 한 마리씩',
    attack: 'shot',
    levels: [
      { cost: 50, damage: 6, range: 2.4, cooldown: 0.5 },
      { cost: 45, damage: 10, range: 2.6, cooldown: 0.42 },
      { cost: 80, damage: 16, range: 2.9, cooldown: 0.34 },
    ],
  },
  duck: {
    id: 'duck',
    name: '러버덕',
    icon: '🦆',
    desc: '둘레의 버그를 느리게 (피해 조금)',
    attack: 'aura',
    levels: [
      { cost: 60, damage: 2, range: 1.6, cooldown: 0.5, slow: 0.6 },
      { cost: 55, damage: 3, range: 1.9, cooldown: 0.5, slow: 0.5 },
      { cost: 90, damage: 5, range: 2.2, cooldown: 0.5, slow: 0.4 },
    ],
  },
  test: {
    id: 'test',
    name: '테스트 커버리지',
    icon: '🧪',
    desc: '맞은 자리 둘레까지 터뜨린다',
    attack: 'shot',
    levels: [
      { cost: 90, damage: 12, range: 2.2, cooldown: 1.3, splash: 0.9 },
      { cost: 80, damage: 20, range: 2.4, cooldown: 1.15, splash: 1.1 },
      { cost: 130, damage: 34, range: 2.6, cooldown: 1.0, splash: 1.3 },
    ],
  },
  ai: {
    id: 'ai',
    name: 'AI 에이전트',
    icon: '🤖',
    desc: '멀리서 세게. 갑옷 무시',
    attack: 'beam',
    levels: [
      { cost: 130, damage: 40, range: 4.0, cooldown: 2.0, pierce: true },
      { cost: 120, damage: 70, range: 4.5, cooldown: 1.8, pierce: true },
      { cost: 180, damage: 120, range: 5.0, cooldown: 1.6, pierce: true },
    ],
  },
  firewall: {
    id: 'firewall',
    name: '방화벽',
    icon: '🔥',
    desc: '둘레를 태운다 (화상: 계속 피해)',
    attack: 'aura',
    levels: [
      { cost: 110, damage: 4, range: 1.3, cooldown: 0.5, burn: 6 },
      { cost: 100, damage: 6, range: 1.5, cooldown: 0.5, burn: 10 },
      { cost: 150, damage: 9, range: 1.7, cooldown: 0.5, burn: 16 },
    ],
  },
};

export type EnemyId = 'bug' | 'off_by_one' | 'null_ptr' | 'merge_conflict' | 'mem_leak' | 'tech_debt' | 'boss_bug' | 'god_class';
export const ENEMY_IDS: readonly EnemyId[] = ['bug', 'off_by_one', 'null_ptr', 'merge_conflict', 'mem_leak', 'tech_debt', 'boss_bug', 'god_class'];

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
  /** 쓰러질 때 나오는 것 (머지 충돌 → 버그 둘) */
  splits?: { kind: EnemyId; count: number };
  /** 초당 체력 회복 (메모리 누수) */
  regen?: number;
  boss?: boolean;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  bug: { id: 'bug', name: '버그', hp: 20, speed: 1.0, armor: 0, bounty: 4, leak: 1 },
  off_by_one: { id: 'off_by_one', name: 'Off-by-one', hp: 16, speed: 1.9, armor: 0, bounty: 5, leak: 1 },
  null_ptr: { id: 'null_ptr', name: 'NullPointerException', hp: 70, speed: 0.75, armor: 2, bounty: 9, leak: 2 },
  merge_conflict: { id: 'merge_conflict', name: 'Merge Conflict', hp: 55, speed: 0.9, armor: 0, bounty: 8, leak: 2, splits: { kind: 'bug', count: 2 } },
  mem_leak: { id: 'mem_leak', name: 'Memory Leak', hp: 90, speed: 0.8, armor: 0, bounty: 10, leak: 2, regen: 6 },
  tech_debt: { id: 'tech_debt', name: '기술 부채', hp: 260, speed: 0.45, armor: 6, bounty: 22, leak: 4 },
  boss_bug: { id: 'boss_bug', name: '왕버그', hp: 900, speed: 0.5, armor: 3, bounty: 80, leak: 10, boss: true, splits: { kind: 'off_by_one', count: 4 } },
  god_class: { id: 'god_class', name: 'God Class', hp: 2600, speed: 0.38, armor: 8, bounty: 200, leak: 20, boss: true, splits: { kind: 'null_ptr', count: 3 } },
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

export const WAVES: readonly WaveDef[] = [
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
];

/** 웨이브가 오를수록 버그 체력이 이 배수만큼 늘어난다: 1 + HP_GROWTH × (웨이브 번호 - 1) */
export const HP_GROWTH = 0.08;
/** 웨이브를 막으면 받는 보너스: 기본 + 웨이브 번호 × 배수 */
export const WAVE_BONUS = { base: 20, perWave: 6 };
