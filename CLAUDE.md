# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

병원 진료관리 앱(hospital-care). BMAD 프로세스로 스토리 단위 개발하는 학습용 프로젝트.
UI 문구·오류 메시지·주석·커밋 메시지는 한국어(해요체), 코드 식별자·브랜치 슬러그는 영어.

## 스택 · 배포

- `frontend/` Next.js 16.2.10 App Router + React 19 + Tailwind v4 → Vercel 자동 배포
- `backend/` FastAPI + psycopg3 raw SQL(ORM 없음), Python 3.13 → Railway 자동 배포
- `db/` Supabase Postgres — **dev·prod 공용 라이브 DB 하나뿐** (프로젝트 fphsxoweprztrekckzui)
- CI 없음. main 머지 = 즉시 배포. 검증은 로컬 테스트 + 라이브 실측으로

## 명령어

venv 없음 — backend는 반드시 uv 경유 (`python3 -m pytest`는 실패: 시스템 파이썬 3.11, pytest 없음):

```bash
# backend 테스트 (backend/ 에서)
uv run --with-requirements requirements-dev.txt --no-project python -m pytest -q

# backend 로컬 서버 :8000 (backend/ 에서, backend/.env 필요)
uv run --with-requirements requirements.txt --no-project python -m uvicorn app.main:app --port 8000

# frontend (frontend/ 에서) — 테스트 스크립트 없음
npm run dev    # :3000
npm run lint
npm run build
```

## 규칙

- `.claude/rules/workflow.md` — BMAD 개발 사이클, 브랜치·커밋 규칙, done 정의, 검증 규율 (항상 로드)
- 영역별 코딩 규칙은 별도 사본 없이 아래 정본 문서와 코드 자체가 기준 — 작업 전 해당 정본을 읽는다

## 정본 문서

- 아키텍처 결정(AD-1..10): `_bmad-output/planning-artifacts/architecture/architecture-hospital-care-2026-07-13/ARCHITECTURE-SPINE.md`
- 에픽·AC·횡단 규약: `_bmad-output/planning-artifacts/epics.md`
- UX 결정(UX-DR*): `_bmad-output/planning-artifacts/ux-designs/ux-hospital-care-2026-07-13/DESIGN.md`
- 스토리 명세·진행: `_bmad-output/implementation-artifacts/` (`sprint-status.yaml`이 상태 추적)
- DB 스키마 기준: 1-1 스토리 파일의 "실측 DB 스키마" 표 — base CREATE TABLE은 레포에 없음(라이브가 기준)

## 최우선 금기

- 공용 라이브 DB: 시드(`db/seed/004_seed.sql`) 재실행 금지(TRUNCATE CASCADE), 검증 데이터는 SQL로 원복
- RLS deny-by-default(정책 0개)는 의도된 설계(AD-7) — anon 정책 추가 금지
- 루트의 `{output_folder}/`는 BMAD 설치 잔재 — 정리·수정 금지 (실제 산출물은 `_bmad-output/`)
- frontend 작업 전 `frontend/AGENTS.md` 필독 — Next.js 16은 훈련 데이터와 다른 버전
