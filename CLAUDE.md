# Code Freeze — 작업 규칙

Friday Deploy 패밀리의 타워디펜스 웹 게임. 지금은 서버 없는 정적 데모다. 소개는 `README.md`.

## 지켜야 할 것

- **패밀리룩**: 팔레트(`src/art.ts` 의 `PAL`, `src/style.css` 의 `:root`)와 외곽선 `#11111b`, Galmuri11, 글자 격자 픽셀아트, 터미널 명령어 말투를 Friday Deploy 와 맞춘다.
- **규칙은 `src/sim.ts` 에만**: DOM 을 쓰지 않고 고정 틱으로만 흐른다. 나중에 리더보드를 붙이면 서버가 같은 sim 을 돌려 검증할 수 있게 결정론을 지킨다 (`Math.random` 금지).
- **콘텐츠는 `src/content.ts` 에 데이터로**. 밸런스를 바꾸면 `npm test` 의 밸런스 테스트가 이길 수 있는지 확인한다.
- **화면에 문자열 넣기**: `textContent` 만 (`innerHTML` 금지).
- **모바일 우선**: 화면을 바꿨으면 320px 폭부터 데스크톱까지, 세로와 가로 모두 확인한다.
- **문서와 문구**: 한국어. 게임 안 문구는 쉬운 말로.
- `main` 에 직접 푸시하지 않는다. 브랜치에서 작업하고 PR 을 만든 뒤 사용자의 승인을 받고 머지한다.

## 검증

```bash
npm run typecheck
npm test
npm run build
```
