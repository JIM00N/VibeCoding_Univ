---
baseline_commit: 5a082a075f86a78cb20a1410b17fa8746a154cdd
---

# Story 1.2: 배포 (Vercel + Railway) + RLS 실증

Status: ready-for-dev

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

- [ ] **Task 0 — 배포 전제 정리(사용자 안내·승인)** (AC: 1, 4)
  - [ ] 현재 브랜치는 `story/1-1-...`, 원격은 `git@github.com:JIM00N/VibeCoding_Univ.git`. 배포 플랫폼은 보통 **`main`(프로덕션) + 브랜치(프리뷰)** 를 배포한다 → 1.1·1.2 작업을 `main`에 올릴지(머지/푸시) 사용자와 확정하고 push
  - [ ] 사용자에게 필요한 계정 확인: **GitHub(있음)·Railway·Vercel·Supabase 연결 문자열**. 없으면 여기서 멈추고 안내(로그인은 사용자가 직접, `!` 프리픽스로 세션에서 실행 가능)
  - [ ] Supabase에서 **세션 풀러(Session pooler) 연결 문자열**을 미리 확보하도록 안내 — Dashboard → Connect → **Session pooler**(포트 5432). ⚠️ 직접 호스트(`db.<ref>.supabase.co`)가 아니라 **풀러 호스트**(`...pooler.supabase.com`, IPv4)여야 Railway에서 연결된다(아래 배포 사고 지점 ①)
- [~] **Task 1 — Railway 배포 설정 파일 작성(신규 소스)** (AC: 1, 2) — *파일 생성·검증 완료, 커밋만 사용자 대기*
  - [x] `backend/railway.json` 생성: builder `RAILPACK`, `deploy.startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"`. JSON 유효성·앱 임포트 검증 통과
  - [x] `backend/.python-version` 에 `3.13` 작성(Railway 기본 3.13 명시 고정)
  - [ ] 커밋·push(GitHub 원격에 올려야 Railway/Vercel이 봄) — **사용자 승인 대기**(Task 0의 배포 브랜치 결정과 함께)
- [ ] **Task 2 — Railway 백엔드 배포(사용자 대시보드 작업)** (AC: 1, 2)
  - [ ] Railway에서 GitHub 레포 연결 → 서비스 생성. **Service → Settings → Root Directory = `backend`**(모노레포 하위 디렉터리 지정, 대시보드 전용 설정)
  - [ ] 필요 시 Config 파일 경로를 `backend/railway.json`으로 지정(루트가 아니라 하위에 있으므로). 안 잡히면 **Deploy → Custom Start Command**에 위 uvicorn 명령을 직접 입력(폴백)
  - [ ] **Variables** 설정(사용자 값 입력): `DATABASE_URL`(세션 풀러 5432) · `CORS_ORIGINS`(Vercel 프로덕션 URL) · `CORS_ORIGIN_REGEX`(Vercel 프리뷰 정규식, 아래). CORS 값은 Vercel URL 확정 후(Task 3) 다시 채워야 하니 순서 주의
  - [ ] **Settings → Networking → Generate Domain**으로 공개 HTTPS URL(`*.up.railway.app`) 생성 → 이 값이 프런트의 `NEXT_PUBLIC_API_BASE_URL`
  - [ ] 검증: `GET https://<railway-url>/health` → `{"status":"ok"}`, `GET https://<railway-url>/departments` → 시드 진료과 3행(브라우저나 curl). ⚠️ 여기서 500/빈 목록이면 배포 사고 지점 ①②(풀러·소유자 역할) 점검
- [ ] **Task 3 — Vercel 프런트 배포(사용자 대시보드 작업)** (AC: 1)
  - [ ] Vercel에서 같은 GitHub 레포 연결 → **Project → Settings → Build and Deployment → Root Directory = `frontend`**. Next.js 자동 감지(빌드·출력 무설정)
  - [ ] **Environment Variables → `NEXT_PUBLIC_API_BASE_URL` = `https://<railway-url>`**(Task 2의 Railway 공개 URL, 말단 슬래시 없이). Production·Preview 모두 설정. ⚠️ `NEXT_PUBLIC_*`는 **빌드 타임에 번들로 인라인** → 값 바꾸면 **재배포** 필요
  - [ ] 배포 실행 → Vercel 프로덕션 URL 확보 → 이 값을 Railway `CORS_ORIGINS`에 반영(Task 2로 되돌아가 채움, Railway 재배포)
- [ ] **Task 4 — RLS 실증(9테이블 ON + 읽기 정상)** (AC: 3)
  - [ ] Supabase에서 아래 SQL로 `public` 9테이블 `relrowsecurity = true` 전수 확인(또는 Advisors → Security 에서 `rls_disabled_in_public` 0건)
  - [ ] 배포된 백엔드 `GET /departments`가 **행을 반환**함을 재확인(RLS ON이어도 소유자 역할이라 우회 — 빈 목록 아님). 1.1에서 로컬 실증됐으나 **배포 환경에서 다시** 확인(NFR-4 완료 정의는 "배포 후" 확인)
- [ ] **Task 5 — 공개 URL 브라우저 관통 검증** (AC: 1, 4)
  - [ ] 공개 Vercel URL을 브라우저(헤드리스 Chrome 스크린샷 포함)로 열어 첫 화면에 **역할 버튼 + 시드 진료과 렌더** 확인 = 배포 환경 3계층 관통 실증
  - [ ] `[직원]` 클릭 → 직원 화면 진입까지 공개 URL에서 동작 확인
  - [ ] 프리뷰 배포 URL(다른 서브도메인)에서도 CORS 통과(진료과 렌더)로 프리뷰 정규식 검증
- [x] **Task 6 — (하드닝) 인프라 오류 전역 예외 핸들러** (AC: 2) — *deferred-work 항목, 배포 하드닝*
  - [x] `backend/app/main.py`에 `@app.exception_handler(Exception)` 추가 — DB 다운·풀 타임아웃 등 미처리 예외를 `{"detail": "일시적인 서버 오류가…"}`(한국어) + 500으로 매핑(AD-10 계약을 인프라 오류까지 확장). 실제 원인·스택은 서버 로그에만 남기고 클라이언트엔 노출 안 함(UX-DR10). 테스트 2건 추가(인프라 오류→한국어 detail, HTTPException 404는 그대로) 통과

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
- ⚠️ **배포 실측(Railway/Vercel/Supabase 대시보드)은 미실행** — 사용자 계정·시크릿(Supabase 세션 풀러 문자열) 필요. Task 0·2·3·4·5는 사용자 배포 후 진행.

### Completion Notes List

- ✅ **Task 1(부분)·Task 6 완료(검증됨)**: `backend/railway.json`(Railpack·uvicorn `$PORT` startCommand)·`backend/.python-version`(3.13) 생성, 전역 예외 핸들러 + 테스트 2건. 백엔드 9 테스트 통과.
- ✅ **코드 변경 최소화 원칙 준수**: CORS·풀러 관련 코드는 1.1이 env로 배선해둬 그대로 보존. 배포는 env 값·대시보드 설정으로 해결(코드 대공사 금지, 안티패턴 회피). `.env.example`에 배포 함정(풀러 IPv4 호스트·CORS 프리뷰 정규식) 문서화만 추가.
- ⏸ **Task 0·2·3·4·5 사용자 대기(HALT)**: 이 스토리의 핵심(공개 URL 배포 + RLS 실증)은 Jiseok님의 **Railway·Vercel·Supabase 계정 로그인과 시크릿 입력**이 필요합니다. 대신 로그인하거나 클라우드 리소스를 생성할 수 없어, 아래 대화에 단계별 배포 안내를 제공하고 멈춥니다. 배포·공개 URL 확보 후 Task 4(RLS 실증)·Task 5(브라우저 관통 검증)를 이어서 완료하면 됩니다.
- **AC 상태:** AC2의 CORS·풀러 방어(코드/설정)는 준비 완료 · AC1(공개 URL 렌더)·AC3(배포 후 RLS 실증)·AC4(1일차 완료)는 **배포 실행 후 충족**.

### File List

**신규 — backend/**
- `backend/railway.json` (Railway 배포 설정: Railpack builder, uvicorn `$PORT` startCommand, 재시작 정책)
- `backend/.python-version` (Railway Python 3.13 고정)
- `backend/tests/test_error_handler.py` (전역 예외 핸들러 계약 테스트 2건)

**수정 — backend/**
- `backend/app/main.py` (전역 `@app.exception_handler(Exception)` 추가 — 인프라 오류를 한국어 `{detail}` 500으로 매핑)
- `backend/.env.example` (배포 함정 문서화: Supabase 풀러 IPv4 호스트, Vercel 프리뷰 CORS 정규식)

## Change Log

| 날짜 | 변경 | 상태 |
|---|---|---|
| 2026-07-14 | Story 1.2 컨텍스트 생성(배포·RLS 실증). 1.1이 깐 env 배선 확인, Railway/Vercel/Supabase 배포 리서치 확정, 배포 사고 지점(풀러 IPv4·CORS 순서·NEXT_PUBLIC 인라인) 정리. | ready-for-dev |
| 2026-07-14 | dev-story 착수. 자율 구현분 완료: `railway.json`·`.python-version` 생성, 전역 예외 핸들러(한국어 {detail}) + 테스트 2건(백엔드 9 passed), `.env.example` 배포 함정 문서화. Task 0·2·3·4·5(Railway/Vercel/Supabase 대시보드)는 사용자 계정·시크릿 필요 → 단계별 안내 후 HALT. | in-progress |
