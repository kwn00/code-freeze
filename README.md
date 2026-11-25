# Code Freeze (코드 프리즈)

> 코드 프리즈 전날 밤, prod 를 지켜라

[Friday Deploy](https://github.com/kwn00/friday-deploy) 패밀리의 개발자 컨셉 픽셀아트 **타워디펜스** 웹 게임.
내일부터 연말 코드 프리즈. 그런데 `main` 브랜치를 따라 버그가 `prod` 서버로 몰려온다. 길 옆에 개발 도구를 깔아 10번의 스프린트를 막으세요.

- **장르**: 타워디펜스 (정해진 길 + 빈칸에 타워 짓기 · 올리기 · 팔기, 10 웨이브)
- **플랫폼**: 웹 (모바일 퍼스트 세로 화면, 데스크톱 · 가로 화면도 지원)
- **아트 · 소리**: 외부 이미지 · 소리 파일 없이 코드로 만든 픽셀 스프라이트와 칩튠 (Friday Deploy 와 같은 방식, 같은 팔레트)
- **지금 상태**: 데모 (v0.1.0). 서버 · DB 없이 브라우저만으로 돈다

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
| 팔기 | 쓴 값의 70% 를 돌려받는다 |

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
npm run dev        # 개발 서버
npm test           # 규칙 · 밸런스 · 그림 테스트
npm run build      # dist/ 에 정적 파일
```

## 구조

```
src/content.ts   맵 · 타워 · 버그 · 웨이브 데이터 (콘텐츠는 여기에만)
src/sim.ts       규칙 전부. 고정 틱(30Hz), 결정론적, DOM 없음 → 단위 테스트
src/art.ts       글자 격자 픽셀아트 + 팔레트
src/sprites.ts   격자 → 오프스크린 캔버스
src/render.ts    캔버스 그리기 (맵 정수 배율, 효과)
src/audio.ts     Web Audio 효과음 · 배경음악
src/main.ts      화면 · 입력 · 게임 루프
```

글꼴: [Galmuri11](https://github.com/quiple/galmuri) (SIL OFL 1.1, `public/fonts/`).
