# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

병원 진료관리 앱(hospital-care). BMAD 프로세스로 스토리 단위 개발하는 학습용 프로젝트.
UI 문구·오류 메시지·주석·커밋 메시지는 한국어(해요체), 코드 식별자·브랜치 슬러그는 영어.

## 스택 · 배포

- `frontend/` Next.js 16.2.10 App Router + React 19 + Tailwind v4 → Vercel 자동 배포
- `backend/` FastAPI + psycopg3 raw SQL(ORM 없음), Python 3.13 → Railway 자동 배포
- `db/` Supabase Postgres — **dev·prod 공용 라이브 DB 하나뿐** (프로젝트 fphsxoweprztrekckzui)
- CI 없음. main 머지 = 즉시 배포. 검증은 로컬 테스트 + 라이브 실측으로
  (라이브: https://vibe-coding-univ.vercel.app · https://vibecodinguniv-production.up.railway.app)

## 명령어

venv 없음 — backend는 반드시 uv 경유 (`python3 -m pytest`는 실패: 시스템 파이썬 3.11, pytest 없음).
backend 명령은 반드시 `backend/`에서 실행 — `load_dotenv()`가 CWD 기준이라 루트에서 돌리면 `DATABASE_URL` RuntimeError:

```bash
# backend 테스트 · 린트 (backend/ 에서)
uv run --with-requirements requirements-dev.txt --no-project python -m pytest -q
uv run --with-requirements requirements-dev.txt --no-project ruff check .   # 현재 0건 — 뜨면 새로 생긴 것

# backend 로컬 서버 :8000 (backend/ 에서, backend/.env 필요)
uv run --with-requirements requirements.txt --no-project python -m uvicorn app.main:app --port 8000

# frontend (frontend/ 에서) — 테스트 스크립트 없음
npm run dev    # :3000
npm run lint   # 타입체크 안 됨 — 타입 오류는 build에서만 검출
npm run build
```

## 규칙 파일

**이 파일은 200줄 이하로 유지한다.** 늘어나면 분야별 규칙을 `.claude/rules/`로 옮기고 여기엔 포인터만 남긴다.

- `.claude/rules/workflow.md` — BMAD 사이클, 브랜치·커밋, done 정의, 검증 규율. 스코프 없음 = **항상 로드**
- `.claude/rules/backend.md` — 계층 구조·uv·린터·env. `paths: backend/**`
- `.claude/rules/frontend.md` — lint/build 분업·Next 16 함정. `paths: frontend/**`

> `paths:` frontmatter가 붙은 규칙만 해당 경로를 만질 때 로드된다. **없으면 CLAUDE.md와 똑같이 매 세션 로드되어 컨텍스트 절감이 0이다** — 새 규칙 파일에는 반드시 `paths:`를 붙인다.
> 영역별 코딩 규칙은 별도 사본을 만들지 않는다 — 아래 정본 문서와 코드 자체가 기준.

## 정본 문서

- 로컬 환경 셋업(.env·풀러 사유·psql 없는 DB 접속·원복): `docs/환경셋업.md`

- 아키텍처 결정(AD-1..10): `_bmad-output/planning-artifacts/architecture/architecture-hospital-care-2026-07-13/ARCHITECTURE-SPINE.md`
- 에픽·AC·횡단 규약: `_bmad-output/planning-artifacts/epics.md`
- UX 결정(UX-DR*): `_bmad-output/planning-artifacts/ux-designs/ux-hospital-care-2026-07-13/DESIGN.md`
- 스토리 명세·진행: `_bmad-output/implementation-artifacts/` (`sprint-status.yaml`이 상태 추적)
- DB 스키마 기준: 1-1 스토리 파일의 "실측 DB 스키마" 표 — base CREATE TABLE은 레포에 없음(라이브가 기준). 마이그레이션은 `db/migrations/` 001→002→003→005 순(004번은 시드가 차지)

## 최우선 금기

- 공용 라이브 DB: 시드(`db/seed/004_seed.sql`) 재실행 금지(TRUNCATE CASCADE), 검증 데이터는 SQL로 원복(Supabase MCP 경유가 최속 — `docs/환경셋업.md` §5)
- RLS deny-by-default(정책 0개)는 의도된 설계(AD-7) — anon 정책 추가 금지
- 루트의 `{output_folder}/`(빈 잔재)와 `_bmad/`(프레임워크 설치본)는 정리·수정 금지 (실제 산출물은 `_bmad-output/`)
- frontend 작업 전 `frontend/AGENTS.md` 필독 — Next.js 16은 훈련 데이터와 다른 버전
