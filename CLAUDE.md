# Code Freeze — 작업 규칙

Friday Deploy 패밀리의 타워디펜스 웹 게임이다. 서버 한 프로세스가 화면 · API · WebSocket 을 모두 서빙한다 (Render 무료 플랜, DB 는 Neon PostgreSQL).
자세한 소개와 구조는 `README.md`, 치트 방지 설계는 `docs/SECURITY.md`.

## 브랜치와 배포 (가장 중요)

- `main` 에 올라간 커밋은 Render 가 곧바로 운영 서버에 배포한다. **`main` 에 직접 커밋하거나 푸시하지 않는다.**
- 모든 작업은 버전 브랜치 `release/x.y.z` 에서 한다. 새 작업을 시작할 때 버전 번호를 제안하고 확인받는다.
- 게임에 영향이 없는 변경(문서·스킬·테스트·GitHub 워크플로처럼 `render.yaml` 의 `buildFilter` 에 든 파일만 바꾸는 것)은 버전을 올리지 않는다.
  `docs/<주제>` 브랜치에서 PR 을 만들고, 승인 뒤에만 머지한다.
- 플레이어에게 보이지 않는 서버 변경은 사용자가 그렇게 정하면 버전을 올리지 않고 `feature/<주제>` 브랜치에서 한다. 이것도 PR 과 승인을 거친다.
- **버전의 메이저(`x.y.z` 의 `x`)가 리더보드 시즌이다** (`LEADERBOARD_SEASON`, 지금 시즌 1). 메이저를 올리는 것은 시즌을 바꾸는 것이므로 아래 리더보드 규칙을 따른다.
- 작업과 검증이 끝나면 PR 을 만들고 **멈춘다**. 머지는 사용자가 승인한 뒤에만 한다. 검증을 통과했다는 것은 승인이 아니다.
- 버전을 올리고 릴리즈노트를 쓰는 절차는 `release` 스킬(`.claude/skills/release/SKILL.md`)에 있다. 릴리즈할 때는 그것을 따른다.
  - GitHub 릴리즈(`docs/releases/x.y.z.md`)에는 모든 변경을 적는다. 게임 안 새 소식(`packages/shared/src/releases.ts`)에는 플레이어가 체감하는 것만 짧고 쉽게 적는다.

## 지켜야 할 것

- **서버 권위**: 클라이언트는 입력("의도")만 보낸다. 돈·가용성·버그·피해·결과·순위는 서버가 `sim.ts` 로 계산한다.
  새 기능도 판정은 서버에 두고, 클라이언트가 보낸 값을 믿어야 하는 구조는 만들지 않는다. 치트와 관련된 변경은 `docs/SECURITY.md` 의 표에 반영한다.
- **규칙은 `packages/shared/src/sim.ts` 에만**: DOM 을 쓰지 않고 고정 틱으로만 흐르며 결정론적이다 (`Math.random` 금지).
- **콘텐츠는 `packages/shared/src/content.ts` 에 데이터로**. 밸런스를 바꾸면 `npm test` 의 밸런스 테스트가 이길 수 있는지 확인한다.
- **리더보드 기록은 지우지 않는다**: 사용자가 따로, 분명하게 지우라고 하기 전에는 기록을 없애는 변경을 하지 않는다
  (DB 행 삭제, 시즌 올리기, 예전 기록을 못 읽게 되는 저장 형식 변경 포함). 필요해 보이면 이유와 함께 제안하고 승인을 기다린다.
- **화면에 문자열 넣기**: `textContent` 만 쓴다 (`innerHTML` 금지). 닉네임 등 서버에서 온 값은 모양을 확인하고 쓴다.
- **패밀리룩**: 팔레트(`apps/client/src/art.ts` 의 `PAL`, `style.css` 의 `:root`)와 외곽선 `#11111b`, Galmuri11, 글자 격자 픽셀아트, 터미널 명령어 말투를 Friday Deploy 와 맞춘다.
- **무료 서버의 한계**: 0.1 CPU, 512MB, 15분 동안 접속이 없으면 잠든다. CPU 나 전송량이 늘어나는 변경은 재서 확인한다.
- **화면 크기**: 모바일 우선이다. 화면을 바꿨으면 320px 폭부터 데스크톱까지, 세로와 가로 모두 확인한다.
- **문서와 문구**: 한국어로 쓴다. 게임 안 문구는 쉬운 말로 쓴다.

## 검증

```bash
npm run typecheck   # 타입 검사
npm test            # 단위 테스트 (규칙, 밸런스, 통신 규격, 서버 판, 리더보드, 보안, 릴리즈 규칙)
npm run build       # 클라이언트 빌드
```

- 서버나 통신이 바뀌었으면 서버를 실제로 띄우고 접속해서 확인한다. 화면이 바뀌었으면 실제 브라우저(Playwright)로 확인한다.
- 테스트가 실패하면 원인을 먼저 본다. 코드가 맞고 테스트의 가정이 틀렸을 때만 테스트를 고친다.
- 확인하지 못한 것은 확인하지 못했다고 말한다 (운영 사이트, 실제 휴대폰 등). 대화와 PR 본문에서 말하고, 릴리즈노트와 게임 안 새 소식에는 적지 않는다.

## 구조

- `packages/shared` — 서버와 클라이언트가 함께 쓰는 것: 콘텐츠(`content.ts`), 시뮬레이션(`sim.ts`), 통신 규격(`protocol.ts`), 상수, 닉네임, 버전과 새 소식(`releases.ts`)
- `apps/server` — 판(`game.ts`), 리더보드(`leaderboard.ts`, `store-postgres.ts`), 보안(`security.ts`), 화면 파일(`static.ts`), 진입점(`index.ts`)
- `apps/client` — 화면(`main.ts`, `render.ts`, `view.ts`, `net.ts`, `index.html`, `style.css`), 그림(`art.ts`, `sprites.ts`), 소리(`audio.ts`)
- `docs/releases/` — 버전별 GitHub 릴리즈 본문
