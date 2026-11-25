# Code Freeze (코드 프리즈)

> 코드 프리즈 전날 밤, prod 를 지켜라

[Friday Deploy](https://github.com/kwn00/friday-deploy) 패밀리의 개발자 컨셉 픽셀아트 **타워디펜스** 웹 게임.
내일부터 연말 코드 프리즈. 그런데 `main` 브랜치를 따라 버그가 `prod` 서버로 몰려온다. 길 옆에 개발 도구를 깔아 10번의 스프린트를 막으세요.

- **장르**: 타워디펜스 (정해진 길 + 빈칸에 타워 짓기 · 올리기 · 팔기, 10 웨이브)
- **플랫폼**: 웹 (모바일 퍼스트 세로 화면, 데스크톱 · 가로 화면도 지원)
- **아트 · 소리**: 외부 이미지 · 소리 파일 없이 코드로 만든 픽셀 스프라이트와 칩튠 (Friday Deploy 와 같은 방식, 같은 팔레트)
- **구조**: 서버 권위 (Friday Deploy 와 같다). 판정은 모두 서버가 하고 화면은 입력만 보낸다
- **배포**: Render 웹 서비스 하나 + Neon PostgreSQL (리더보드)

## 컨셉

| 구분 | 내용 |
| --- | --- |
| 지키는 것 | 🖥️ **prod 서버** (가용성 20). 버그가 닿으면 그 버그의 피해만큼 줄고, 0 이 되면 `502 Bad Gateway` |
| 길 | `main` 브랜치. 맵 위에서 들어와 지그재그로 prod 까지 |
| 돈 | **SP (스토리 포인트)**. 버그를 잡거나 웨이브를 막으면 받는다 |
| 웨이브 | **Sprint 1~10**: 월요일 신규 기능 요청 → … → 프리즈 전야 God Class. `git push` 버튼으로 시작, 막으면 **PR Merged!** 보너스 |
| 타워 (5, 각 3단계) | 🖨️ `console.log()` (싸고 빠른 단일) · 🦆 러버덕 (둘레 둔화) · 🧪 테스트 커버리지 (범위 폭발) · 🤖 AI 에이전트 (긴 사거리 · 갑옷 무시 빔) · 🔥 방화벽 (둘레 화상) |
| 버그 (6 + 보스 2) | 버그 · Off-by-one (빠름) · NullPointerException (단단함) · Merge Conflict (쓰러지면 버그 둘로) · Memory Leak (회복) · 기술 부채 (느리고 갑옷 두꺼움) / 👑 왕버그 · God Class |
| 승리 | `git tag freeze-YYYY` · ✔ All checks passed |
| 팔기 | 쓴 값의 70% 를 돌려받는다. 단, 웨이브 사이에 지었거나 올린 값은 다음 웨이브가 시작되기 전에 팔면 원가로 돌려받는다 (↩️ 되돌리기) |
| 순위표 | 🏆 `git log --top`: 막은 스프린트 → 남은 가용성 → 잡은 버그 순, 상위 50개. 끝날 때 서 있던 타워와 단계, 날짜도 보인다. 방금 세운 내 기록은 강조된다. 서버가 판이 끝날 때 직접 남긴다 |

Friday Deploy 와 같은 세계: 같은 주인공(후드티 + 헤드폰 개발자), 같은 버그 그림, 같은 팔레트(Catppuccin Mocha + 외곽선 `#11111b`), 같은 픽셀 폰트(Galmuri11), 터미널 명령어 말투.

## 조작

| | 키보드 · 마우스 | 터치 |
| --- | --- | --- |
| 타워 고르기 | 1~5 또는 아래 버튼 | 아래 버튼 |
| 짓기 | 길 옆 빈칸 클릭 (올려 두면 자리 · 사거리 미리보기) | 길 옆 빈칸 누르기 |
| 올리기 · 팔기 | 지은 타워 클릭 → 아래 패널 | 지은 타워 누르기 → 아래 패널 |
| 웨이브 시작 | Space | `git push` 버튼 |
| 빠르기 ×1/×2/×3 | F | ×1 버튼 |
| 취소 / 일시정지 | Esc · P | 오른쪽 위 Ⅱ |

## 실행

```bash
npm install
npm run dev        # 서버(:8787) + 화면(Vite, /api · /ws 를 서버로 넘긴다)
npm test           # 규칙 · 밸런스 · 통신 규격 · 서버 · 리더보드 · 보안 · 릴리즈 규칙
npm run build      # apps/client/dist
npm start          # 빌드한 화면까지 서버 하나로 (NODE_ENV=production 이면 SESSION_SECRET 필요)
```

환경 변수는 `.env.example` 참고. `DATABASE_URL` 이 없으면 순위표는 서버 메모리에만 있다.

## 배포 (Render + Neon)

1. [Neon](https://neon.tech) 에서 프로젝트를 만들고 연결 주소(`...?sslmode=require`, 풀링 주소도 된다)를 복사한다. 테이블은 서버가 처음 쓸 때 만든다.
2. Render 대시보드 → New → Blueprint → 이 저장소 → Apply (`render.yaml`). `SESSION_SECRET` 은 Render 가 만든다.
3. 서비스의 Environment 에 `DATABASE_URL` 을 넣는다.
4. 이후 `main` 에 머지할 때마다 자동으로 배포되고, `.github/workflows/release.yml` 이 태그와 GitHub 릴리즈를 만든다.

## 릴리즈

- 작업은 `release/x.y.z` 브랜치에서 하고 PR 로 `main` 에 올린다 (`main` 에 직접 푸시하지 않는다).
- 릴리즈노트는 두 벌: GitHub 릴리즈(`docs/releases/x.y.z.md`, 모든 변경)와 게임 안 새 소식(`packages/shared/src/releases.ts`, 플레이어가 체감하는 것만 짧게). 절차는 `.claude/skills/release/SKILL.md`.

## 구조

```
packages/shared   콘텐츠 · 결정론적 시뮬레이션 · 통신 규격 · 버전과 새 소식 (서버/화면 공용)
apps/server       Node + ws. 권위 서버: 판 루프(30Hz), 세션, 레이트리밋, 리더보드(Neon), 화면 파일 서빙
apps/client       Vite + TypeScript + Canvas 2D. 입력 전송과 그리기만 한다
docs/SECURITY.md  치트 방지 설계와 위협 모델
```

```
[화면]  의도 (짓기·올리기·팔기·웨이브·빠르기·멈춤)  ──▶  [서버] 검증 → 시뮬레이션 (30Hz)
[화면]  ◀── 상태 (초당 15번, 웨이브 중)  ─────────────  [서버] 결과 · 순위 기록
```

글꼴: [Galmuri11](https://github.com/quiple/galmuri) (SIL OFL 1.1, `apps/client/public/fonts/`).
