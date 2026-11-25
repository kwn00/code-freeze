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
export const LEADERBOARD_SEASON = 0;

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
