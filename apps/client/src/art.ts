/**
 * 스프라이트 그림: 글자 격자 (글자 하나 = 픽셀 하나, 색은 PAL). '.' 은 투명하다.
 * Friday Deploy 와 같은 방식, 같은 팔레트(Catppuccin Mocha + 외곽선 #11111b)를 쓴다.
 * 화면(DOM)을 쓰지 않아서 단위 테스트에서 모양을 검사할 수 있다. 캔버스로 굽는 것은 sprites.ts 가 한다.
 */
import type { EnemyId, TowerId } from '@code-freeze/shared';

export const PAL: Record<string, string> = {
  k: '#11111b', // 외곽선
  w: '#eff1f5',
  s: '#f5c9a6', // 피부
  h: '#5c4033', // 머리
  b: '#89b4fa',
  B: '#5a7fd6',
  r: '#f38ba8',
  R: '#c9516f',
  g: '#a6e3a1',
  G: '#3b7a4a',
  y: '#f9e2af',
  Y: '#d9a441',
  o: '#fab387',
  O: '#d9773f',
  p: '#cba6f7',
  P: '#8f6fd1',
  c: '#94e2d5',
  l: '#bac2de',
  n: '#7f849c',
  m: '#585b70',
  d: '#45475a',
  t: '#d8c7a0', // 오래된 PC 베이지
  T: '#b3a07a',
  e: '#e64553', // 진한 빨강
  E: '#8f1d33',
  u: '#74c7ec', // 서버 불빛
  x: '#1c1220',
};

function recolor(rows: readonly string[], map: Record<string, string>): string[] {
  return rows.map((row) => Array.from(row, (ch) => map[ch] ?? ch).join(''));
}

// ── 버그 (Friday Deploy 의 그림을 그대로 쓴다: 같은 세계의 같은 버그) ──

const BUG = ['.k......k.', '..k.kk.k..', '..kRrrRk..', '.krkrrkrk.', 'kkrrkkrrkk', '.krkrrkrk.', 'k.kRrrRk.k', '...kkkk...'];

const OFF_BY_ONE = [
  '..kkkkkkkk..',
  '.kooooooook.',
  'kooooooowwok',
  'koowwooowkok',
  'koowkooooook',
  'kooooooooook',
  'kookoooookok',
  'kokkkookkook',
  'kookoooookok',
  'kOoooooookOk',
  '.kOOOOOOOOk.',
  '..kkkkkkkk..',
];

const NULL_PTR = [
  '..kkkkkk..',
  '.kwwwwwwk.',
  'kwwwwwwwwk',
  'kwkkwwkkwk',
  'kwkkwwkkwk',
  'kwwwwwwwwk',
  'kwwwkkwwwk',
  'klwwwwwwlk',
  'klwlwwlwlk',
  'kl.klk.klk',
  '.k..k...k.',
];

const MERGE_CONFLICT = [
  '...kkkkkkkk...',
  '..krrrrggggk..',
  '.krrrrrgggggk.',
  'krrwwrrggwwggk',
  'krrwkrrggkwggk',
  'krrrrrrggggggk',
  'krrkrrkkggkggk',
  'kRrrkkrggkkgGk',
  'kRRrrrrggggGGk',
  '.kRRrrrgggGGk.',
  '..kRRRRGGGGk..',
  '...kkkkkkkk...',
];

const MEM_LEAK = [
  '.....kk.....',
  '....kbbk....',
  '...kbbbbk...',
  '..kbwbbbbk..',
  '.kbwbbbbbbk.',
  'kbbbbbbbbbbk',
  'kbbkbbbbkbbk',
  'kbbkbbbbkbbk',
  'kBbbbkkbbbBk',
  '.kBBbbbbBBk.',
  '..kkkkkkkk..',
];

/** 기술 부채: 테이프로 감은 낡은 베이지 PC 상자 */
const TECH_DEBT = [
  '.kkkkkkkkkkkk.',
  'ktttttttttttTk',
  'ktkkkkkkkkkkTk',
  'ktkxxxxxxxxkTk',
  'ktkxeexxeexkTk',
  'ktkxxxxxxxxkTk',
  'ktkxxkkkkxxkTk',
  'ktkkkkkkkkkkTk',
  'kyyyyyyyyyyyyk',
  'ktttTttttTttTk',
  'ktmttttttttmTk',
  'kTTTTTTTTTTTTk',
  '.kkkkkkkkkkkk.',
];

/** 왕버그: 버그를 두 배로 키우고 왕관을 씌운다 */
function bossBug(): string[] {
  const big = BUG.flatMap((row) => {
    const r = Array.from(row, (c) => c + c).join('');
    return [r, r];
  });
  const crown = ['......kkkkkkkk......', '.....kykykykyk......', '.....kyyyyyyyyk.....', '.....kkkkkkkkkk.....'].map((r) => r.padEnd(20, '.').slice(0, 20));
  return [...crown, ...big];
}

/** God Class: 모든 걸 다 아는 거대한 클래스 파일 */
const GOD_CLASS = [
  '..kkkkkkkkkkkkkkkkkk..',
  '.kppppppppppppppppppk.',
  'kpPPPPPPPPPPPPPPPPPPpk',
  'kpPkkkPkkPkkkkPkkkPPpk',
  'kpPPPPPPPPPPPPPPPPPPpk',
  'kpkwwwwwwwwwwwwwwwwkpk',
  'kpkwkkkkwwkkkkkwwwwkpk',
  'kpkwwwwwwwwwwwwwwwwkpk',
  'kpkwwkkkkkkwwkkkkwwkpk',
  'kpkwwwwwwwwwwwwwwwwkpk',
  'kpkweewwwwwwwwwweewkpk',
  'kpkweewwwwwwwwwweewkpk',
  'kpkwwwwwwwwwwwwwwwwkpk',
  'kpkwwwkkkkkkkkkwwwwkpk',
  'kpkwwwwkeeeeeekwwwwkpk',
  'kpkwwwwwkkkkkkwwwwwkpk',
  'kpkwwwwwwwwwwwwwwwwkpk',
  'kpkwkkkwwkkkkwwkkkwkpk',
  'kpkwwwwwwwwwwwwwwwwkpk',
  'kpPPPPPPPPPPPPPPPPPPpk',
  '.kPPPPPPPPPPPPPPPPPPk.',
  '..kkkkkkkkkkkkkkkkkk..',
];

export const ENEMY_ART: Record<EnemyId, string[]> = {
  bug: BUG,
  off_by_one: OFF_BY_ONE,
  null_ptr: NULL_PTR,
  merge_conflict: MERGE_CONFLICT,
  mem_leak: MEM_LEAK,
  tech_debt: TECH_DEBT,
  boss_bug: recolor(bossBug(), { r: 'e', R: 'E' }),
  god_class: GOD_CLASS,
};

// ── 타워: 14×14 책상 위 물건. 아래 두 줄은 받침(책상) ──

const DESK = ['kmmmmmmmmmmmmk', '.kkkkkkkkkkkk.'];

const TOWER_LOG = [
  '..............',
  '.kkkkkkkkkkkk.',
  'kddddddddddddk',
  'kdkkkkkkkkkkdk',
  'kdkgkgggkkkkdk',
  'kdkkkkkkkkkkdk',
  'kdkgggkyykkkdk',
  'kdkkkkkkkkkkdk',
  'kdkgkwkkkkkkdk',
  'kddddddddddddk',
  '.kkkkkddkkkkk.',
  '....kmmmmk....',
  ...DESK,
];

const TOWER_DUCK = [
  '..............',
  '......kkkk....',
  '.....kyyyyk...',
  '.....kykyyk...',
  '.....kyyyyokk.',
  '......kyyyOOok',
  '..kk..kyykkkk.',
  '.kyyk.kyyyk...',
  '.kyyyykyyyyk..',
  '.kyyyyyyyyyk..',
  '.kYyyyyyyyYk..',
  '..kYYYYYYYk...',
  ...DESK,
];

const TOWER_TEST = [
  '.....kkkk.....',
  '.....kllk.....',
  '.....kllk.....',
  '.....kllk.....',
  '....kllllk....',
  '...kllllllk...',
  '..klllllllk...',
  '..kggggggggk..',
  '.kggwggggggk..',
  '.kgggggwgggGk.',
  '.kgwgggggggGk.',
  '..kGGGGGGGGk..',
  ...DESK,
];

const TOWER_AI = [
  '......kk......',
  '......kc......',
  '..kkkkkkkkkk..',
  '.kllllllllllk.',
  '.klkkkkkkkklk.',
  '.klkcckkccklk.',
  '.klkcckkccklk.',
  '.klkkkkkkkklk.',
  '.klkkwwwwkklk.',
  '.kllllllllllk.',
  '..knnnnnnnnk..',
  '..kn.kn.knnk..',
  ...DESK,
];

const TOWER_FIREWALL = [
  '......kk......',
  '.....kok......',
  '....kook..k...',
  '...kooyokkok..',
  '..kkoyyookok..',
  '.kRRkRRRkRRRk.',
  '.kRRRkRRRkRRk.',
  '.kkkkkkkkkkkk.',
  '.kRkRRRkRRRkk.',
  '.kRRkRRRkRRRk.',
  '.kkkkkkkkkkkk.',
  '.kRRRkRRRkRRk.',
  ...DESK,
];

export const TOWER_ART: Record<TowerId, string[]> = {
  log: TOWER_LOG,
  duck: TOWER_DUCK,
  test: TOWER_TEST,
  ai: TOWER_AI,
  firewall: TOWER_FIREWALL,
};

/** 탄 */
export const SHOT_ART: Partial<Record<TowerId, string[]>> = {
  log: ['.kkkk.', 'kwwwwk', 'kwyywk', 'kwwwwk', '.kkkk.'],
  test: ['.kkk.', 'kgwgk', 'kgggk', 'kgGgk', '.kkk.'],
};

/** prod 서버 랙: 버그가 닿으면 안 되는 곳 */
export const PROD_SERVER = [
  '.kkkkkkkkkkkk.',
  'kddddddddddddk',
  'kdkkkkkkkkkkdk',
  'kdkugkkkmmmkdk',
  'kdkkkkkkkkkkdk',
  'kdkugkkkmmmkdk',
  'kdkkkkkkkkkkdk',
  'kdkuykkkmmmkdk',
  'kdkkkkkkkkkkdk',
  'kdkugkkkmmmkdk',
  'kdkkkkkkkkkkdk',
  'kddddddddddddk',
  '.kmk......kmk.',
  '.kkk......kkk.',
];

/** 후드티 + 헤드폰 + 노트북의 온콜 개발자 (Friday Deploy 주인공). 타이틀에 그린다 */
export const DEV = [
  '....kkkkkk....',
  '...khhhhhhk...',
  '..kdhhhhhhdk..',
  '..kdssssssdk..',
  '..kdskssksdk..',
  '...kssssssk...',
  '..kkbssssbkk..',
  '.kbbbbbbbbbbk.',
  '.kbbkllllkbbk.',
  '.ksbklgglkbsk.',
  '..kkkllllkkk..',
  '...kBBkkBBk...',
  '...kBBk.kBBk..',
  '...kkk..kkk...',
];
