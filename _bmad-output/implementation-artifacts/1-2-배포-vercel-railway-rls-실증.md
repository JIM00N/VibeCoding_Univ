---
baseline_commit: 5a082a075f86a78cb20a1410b17fa8746a154cdd
---

# Story 1.2: 배포 (Vercel + Railway) + RLS 실증

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **서비스를 처음 여는 사용자**,
I want **1.1에서 로컬로 관통시킨 뼈대(브라우저 → FastAPI → Supabase)가 공개 URL에서 그대로 도는 것을**,
so that **P0가 실제 배포 URL에서 돌고, 배포 사고 부류(풀러·CORS·RLS)를 마감 직전이 아니라 1일차에 드러낸다.**

> 이 스토리는 Epic 1의 **두 번째 뼈대 스토리**다. 새 기능을 만들지 않는다 — 1.1이 로컬에서 세운 3계층을 **프런트 Vercel · 백엔드 Railway**에 얹어 공개 URL에서 관통시키고, **RLS ON**을 배포 환경에서 실증한다. 이후 모든 에픽(예약·진료·조회)은 이 배포된 뼈대 위에서 동작한다.
>
> ⚠️ **이건 "코드"보다 "배포·설정" 스토리다.** 새 소스는 `backend/railway.json` 하나 + (선택) 전역 예외 핸들러뿐이고, 나머지 작업은 **사용자 계정·인증이 필요한 대시보드 설정**(Railway·Vercel·Supabase 연결 문자열)이다. dev-story 에이전트는 **혼자 배포를 완료할 수 없다** — 사용자에게 계정 로그인·시크릿 입력·대시보드 클릭을 안내하고 그 지점에서 멈춰 승인/값을 받아야 한다. 초급 사용자 관점: 각 단계를 대시보드 클릭 흐름으로, 한 번에 하나씩.

## Acceptance Criteria

> 원본 BDD: [Source: _bmad-output/planning-artifacts/epics.md#Story-1.2]

**AC1 — 배포 환경 3계층 관통(공개 URL에서 시드 진료과 렌더)**
- Given 1.1 뼈대를 프런트 **Vercel**, 백엔드(FastAPI) **Railway**에 배포했을 때
- When 공개 Vercel URL로 접속한다
- Then 첫 화면이 `NEXT_PUBLIC_API_BASE_URL`(= Railway 백엔드 공개 URL)로 `GET /departments`를 호출해 **시드 진료과(내과·이비인후과·정형외과)를 렌더**하며, 브라우저 → FastAPI → Supabase 관통이 **배포 환경에서도** 동작한다 `(NFR-1, AD-1)`

**AC2 — CORS 허용 + 세션 풀러 연결(트랜잭션 안전)**
- Given 배포 환경에서
- When 프런트(Vercel)가 백엔드(Railway)를 실제로 호출한다
- Then CORS가 **Vercel 프로덕션 오리진 + 프리뷰 배포 URL**(동적 서브도메인)을 허용해 브라우저 요청이 차단되지 않고
- And `DATABASE_URL`은 Supabase **세션 풀러(5432, IPv4)**를 가리키며 `prepare_threshold=None`이 적용돼, 이후 AD-4/AD-5 트랜잭션이 배포 환경에서 깨지지 않는다 `(운영 봉투, 브리프 리스크)`

**AC3 — RLS 실증(9테이블 ON + 읽기 비어있지 않음)**
- Given 배포가 완료됐을 때
- When Supabase advisor(또는 `pg_class.relrowsecurity` / `pg_policies`)로 점검한다
- Then **9테이블 모두 RLS ON**임이 확인된다
- And RLS ON 이후에도 **FastAPI 경유 시드 읽기가 행을 정상 반환**함을 확인한다(백엔드가 소유자 역할로 RLS 우회 — "에러 없이 어디서나 빈 목록" 실패를 사전 차단) `(NFR-4 완료 정의, AD-7)`

**AC4 — 착수 순서(1일차 완료)**
- Given 마감(2026-07-16)까지 3일뿐일 때
- When 착수 순서를 정한다
- Then 1.2(배포·RLS 실증)를 **1일차 종료 전에 완료**한다 — 배포를 뒤로 미루면 P0 관통 자체가 위험해진다 `(브리프 리스크)`

## Tasks / Subtasks

- [x] **Task 0 — 배포 전제 정리(사용자 안내·승인)** (AC: 1, 4)
  - [x] 배포 브랜치 확정·push: 사용자 결정으로 `main`에 병합(`origin/main` = 5ea394b). 플랫폼은 main=프로덕션 + 브랜치=프리뷰로 배포
  - [x] 사용자 계정(Railway·Vercel·Supabase) 확보·연결 완료 — 배포 성공으로 실증
  - [x] Supabase **세션 풀러 연결 문자열** 확보·적용 — Railway `DATABASE_URL`에 입력, 앱 기동 성공(연결 정상)
- [x] **Task 1 — Railway 배포 설정 파일 작성(신규 소스)** (AC: 1, 2)
  - [x] `backend/railway.json` 생성: builder `RAILPACK`, `deploy.startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"`. JSON 유효성·앱 임포트 검증 통과
  - [x] `backend/.python-version` 에 `3.13` 작성(Railway 기본 3.13 명시 고정)
  - [x] 커밋·push 완료 — 사용자 결정으로 `main`에 병합·push(`origin/main` = 5ea394b, 1.1+1.2 코드 포함). GitHub PR #1로 1.1이 이미 main에 있었어 origin/main 위로 rebase 후 push(강제 push 아님)
- [x] **Task 2 — Railway 백엔드 배포(사용자 대시보드 작업)** (AC: 1, 2) — *배포 성공, `/health`·`/departments` 실측 통과*
  - [x] GitHub 레포 연결 → 서비스 생성. **Root Directory = `backend`** 설정(초기 미설정 시 빌드 실패 → Railway 자체 진단이 이 설정을 지목, 수정 후 빌드 성공)
  - [x] 시작 포트 정렬(배포 사고): `railway.json`의 `$PORT` startCommand가 하위경로라 미적용 → Railpack 기본 명령이 `8080`에 바인딩. 도메인이 `3030`을 가리켜 **502** → 도메인 타깃 포트를 `8080`으로 맞춰 해결
  - [x] **Variables**: `DATABASE_URL`(세션 풀러) 설정 → 앱 기동 성공(fail-fast 통과 = DB 연결 정상). `CORS_ORIGIN_REGEX` 설정(Task 3 뒤)
  - [x] **Generate Domain** → `https://vibecodinguniv-production.up.railway.app`(Python 3.13.14로 빌드 확인)
  - [x] 검증: `/health` → `{"status":"ok"}`(200), `/departments` → 시드 진료과 3행(200) = 브라우저→FastAPI→Supabase 배포 환경 관통 + RLS ON에도 읽기 정상(소유자 역할 우회)
- [x] **Task 3 — Vercel 프런트 배포(사용자 대시보드 작업)** (AC: 1) — *배포 성공, 공개 URL에서 앱 렌더*
  - [x] GitHub 레포 연결 → **Root Directory = `frontend`** 설정
  - [x] 프레임워크 인식(배포 사고): 초기 루트미설정 배포가 **Framework = "Other"** 로 굳어 모든 경로 404. **Framework Preset = `Next.js`** 로 바꾸고 캐시 없이 재배포 → 정상 빌드
  - [x] **`NEXT_PUBLIC_API_BASE_URL` = `https://vibecodinguniv-production.up.railway.app`**(빌드 번들에 인라인 확인). 재배포로 반영
  - [x] Vercel 프로덕션 URL `https://vibe-coding-univ.vercel.app` 확보 → CORS는 정규식(`*.vercel.app`)이 프로덕션·프리뷰 모두 커버(별도 `CORS_ORIGINS` 불필요)
- [x] **Task 4 — RLS 실증(9테이블 ON + 읽기 정상)** (AC: 3)
  - [x] Supabase SQL(`pg_class.relrowsecurity`)로 `public` 9테이블 전수 확인 → **9테이블 모두 `rls_enabled = true`**(사용자 실행·확인, 2026-07-14). NFR-4 완료 정의(배포 후 RLS ON 확인) 충족
  - [x] 배포된 백엔드 `GET /departments`가 **행을 반환**함 재확인(RLS ON이어도 소유자 역할 우회 — 빈 목록 아님). 배포 환경 실측 통과 = AC3의 "에러 없이 빈 목록" 실패 케이스 차단
- [x] **Task 5 — 공개 URL 브라우저 관통 검증** (AC: 1, 4) — *헤드리스 스크린샷으로 실증*
  - [x] 공개 Vercel URL 헤드리스 Chrome 스크린샷: 첫 화면에 **역할 버튼(환자 emerald·직원) + 시드 진료과(내과·이비인후과·정형외과) 렌더** = 배포 환경 3계층 관통 실증(디자인 토큰 UX-DR1도 정상)
  - [x] `/staff` 진입 확인: 역할 컨텍스트 바(서울중앙병원·직원·역할 바꾸기, UX-DR4) + "전체 데이터 접근·신원 선택 없음"(FR-3)
  - [x] CORS: Vercel 프로덕션 오리진에 `access-control-allow-origin` 정상 반환(GET·OPTIONS 프리플라이트 200), 정규식이 프리뷰 서브도메인까지 커버
- [x] **Task 6 — (하드닝) 인프라 오류 전역 예외 핸들러** (AC: 2) — *deferred-work 항목, 배포 하드닝*
  - [x] `backend/app/main.py`에 `@app.exception_handler(Exception)` 추가 — DB 다운·풀 타임아웃 등 미처리 예외를 `{"detail": "일시적인 서버 오류가…"}`(한국어) + 500으로 매핑(AD-10 계약을 인프라 오류까지 확장). 실제 원인·스택은 서버 로그에만 남기고 클라이언트엔 노출 안 함(UX-DR10). 테스트 2건 추가(인프라 오류→한국어 detail, HTTPException 404는 그대로) 통과

### Review Findings

> bmad-code-review (Blind Hunter · Edge Case Hunter · Acceptance Auditor, 3계층 병렬) 2026-07-14. 세 리뷰어가 한 가지 실질 이슈에 수렴. 심각도는 트리아지 재평가값(서브에이전트 값 무시). Codex 리뷰는 사용자 인증 만료로 미실행.

**[Patch] 코드 수정 대상 (medium)**
- [x] [Review][Patch] 전역 예외 핸들러 500 응답에 CORS 헤더 누락 [backend/app/main.py:41] — ✅ **수정 적용(2026-07-14)**: 핸들러가 허용 Origin(`settings.cors_origins`/정규식 검증)에 CORS 헤더를 직접 부여, 500 ACAO 있음/없음 + 한국어 문자열 검증 테스트 3건 추가(전체 11 passed), 실측 재확인(500에 ACAO 붙음). — `@app.exception_handler(Exception)`는 Starlette `ServerErrorMiddleware`(최외곽)에 설치돼 `CORSMiddleware` 바깥에서 500을 내보내므로 `access-control-allow-origin`이 빠진다. **실측:** 배포 CORS 정규식 하에서 200엔 ACAO 붙지만 500엔 없음. 배포 교차오리진(Vercel→Railway) 인프라 500 발생 시 브라우저가 응답을 차단 → 프런트가 핸들러의 한국어 메시지 대신 `lib/api.ts` 네트워크 폴백("서버에 연결하지 못했어요")을 표시. Task 6의 클라이언트 메시지 목적(UX-DR10)이 브라우저 경로에서 반감(서버 로깅·비브라우저 클라이언트는 정상). 수정: 핸들러에서 Origin을 `settings.cors_origins`/정규식으로 검증 후 CORS 헤더 직접 부여 + 500 ACAO 어서션 테스트 추가.

**[Defer] 실재하나 지금 조치 대상 아님 (low)**
- [x] [Review][Defer] `railway.json` `$PORT` startCommand 하위경로 미적용 [backend/railway.json:7] — deferred. Railway가 `backend/railway.json`을 Root Directory 밖에서 못 읽어 Railpack 기본(포트 8080 고정) 명령이 실행됨. 현재 도메인 타깃 포트를 8080에 수동 정렬해 동작 중(Completion Notes 기록). 정리하려면 대시보드 Custom Start Command(`--port $PORT`) + 도메인 자동 포트. 코드 diff 결함 아님.

**[Dismiss] 노이즈·설계상 의도·미도달 (8건)**
- catch-all이 프로그래밍 버그를 "일시적…재시도"로 표시 — 데모 범위상 모든 오류→한국어 {detail}가 AD-10 의도, 인프라/버그 구분은 범위 밖.
- 핸들러 내부 예외 시 맨 500 — 이론적(logging 실무상 미발생). / `app` 로거 핸들러 미구성 — uvicorn이 구성·Python lastResort가 ERROR 방출.
- 배포 3.13 vs 테스트 3.11 — 배포 3.13.14에서 `/departments` 200 실측 확인.
- 테스트가 정확한 한국어 문자열 미검증 — 사소(Patch 테스트에 함께 강화 가능).
- 스트리밍/백그라운드 예외 우회 — 해당 라우트 없음(미도달). / `/health`·비-DB 경로 미검증 — 핸들러 제네릭, DB 경로 테스트가 전체 체인 실행.

## Dev Notes

### 이 스토리의 현재 상태 — 1.1이 배포를 미리 깔아뒀다
1.1이 배포(1.2)를 예상해 **CORS·풀러·fail-fast를 env 기반으로 이미 준비**했다. 이 스토리는 대부분 **값을 채우고 대시보드에서 배포**하는 일이지 코드 변경이 아니다:

| 이미 준비됨(1.1) | 위치 | 1.2에서 할 일 |
|---|---|---|
| CORS 오리진 리스트(env `CORS_ORIGINS`) | `backend/app/config.py`, `main.py` | Vercel 프로덕션 URL을 **env 값**으로 넣기(코드 변경 X) |
| CORS 정규식(env `CORS_ORIGIN_REGEX`, `allow_origin_regex` 배선) | `backend/app/config.py`, `main.py` | Vercel 프리뷰 정규식을 **env 값**으로 넣기(코드 변경 X) |
| `prepare_threshold=None` 항상 설정 | `backend/app/db/pool.py` | 그대로 — 세션/트랜잭션 풀러 모두 안전 |
| 시작 시 DB 연결 fail-fast(`open(wait=True, timeout=10)`) | `backend/app/db/pool.py` | 그대로 — 잘못된 `DATABASE_URL`이면 Railway 배포가 시작 단계에서 실패해 문제를 드러냄 |
| `/health` 엔드포인트 | `backend/app/main.py` | 그대로 — Railway 배포 성공 판정에 사용 |
| 단일 API 클라이언트(env `NEXT_PUBLIC_API_BASE_URL`, 빈값 방어) | `frontend/lib/api.ts` | Vercel에서 이 env를 Railway URL로 설정 |
| 시크릿 번들 격리(0건 검증) | `frontend` 빌드 | 그대로 — 프런트엔 공개값(`NEXT_PUBLIC_*`)만 |

> **결론:** CORS·풀러 관련 **코드는 건드리지 않는다**(1.1이 env로 배선 완료). 배포는 **env 값 + 대시보드 설정 + 도메인 생성**의 문제다.

### UPDATE 대상 파일 — 거의 없음(보존 규칙)
- **신규만:** `backend/railway.json`(+ 선택 `backend/.python-version`). Task 6 채택 시 `main.py`에 핸들러 추가.
- **UPDATE 금지(그대로 보존):** `config.py`·`main.py`의 CORS 배선, `pool.py`의 풀 설정, `lib/api.ts`. 이들은 1.1 코드 리뷰에서 견고화까지 끝난 상태 — 배포는 **값(env)** 으로 해결하지 코드로 하지 않는다. `main.py`의 `allow_credentials=True` + `allow_origin_regex` 조합은 유효(정규식은 매칭된 오리진을 그대로 echo). 로그인이 없어 자격증명이 실제로 오가진 않지만 현 설정 유지.
- **`backend/.env.example`**(선택 업데이트): 배포 값 예시(프리뷰 정규식 주석 해제)를 문서화하면 사용자 안내에 도움. 실제 `.env`/시크릿은 커밋 금지(루트 `.gitignore`가 `.env` 제외 — 확인됨).

### ⚠️ 배포 사고 지점(이 스토리가 1일차에 드러내려는 바로 그 부류)

**① Supabase 연결: 반드시 "풀러 호스트"(IPv4) — 직접 호스트 금지**
Supabase **직접 연결**(`db.<ref>.supabase.co`)은 현재 **IPv6 전용**이고 Railway 이그레스는 IPv4라 **연결이 실패**할 수 있다. 반드시 Supabase **Session pooler**(Supavisor) 연결 문자열을 쓴다 — 호스트가 `...pooler.supabase.com`, 포트 `5432`, 사용자 `postgres.<project-ref>` 형태(IPv4). 로컬 `.env.example`이 직접 호스트를 예시로 뒀지만, **Railway에는 풀러 호스트**를 넣어야 한다. 이게 이 스토리가 잡으려는 대표적 "배포 사고".

**② RLS ON인데 빈 목록만 나오는 함정**
RLS deny-by-default(anon 정책 없음)라, 백엔드가 **소유자(`postgres`) 역할**로 접속해야 행이 보인다. 세션 풀러의 `postgres.<ref>` 사용자는 `postgres` 역할로 매핑돼 RLS를 우회하므로 정상. 만약 배포 후 `GET /departments`가 **에러 없이 `[]`** 를 반환하면 → RLS는 켜졌으나 접속 역할이 비소유자이거나 다른 DB/스키마를 본다는 신호. AC3의 "읽기 비어있지 않음" 확인이 이 함정을 차단한다.

**③ `prepare_threshold=None`(트랜잭션 풀러 대비)**
이미 `pool.py`에 항상 설정됨. 세션 풀러(5432)를 쓰면 없어도 되지만, 트랜잭션 풀러(6543)를 쓰면 필수(psycopg3 자동 prepared statement 간헐 오류 → AD-4/AD-5 트랜잭션 파손). 어느 쪽이든 안전.

**④ `NEXT_PUBLIC_API_BASE_URL`은 빌드 타임 인라인**
값을 바꾸면 **재배포**해야 반영된다(런타임 주입 아님). 순서: Railway 도메인 확정 → Vercel env 설정 → (재)배포. 말단 슬래시 없이(`https://x.up.railway.app`), `lib/api.ts`가 슬래시를 정리하지만 깔끔한 값 권장.

**⑤ CORS 순환 의존(닭-달걀)**
Railway CORS는 Vercel URL을 알아야 하고, Vercel은 Railway URL을 알아야 한다. 순서: (a) Railway 배포 + 도메인 생성 → (b) Vercel에 Railway URL 설정·배포 → Vercel URL 확보 → (c) Railway `CORS_ORIGINS`에 Vercel URL 반영·재배포. 프리뷰 정규식(`CORS_ORIGIN_REGEX`)을 미리 넣어두면 프리뷰는 URL 확정 전에도 통과.

### CORS 정규식(Vercel 프리뷰 + 프로덕션)
- FastAPI `allow_origin_regex`는 **문자열 1개**. Vercel 프리뷰는 서브도메인이 배포마다 바뀐다(`https://{project}-{hash}-{team}.vercel.app`, `https://{project}-git-{branch}-{team}.vercel.app`).
- 넉넉한 값(모든 `*.vercel.app`): `CORS_ORIGIN_REGEX=https://([a-z0-9-]+\.)*vercel\.app`
- 프로젝트로 좁히려면: `https://<project>(-[a-z0-9-]+)?\.vercel\.app`
- 프로덕션 커스텀 도메인이 따로 있으면 그 오리진은 `CORS_ORIGINS`(리스트)에 별도로 추가. 정규식과 리스트는 공존 가능(`main.py`가 둘 다 전달).
- ⚠️ 함정: `allow_origins=["*"]` + `allow_credentials=True`는 무효(브라우저가 자격증명 요청에 와일드카드 거부). 그래서 **정규식**을 쓴다 — 매칭 오리진을 echo하므로 유효.

### RLS 실증 SQL(AC3)
9테이블 RLS 상태 전수 확인:
```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;
```
- 기대: 9행(`hospital·department·hospital_department·doctor·patient·drug·appointment·medical_record·prescription`) 전부 `rls_enabled = true`. `false`가 하나라도 있으면 anon 키로 그 테이블이 열린다.
- deny-by-default 확인(정책 0건이 의도): `select * from pg_policies where schemaname='public';` → **0행이 정상**(anon 허용 정책을 만들지 않음).
- UI 대안: Supabase Dashboard → **Advisors → Security** → `rls_disabled_in_public` 0건.
- 1.1에서 이미 로컬(같은 Supabase)로 RLS ON + 읽기 정상을 실증함 — 이 스토리는 **배포 환경에서 재확인**(NFR-4 완료 정의가 "배포 후 advisor 확인"을 요구).

### Railway 배포 상세(리서치 검증, 2026-07)
- **빌더:** 기본 **Railpack**(Nixpacks는 유지보수 모드). `backend/`에 `requirements.txt`가 있으면 `pip install -r requirements.txt` 자동.
- **Root Directory:** `backend`(대시보드 전용, 설정 파일로는 못 바꿈). 모노레포 하위 배포의 핵심.
- **시작 명령:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`(엔트리포인트 `app.main:app`). Railway가 `$PORT` 주입.
- **`backend/railway.json`(그대로 사용 가능):**
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "RAILPACK" },
  "deploy": {
    "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```
> ⚠️ 설정 파일은 Root Directory를 따라가지 않는다 — Railway가 `backend/railway.json`을 못 잡으면 Config 파일 경로를 `backend/railway.json`으로 지정하거나, 대시보드 **Custom Start Command**에 위 uvicorn 명령을 직접 넣어 폴백. (Railway 공식 FastAPI 문서는 Hypercorn 예시를 쓰지만 **uvicorn이 우리 스택 — 그대로 유효**.)
- **공개 URL:** 자동 아님. **Settings → Networking → Generate Domain**으로 `*.up.railway.app` HTTPS 생성. 앱이 `0.0.0.0:$PORT` 바인딩해야 포트 자동 감지됨.
- **환경변수:** 대시보드 **Variables** 탭(또는 CLI `railway variables --set "KEY=value"` 반복). 변경 시 재배포됨.
- **Python:** Railpack 기본 3.13. 고정하려면 `backend/.python-version`에 `3.13`.

### Vercel 배포 상세(리서치 검증, 2026-07)
- **Root Directory:** `frontend`(Project → Settings → Build and Deployment). 지정하면 Next.js **자동 감지**(Framework Preset·`next build`·출력 무설정). `vercel.json` 불필요.
- **"Include files outside Root Directory":** off 유지(고립형 모노레포라 공유 패키지 없음).
- **env:** `NEXT_PUBLIC_API_BASE_URL` = Railway URL, Production·Preview 모두. 빌드 타임 인라인 → 변경 후 재배포.
- **Next.js 16.2:** Vercel 무설정 배포 정상. Node ≥ 20.9 필요(Vercel 기본 충족). 현 `next@16.2.10`은 CVE-2026-23869(`>=16.0.0 <16.2.3`) 영향 밖 — 버전 유지.

### 핵심 안티패턴(하지 말 것)
- ❌ Supabase **직접 호스트**(`db.<ref>.supabase.co`)를 Railway `DATABASE_URL`에 사용 — IPv6 전용이라 연결 실패. **풀러 호스트**(5432)를 쓴다.
- ❌ 시작 명령에 포트 **하드코딩**(`--port 8000`) — Railway `$PORT`를 쓰지 않으면 헬스체크 실패. `--host 0.0.0.0 --port $PORT`.
- ❌ CORS를 코드로 열기(`allow_origins=["*"]`) — env `CORS_ORIGINS`/`CORS_ORIGIN_REGEX`로 해결. `["*"]`+credentials는 무효이기도.
- ❌ `NEXT_PUBLIC_API_BASE_URL` 바꾸고 **재배포 없이** 반영 기대 — 빌드 타임 인라인이라 재배포 필요.
- ❌ 시크릿(`DATABASE_URL`)을 `NEXT_PUBLIC_*`로 노출하거나 커밋 — 서버 전용, Railway Variables에만.
- ❌ RLS 실증을 **로컬로만** 하고 배포 확인 생략 — NFR-4 완료 정의는 "배포 후" advisor 확인.
- ❌ 배포를 Epic 후반으로 미루기 — AC4/브리프 리스크: **1일차 종료 전** 완료.
- ❌ 배포 문제를 코드 대공사로 해결 — 대부분 env 값·풀러 호스트·CORS 순서 문제다. 코드부터 고치지 말고 **연결·env·도메인 순서**를 먼저 점검.

### Project Structure Notes
1.1 구조 위에 배포 설정만 추가(아키텍처 Structural Seed와 정합) [Source: ARCHITECTURE-SPINE.md#Structural-Seed]:
```text
hospital-care/                # 레포 루트 (VibeCodingUniv/)
  backend/
    railway.json              # ← 신규: Railway 배포 설정(builder·startCommand)
    .python-version           # ← 선택: Python 3.13 고정
    app/
      main.py                 # (선택) 전역 예외 핸들러 추가 시에만 UPDATE — 그 외 그대로
      ...                     # config.py·db/pool.py·routers 등 1.1 그대로 보존
  frontend/                   # 코드 변경 없음 — Vercel env(NEXT_PUBLIC_API_BASE_URL)만 설정
  db/                         # 배포 대상 아님(마이그레이션 SQL은 1.1에서 Supabase에 적용됨)
```
- 배포는 **GitHub 원격**(`JIM00N/VibeCoding_Univ`)을 Railway·Vercel이 각각 연결. 1.1·1.2 작업을 배포 브랜치(보통 `main`)에 올려야 플랫폼이 본다.
- 마이그레이션·시드는 **1.1에서 이미 Supabase에 적용**됨(dev·prod 공용 단일 프로젝트) — 이 스토리에서 재적용 불필요. (⚠️ `004_seed.sql` 재실행은 deferred-work의 truncate 유실 위험 — 이 스토리에서 재시드하지 말 것.)

### 최신 기술 정보(리서치 확정 — 이것이 계약)
| 항목 | 값/도구 | 비고 |
|---|---|---|
| Railway 빌더 | Railpack(기본) | `requirements.txt` 자동 `pip install` |
| Railway 시작 명령 | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` | `$PORT` 주입, 하드코딩 금지 |
| Railway Root Directory | `backend` | 대시보드 전용 설정 |
| Railway 공개 URL | Generate Domain(`*.up.railway.app`) | 자동 아님 |
| Railway Python | 3.13(기본) | `backend/.python-version`로 고정 가능 |
| Vercel Root Directory | `frontend` | Next.js 자동 감지 |
| Vercel env | `NEXT_PUBLIC_API_BASE_URL` | 빌드 타임 인라인 → 재배포 필요 |
| Next.js | 16.2.10 | CVE-2026-23869 영향 밖(유지) |
| Supabase 연결 | **Session pooler 5432(IPv4)** | 직접 호스트(IPv6) 금지 |
| CORS 프리뷰 정규식 | `https://([a-z0-9-]+\.)*vercel\.app` | `allow_origin_regex`(문자열 1개) |

### Testing / 검증 기준
- 이 스토리의 "완료"는 **공개 URL에서 관통이 눈에 보이는 것**(NFR-5, 사용자 선호: 브라우저 확인). 헤드리스 스크린샷으로 배포 첫 화면 실제 렌더를 확인.
- 검증 체크: (1) `GET https://<railway>/health` → `{status:ok}`, (2) `GET https://<railway>/departments` → 시드 진료과 **비어있지 않은** 3행(AC2·AC3 읽기), (3) 공개 Vercel URL 첫 화면에 역할 버튼 + 시드 진료과 렌더(AC1) + `[직원]` 진입, (4) Supabase advisor/SQL로 9테이블 RLS ON(AC3), (5) 프리뷰 URL에서도 CORS 통과(AC2 프리뷰).
- 배포는 사용자 계정·시크릿이 필요 — dev-story는 각 대시보드 단계에서 사용자에게 안내하고 값/승인을 받은 뒤 진행한다.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.2] — 원본 스토리·BDD·AC(4블록)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-hospital-care-2026-07-13/ARCHITECTURE-SPINE.md#Structural-Seed] — 배포 토폴로지(Vercel·Railway·CORS·세션 풀러 운영 봉투), AD-1(3-tier), AD-7(RLS deny-by-default), AD-9(마이그레이션), AD-10(API 계약)
- [Source: _bmad-output/planning-artifacts/prds/prd-hospital-care-2026-07-12/prd.md#NFR-1, #NFR-4] — 배포(Vercel·Railway)·RLS ON 완료 정의
- [Source: _bmad-output/implementation-artifacts/1-1-로컬-수직-슬라이스.md] — 1.1이 배포용으로 미리 깐 env 배선(config.py CORS, pool.py prepare_threshold/fail-fast, main.py /health·allow_origin_regex, lib/api.ts)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — 인프라 오류 전역 핸들러(이 스토리 하드닝), 시드 재실행 truncate 유실(이 스토리에서 재시드 금지)
- [Research 2026-07: Railway/Vercel/Supabase 배포 확인] — Railpack·Root Directory·startCommand·Generate Domain·세션 풀러 IPv4·NEXT_PUBLIC 빌드타임 인라인·CORS 프리뷰 정규식·RLS 확인 SQL

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — dev-story 실행

### Debug Log References

- 환경: 로컬 backend `.venv` Python 3.11.9. 백엔드 테스트 `pytest -q` → **9 passed**(기존 7 + 신규 error-handler 2). Starlette httpx2 deprecation 경고 1건(무해).
- `railway.json` JSON 유효성 검증 통과. 앱 임포트 시 `Exception` 핸들러 등록 확인, 라우트(`/departments`·`/health`) 정상.
- 전역 핸들러 RED→GREEN: 핸들러 없을 때 `GET /departments`(db 예외 시뮬레이션) → 평문 `Internal Server Error`(JSON 파싱 실패, RED). 핸들러 추가 후 → 500 + `{"detail":"일시적인 서버 오류가…"}`(GREEN), 내부 예외 문구·스택 미노출 확인.
- **배포 실측(2026-07-14, 사용자 대시보드 + curl/헤드리스 검증):**
  - 백엔드 `https://vibecodinguniv-production.up.railway.app` · 프런트 `https://vibe-coding-univ.vercel.app`
  - `/health` 200, `/departments` 200 → `[{1,내과},{2,이비인후과},{3,정형외과}]`(배포 환경 3계층 관통)
  - 헤드리스 Chrome: 공개 URL 첫 화면에 역할 버튼 + 시드 진료과 렌더, `/staff` 진입(역할 바 + 전체 접근) 확인
  - **배포 중 만난 사고 3건(모두 해결):** ① Railway Root Directory 미설정 → 빌드 실패(→ `backend` 지정). ② `railway.json`의 `$PORT` 명령 미적용으로 앱이 8080 바인딩, 도메인은 3030 라우팅 → 502(→ 도메인 타깃 포트 8080로 정렬). ③ Vercel 초기 배포가 Framework "Other"로 굳어 404, 이후 CORS 미허용 → (→ Framework Preset Next.js 재배포 + Railway `CORS_ORIGIN_REGEX=https://([a-z0-9-]+\.)*vercel\.app`).
  - `DATABASE_URL`은 세션 풀러(사용자 입력) — 앱 기동 성공 = 연결·풀 정상(AC2). CORS 헤더 GET·OPTIONS 200 실측.

### Completion Notes List

- ✅ **Task 1(부분)·Task 6 완료(검증됨)**: `backend/railway.json`(Railpack·uvicorn `$PORT` startCommand)·`backend/.python-version`(3.13) 생성, 전역 예외 핸들러 + 테스트 2건. 백엔드 9 테스트 통과.
- ✅ **코드 변경 최소화 원칙 준수**: CORS·풀러 관련 코드는 1.1이 env로 배선해둬 그대로 보존. 배포는 env 값·대시보드 설정으로 해결(코드 대공사 금지, 안티패턴 회피). `.env.example`에 배포 함정(풀러 IPv4 호스트·CORS 프리뷰 정규식) 문서화만 추가.
- ✅ **Task 0·2·3·4·5 완료(사용자 대시보드 작업 + 실측 검증)**: 사용자가 Railway·Vercel·Supabase 대시보드에서 배포를 수행하고, dev-story가 매 단계 curl/헤드리스로 실측·진단하며 배포 사고 3건(Root Directory·포트 정렬·Framework Preset+CORS)을 짚어 해결. 공개 URL에서 3계층 관통·RLS ON 실증 완료.
- **AC 상태(전부 충족):** AC1 공개 URL 진료과 렌더 ✅ · AC2 CORS 허용 + 세션 풀러 연결 ✅ · AC3 9테이블 RLS ON + 읽기 정상 ✅ · AC4 1일차(2026-07-14) 완료 ✅.
- **배포 주소:** 프런트 `https://vibe-coding-univ.vercel.app` · 백엔드 `https://vibecodinguniv-production.up.railway.app`.
- **후속 참고(deferred-work):** Railway `railway.json`의 `$PORT` startCommand가 하위경로라 미적용 → 현재 도메인 타깃 포트를 8080에 수동 정렬해 동작. 안정적이나, 원하면 Custom Start Command(`--port $PORT`) + 도메인 자동 포트로 정리 가능. 백엔드 `.env`의 직접 호스트 예시는 로컬 전용(배포는 풀러).

### File List

**신규 — backend/**
- `backend/railway.json` (Railway 배포 설정: Railpack builder, uvicorn `$PORT` startCommand, 재시작 정책)
- `backend/.python-version` (Railway Python 3.13 고정)
- `backend/tests/test_error_handler.py` (전역 예외 핸들러 계약 테스트 4건: 인프라 오류→한국어 detail, HTTPException 404, 500 CORS 헤더 있음/없음)

**수정 — backend/**
- `backend/app/main.py` (전역 `@app.exception_handler(Exception)` 추가 — 인프라 오류를 한국어 `{detail}` 500으로 매핑 + 리뷰 수정: 허용 Origin에 500 CORS 헤더 부여)
- `backend/.env.example` (배포 함정 문서화: Supabase 풀러 IPv4 호스트, Vercel 프리뷰 CORS 정규식)

## Change Log

| 날짜 | 변경 | 상태 |
|---|---|---|
| 2026-07-14 | Story 1.2 컨텍스트 생성(배포·RLS 실증). 1.1이 깐 env 배선 확인, Railway/Vercel/Supabase 배포 리서치 확정, 배포 사고 지점(풀러 IPv4·CORS 순서·NEXT_PUBLIC 인라인) 정리. | ready-for-dev |
| 2026-07-14 | dev-story 착수. 자율 구현분 완료: `railway.json`·`.python-version` 생성, 전역 예외 핸들러(한국어 {detail}) + 테스트 2건(백엔드 9 passed), `.env.example` 배포 함정 문서화. Task 0·2·3·4·5(Railway/Vercel/Supabase 대시보드)는 사용자 계정·시크릿 필요 → 단계별 안내 후 HALT. | in-progress |
| 2026-07-14 | 사용자와 함께 배포 완료. Railway(백엔드)·Vercel(프런트) 배포, 배포 사고 3건 해결(Root Directory 미설정→빌드실패, 포트 3030↔8080 불일치→502, Framework "Other"→404 + CORS 미허용). 공개 URL에서 3계층 관통(시드 진료과 렌더)·직원 진입·9테이블 RLS ON 실측. 백엔드 9 테스트 통과. **6개 Task·4개 AC 전부 완료.** | in-progress → review |
| 2026-07-14 | 코드 리뷰(bmad 3계층: Blind/Edge/Auditor). patch 1건(전역 핸들러 500 응답 CORS 헤더 누락) 수정 적용 — 허용 Origin에 CORS 헤더 직접 부여, 테스트 3건 추가(전체 11 passed), 실측 재확인. defer 1건(railway.json 포트) deferred-work 기록, dismiss 8건. Codex 리뷰는 인증 만료로 미실행. | review → done |
