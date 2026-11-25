/**
 * 버전과, 게임 안에서 보여주는 릴리즈노트 ("새 소식").
 *
 * - 맨 위 항목이 현재 버전이다. 루트와 각 워크스페이스 package.json 의 version 과 같아야 한다 (테스트가 확인한다).
 * - 여기에는 플레이어가 체감하는 것만, 쉬운 말로 짧게 적는다 (한 버전에 5줄 이하, 한 줄 70자 이하).
 *   보안·내부 구조·테스트·배포 설정 같은 변경은 적지 않는다.
 * - 전체 변경 내역은 docs/releases/<버전>.md 에 적는다. 그 파일이 GitHub 릴리즈의 본문이 된다.
 * - 버전을 올리는 절차는 .claude/skills/release/SKILL.md 참고.
 */
export interface ReleaseNote {
  /** x.y.z */
  version: string;
  /** 릴리즈를 준비한 날짜 (YYYY-MM-DD). PR 을 올린 날을 적는다 */
  date: string;
  /** 한 줄 제목 */
  title: string;
  /** 플레이어에게 보여줄 내용. 한 줄에 하나씩, 쉬운 말로 */
  items: string[];
}

/** 최신 버전이 맨 위 */
export const RELEASES: readonly ReleaseNote[] = [
  {
    version: '1.1.0',
    date: '2026-11-25',
    title: '더 어려워졌어요',
    items: [
      '스프린트마다 꾸준히 어려워져요. 막이 바뀌어도 쉬워지지 않아요.',
      '전체적으로 버그가 더 단단해졌어요. 30 스프린트는 여전히 깰 수 있어요.',
      'console.log() 4단계가 조금 약해졌어요. 여러 타워를 섞어 써 보세요.',
      '빠르기 버튼과 일시정지 메뉴가 깜빡이지 않아요.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-25',
    title: '시즌 1: 30 스프린트와 야근',
    items: [
      '시즌 1 시작! 순위표에서 시즌별 기록을 볼 수 있어요.',
      '스프린트가 30개, 3막으로 늘었어요. 깨면 퇴근할지 야근할지 골라요.',
      '새 타워 3종(정규표현식·코드 프리즈·로드 밸런서)과 4단계가 생겼어요.',
      '새 버그: 떼로 오는 오타, 사라지는 테스트, 다치면 빨라지는 버그.',
      '순위표에 어떤 타워로 깼는지 그림으로 나와요.',
    ],
  },
  {
    version: '0.1.1',
    date: '2026-11-25',
    title: '순위표가 새로워졌어요',
    items: [
      '🏆 순위표에서 1~3등이 색으로 보이고, 내 기록이 강조돼요.',
      '순위표에 끝날 때 서 있던 타워와 단계가 함께 나와요.',
      '웨이브 전에 지은 타워는 웨이브 전에 팔면 원가로 돌려받아요.',
      '웨이브가 시작된 뒤에 팔면 예전처럼 70%를 돌려받아요.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-25',
    title: '첫 버전이에요',
    items: [
      'main 브랜치를 따라 prod 로 몰려오는 버그를 막아요.',
      '타워 5종을 짓고 3단계까지 올릴 수 있어요.',
      '버그 6종과 보스 2종, 10번의 스프린트를 버티면 이겨요.',
      '막은 스프린트 수로 순위표에 올라요.',
    ],
  },
];

export const APP_VERSION = RELEASES[0]!.version;

/** 리더보드 시즌 = 게임 버전의 메이저. 시즌을 바꾸려면 메이저를 올린다 (사용자 승인 필요) */
export const LEADERBOARD_SEASON = 1;

function parseVersion(v: unknown): [number, number, number] | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a) ?? [-1, -1, -1];
  const y = parseVersion(b) ?? [-1, -1, -1];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/**
 * 이 브라우저가 마지막으로 본 버전(seen)을 기준으로, 자동으로 보여줄 릴리즈노트를 고른다 (최신순).
 * - 본 적이 없거나 값이 이상하면: 현재 버전의 것 하나
 * - 현재 버전을 이미 봤으면 (또는 더 새 버전을 봤으면): 없음
 * - 옛 버전을 봤으면: 그 뒤에 나온 것들 (최대 limit 개)
 */
export function unseenReleases(seen: string | null | undefined, limit = 3): ReleaseNote[] {
  if (parseVersion(seen) === null) return RELEASES.slice(0, 1);
  return RELEASES.filter((r) => compareVersions(r.version, seen as string) > 0).slice(0, Math.max(1, limit));
}
