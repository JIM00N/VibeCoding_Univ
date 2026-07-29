# BMAD 워크플로 · git 규칙

추적: `_bmad-output/implementation-artifacts/sprint-status.yaml`. 스토리 파일은 같은 디렉토리의 `<에픽>-<스토리>-<한국어-슬러그>.md`.

## 개발 사이클 (스토리 1개 기준)

1. **준비** — `/bmad-sprint-planning`(epics.md → sprint-status.yaml), `/bmad-create-story`(스토리 파일 생성, backlog → ready-for-dev)
2. **착수** — 착수 게이트(🚧, 선행 스토리 done) 확인 → `story/N-M-english-slug` 브랜치 → in-progress. DB 마이그레이션이 필요하면 **코드 머지 전에** 라이브 적용 후 information_schema로 실측 확인
3. **구현** — `/bmad-dev-story`: 스토리의 Dev Notes·안티패턴("손대지 않는 것") 절 필독 → TDD(선 red) → add-only 구현 → `Story N.M:` 한국어 커밋
4. **리뷰** — status → review → **Codex 사전 리뷰(필수)** + `/bmad-code-review`(Blind Hunter·Edge Case Hunter·Acceptance Auditor 3층 병렬) → Patch/Defer/Dismiss 트리아지 → Patch 반영 커밋(`Story N.M: 코드리뷰 반영 — …`). Codex가 장애(503 등)로 불가하면 사용자에게 보고하고 진행 여부를 받는다
5. **로컬 실증** — 백엔드 테스트 전체 green → 실 Supabase curl 실증(로컬 uvicorn, 모든 스토리 필수) → **UI가 바뀐 스토리만** 브라우저 실측 추가(콘솔 0, Playwright 390×844) → 검증 데이터 SQL 원복(처방→기록→예약 순)
6. **PR·머지** — push + PR 생성까지는 에이전트가 진행 → 로컬 서버(:8000 + :3000)를 기동해 사용자가 직접 확인할 수 있게 준비 → **머지는 사용자 확인·승인 후** merge commit(squash 아님)
   - ⚠️ **PR 생성 후에 커밋을 더 얹었으면 머지 전에 push 반영을 확인한다.** PR 은 생성 시점 SHA 가 아니라 원격 브랜치 tip 을 따라가지만, push 가 늦으면 그 커밋 없이 머지된다(2026-07-28 실측 — 추적 커밋 `b10fdcc` 가 이렇게 누락돼 cherry-pick 으로 복구). 확인: `gh pr view <N> --json headRefOid` 가 로컬 `git rev-parse HEAD` 와 같은지.
7. **릴리스** — Vercel·Railway 자동 배포 → 라이브 실측 → 검증 데이터 원복 → 추적 마무리: 스토리 Status·sprint-status done, main에 `Story N.M: 배포·라이브 확인 완료 → done` 커밋·push → 로컬 서버 종료·정리
   - 머지 직후 **누락 점검 1회**: `git fetch -q --all && git log --oneline --all --not origin/main`. 출력이 비어야 정상. 남은 게 있으면 **SHA 가 아니라 내용**으로 판정한다 — cherry-pick·rebase 로 내용만 들어간 경우가 있어 SHA 부재가 곧 누락은 아니다(`git diff <sha> origin/main -- <파일>` 으로 확인).
8. **에픽 종료 시** — `/bmad-retrospective` → action_items를 sprint-status.yaml에 반영(리트로 파일 `epic-N-retro-YYYY-MM-DD.md`)

**done 정의 = 커밋 + 배포 + 라이브 확인 3가지 전부.** PR 머지만으로는 done 아님 — 스토리 마지막 Task가 이 릴리스 게이트다.

## 브랜치 · 커밋

- 브랜치: `story/N-M-english-slug` (스토리 외 작업은 `chore/slug`) — 슬러그만 영어
- 커밋: 한국어, `Story N.M: …` 접두(비스토리는 `chore:`)
- GitHub repo 슬러그는 `JIM00N/VibeCoding_Univ` (gh 명령 시)

## 스토리 파일 기록

- 상태: backlog → ready-for-dev → in-progress → review → done (sprint-status.yaml과 동기)
- dev 중 채울 것: Status 라인, Tasks/Subtasks 체크박스, Dev Agent Record, Change Log 행(날짜|작성|내용)
- 리뷰 결과는 "### Review Findings"에 [Review][Patch] / [Defer] / [Dismiss] 트리아지, Defer는 `deferred-work.md`에 추가

## 규율

- add-only: 기존 함수·컴포넌트(request, format.ts, 배지 등)는 동결, 새 기능은 기존 계층에 얹기만
- "패턴이 아니라 이유를 복사" — 앞 스토리의 CAS·트랜잭션 합성을 이유 없이 복제하지 않는다
- lint/build로 검증을 끝내지 말 것 — 계약 테스트는 db 계층을 monkeypatch하므로 실 SQL 회귀를 못 잡는다. 실 보증은 curl 실증·라이브 실측이 담당
- Railway가 backend/railway.json의 startCommand를 못 읽어 앱이 8080 고정 바인딩·도메인 포트 수동 정렬 상태 — 포트 관련 변경 시 502 주의(deferred-work.md 1-2)
