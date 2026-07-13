---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics']
inputDocuments:
  - planning-artifacts/prds/prd-hospital-care-2026-07-12/prd.md
  - planning-artifacts/prds/prd-hospital-care-2026-07-12/addendum.md
  - planning-artifacts/architecture/architecture-hospital-care-2026-07-13/ARCHITECTURE-SPINE.md
  - planning-artifacts/ux-designs/ux-hospital-care-2026-07-13/DESIGN.md
  - planning-artifacts/ux-designs/ux-hospital-care-2026-07-13/EXPERIENCE.md
---

# hospital-care - Epic Breakdown

## Overview

병원 진료관리 풀스택 서비스(환자 포털 + 직원 진료관리)의 에픽·스토리 분해. PRD·아키텍처 스파인·UX 스파인의 요구를 구현 가능한 스토리로 나눈다. **가드레일: 넓이보다 한 줄기 관통 우선. P0를 배포 가능하게 먼저 관통시킨 뒤 P1을 얹는다.**

## Requirements Inventory

### Functional Requirements

- **FR-1**: 첫 화면에서 사용자가 `[환자]`/`[직원]` 역할을 선택한다(실제 로그인 없음).
- **FR-2**: `[환자]` 선택 시 등록 환자 목록에서 본인을 고르고, 이후 환자 화면은 선택된 환자 데이터만 보여준다(앱 레벨 필터 — 기밀 격리 아님).
- **FR-3**: `[직원]` 선택 시 별도 신원 선택 없이 직원 화면(전체 접근)으로 진입한다.
- **FR-4**: 직원이 신규 환자를 등록한다(이름 필수·생년월일·성별·연락처).
- **FR-5**: 직원이 환자 목록을 조회하고 이름으로 찾는다.
- **FR-6**: 환자가 진료과와 30분 슬롯을 골라 예약을 생성한다. **(P0)** 담당 의사 직접 선택 필수(`doctor_id` 항상 채워짐). **(P1)** 의사 미선택 시 자동 배정, 빈 의사 없으면 예약 불가.
- **FR-7**: 직원이 예약을 확정/취소하고, 필요 시 담당 의사를 변경(재배정)한다. 재배정 시 가용성(FR-15) 재검사.
- **FR-8**: 예약 상태(대기→확정→완료/취소)가 흐름에 따라 갱신·표시된다. 기록 작성 시 같은 트랜잭션에서 완료 전이. 정상 예약당 기록 1건(부분 유니크).
- **FR-9**: 확정된 예약에 진료 기록(진단·소견·진료일시)을 작성한다. 발생 진료과 자체 보관. 작성 시점에 담당 의사 지정 필요.
- **FR-10**: 진료 기록에 처방을 0개 이상 추가한다(약 + 용법·용량 + 일수).
- **FR-11**: 환자가 자기 예약 목록과 지난 진료 기록(진단·처방 포함)을 조회한다.
- **FR-12**: 직원이 환자별 전체 진료 내역(예약·진료·처방)을 조회한다.
- **FR-13**: 병원(1)·진료과·의사·약 등 참조 데이터가 앱 구동에 필요한 만큼 존재한다(관리 화면 없이 시드).
- **FR-14**: 시연용 초기 시드 데이터(환자·진료과·의사·약)를 포함한다.
- **FR-15 (P1)**: 예약과 walk-in이 공통 가용성 단위 (의사, 30분 슬롯)을 공유. 한 (의사, 슬롯)에 활성(대기·확정) 예약 또는 walk-in 하나만. 앱(FastAPI)이 충돌 차단(단일 세션 보장, TOCTOU 범위 밖).
- **FR-16 (P1)**: walk-in 즉시 진료 — 예약 없이 진료과 선택 → 빈 의사 배정 → 기록(`appointment_id` 없이). 발생 진료과=배정 의사 소속. 빈 의사 없으면 거부(다른 시각 안내, 대기열 없음).

### NonFunctional Requirements

- **NFR-1 (배포)**: 공개 URL로 시연 가능하게 배포 — **프런트 Vercel · 백엔드(FastAPI) Railway**(아키텍처 결정). 초반에 배포 뼈대부터.
- **NFR-2 (데이터 정합성)**: 실제 Supabase(PostgreSQL) 사용, ERD의 FK·CHECK 제약 준수.
- **NFR-3 (스택)**: 프런트 Next.js, 백엔드 FastAPI. 브라우저는 Supabase 직접 호출 금지, FastAPI만 호출.
- **NFR-4 (인증·보안)**: 로그인 제외(역할 선택 대체). 9테이블 RLS ON(anon 차단), 모든 DB 접근은 FastAPI 서버측 키. 환자 격리는 API 필터. 완료 정의: 배포 전 advisor로 9테이블 RLS ON 확인.
- **NFR-5 (사용성)**: 초급자·데모 관점 — 브라우저에서 전체 흐름을 눈으로 끝까지 확인 가능. 한국어 UI.

### Additional Requirements

(아키텍처 스파인 — 기술 불변식/구현 제약. 스토리의 기술적 수용 기준에 반영)

- **[스타터]** greenfield. **Next.js App Router(`create-next-app`) + shadcn/ui + Tailwind**(프런트), **FastAPI + psycopg 3**(백엔드). → Epic 1 Story 1(스캐폴딩)에 반영.
- **AD-1**: 3-tier 경계 — 브라우저 → FastAPI → Supabase. 프런트는 DB/시크릿 미접근.
- **AD-2**: 계층형 백엔드 routers→services→db, DB I/O는 db 계층 단일 소유.
- **AD-3**: 슬롯 키 = 하나의 정규화 식(30분 floor UTC). 점유 판정은 SQL 충돌쿼리(양 컬럼 동일 floor). Python `to_slot()`은 미러.
- **AD-4**: 가용성 검사 = 단일 `check_and_occupy(conn,…)`, 호출자 트랜잭션 받아 검사+삽입 한 트랜잭션. 충돌원=appointment(대기·확정) ∪ walk-in medical_record(appointment_id null). 의사변경=자기행 제외+이전슬롯 해제+새슬롯 점유.
- **AD-5**: appointment.status 전이는 예약 서비스만. 기록은 확정 예약에만 → 같은 tx에서 완료. walk-in은 status 미변경.
- **AD-6**: medical_record는 작성 시점 hospital_department_id·doctor_id 자체 저장(이력 불변). 예약기반=예약의 과, walk-in=배정의사 현재 소속.
- **AD-7**: RLS deny-by-default(anon 정책 미생성) + DB는 FastAPI DATABASE_URL(env 전용, 번들 금지). 배포 후 advisor 확인.
- **AD-8**: 환자 스코핑 = `?patient_id=` 쿼리 필터(보안 아님, 데모 고지).
- **AD-9**: 스키마 변경은 db/migrations/ SQL만. PK=bigint IDENTITY(정수). P0 마이그레이션 3종(RLS·부분유니크 uq_medical_record_appointment·reserved_at 30분 CHECK) + 시드. 시드는 OVERRIDING SYSTEM VALUE.
- **AD-10**: 단일 API 계약 — 리소스당 응답모델 1개 동일 모양, 오류 `{detail}`, 시각 ISO-8601 UTC. 프런트 단일 API 클라이언트 `lib/api.ts`.
- **[배포 운영]**: DATABASE_URL=Supabase session 풀러(5432); transaction 풀러(6543)면 psycopg `prepare_threshold=None`. CORS는 Vercel 프리뷰 URL까지 허용.
- **[실측 baseline]**: Supabase `fphsxoweprztrekckzui`에 9테이블 배포됨, **현재 RLS OFF**(마이그레이션 필요), 시드 0행.

### UX Design Requirements

(UX 스파인 DESIGN.md + EXPERIENCE.md — 구현 가능한 UX 작업 항목)

- **UX-DR1 (디자인 토큰)**: shadcn/ui + Tailwind 기반. primary emerald `#047857`(emerald-700, 흰 텍스트 WCAG AA 통과), Pretendard 폰트, shadcn 기본 상속. 토큰 설정.
- **UX-DR2 (상태 배지)**: `appointment.status` 4값 → 색+한국어 텍스트 고정 매핑(대기=amber, 확정=blue, 완료=green, 취소=gray). 전 화면 동일. 색만으로 구분 금지(텍스트 병기).
- **UX-DR3 (슬롯 피커)**: 30분 격자 컴포넌트. available/selected/taken(예약됨·비활성) 3상태. 접근 가능한 셀 이름. 서버 재검증 시 taken 갱신. (`mockups/booking.html`)
- **UX-DR4 (역할 컨텍스트 바)**: 상단 고정 — 현재 역할 + 선택 환자 + 전환 액션. 새로고침해도 컨텍스트 유지.
- **UX-DR5 (처방 행 반복)**: 진료 기록 폼 내 약+용법·용량+일수 행, 추가/삭제, 0..N. (`mockups/record.html`)
- **UX-DR6 (확인 다이얼로그)**: 파괴적 액션(예약 취소)에 shadcn Dialog 확인. 모달 1단계.
- **UX-DR7 (상태 패턴)**: 로딩(Skeleton)·빈 상태·성공 toast·일반 오류 toast·**도메인 거부**(슬롯 충돌 red 인라인, walk-in 빈 의사 없음 red Dialog). 비관적 저장.
- **UX-DR8 (무인증 데모 어포던스)**: 환자 신원 선택 시 "데모라 누구나 선택 가능, 보안 아님" 고지 배너(AD-8).
- **UX-DR9 (접근성 바닥)**: WCAG AA — 모든 입력 라벨, 포커스 링, 상태 텍스트 병기, 키보드 조작(폼·슬롯피커), 한국어 SR 라벨.
- **UX-DR10 (마이크로카피·톤)**: 한국어 해요체. 환자=안심·친근, 직원=간결. 오류 메시지 정직·실행가능("이 시간엔 이미 예약이 있어요…").
- **UX-DR11 (반응형)**: 직원=데스크톱 밀도 표(≥md), 모바일은 카드로 접힘. 환자=단일 컬럼 모바일 친화.

### FR Coverage Map

- **FR-1**: Epic 1 — 역할(환자/직원) 선택 진입
- **FR-2**: Epic 1 — 환자 신원 선택 + 앱 레벨 데이터 필터(역할 컨텍스트 확립; 조회 화면에서 실사용)
- **FR-3**: Epic 1 — 직원 화면(전체 접근) 진입
- **FR-4**: Epic 1 — 신규 환자 등록
- **FR-5**: Epic 1 — 환자 목록 조회·이름 검색
- **FR-6**: Epic 2 (P0 — 담당 의사 직접 선택 예약 생성) · Epic 5 (P1 — 의사 미선택 시 자동 배정·거부)
- **FR-7**: Epic 2 (P0 — 확정/취소/의사 변경) · Epic 5 (P1 — 재배정 시 가용성 재검사)
- **FR-8**: Epic 2 (대기→확정→취소 전이) · Epic 3 (기록 작성 시 같은 tx에서 완료 전이)
- **FR-9**: Epic 3 — 확정 예약에 진료 기록(진단·소견·진료일시) 작성, 발생 진료과 자체 보관
- **FR-10**: Epic 3 — 진료 기록에 처방 0..N 추가
- **FR-11**: Epic 4 — 환자가 자기 예약·지난 진료기록(진단·처방) 조회
- **FR-12**: Epic 4 — 직원이 환자별 전체 진료 내역 조회
- **FR-13**: Epic 1 — 참조 데이터(병원1·진료과·의사·약) 시드 존재
- **FR-14**: Epic 1 — 시연용 초기 시드 데이터 포함
- **FR-15**: Epic 5 — (의사, 30분 슬롯) 공통 가용성 충돌 차단(앱 레벨)
- **FR-16**: Epic 5 — walk-in 즉시 진료(예약 없이 빈 의사 배정·기록, 빈 의사 없으면 거부)

**NFR 매핑:** NFR-1(배포)·NFR-2(데이터 정합성)·NFR-3(스택)·NFR-4(RLS·보안) → Epic 1(걷는 뼈대에서 뼈대 확립). NFR-5(사용성·한국어 UI) → 전 에픽 횡단(UX-DR로 각 스토리에 반영).

## Epic List

### Epic 1: 진입 & 환자 관리 (걷는 뼈대 + 배포)
배포된 URL에 들어가 역할(환자/직원)을 선택하고, 직원이 신규 환자를 등록·검색할 수 있다. 이 에픽의 첫 두 스토리에서 뼈대를 세운다 — Story 1.1(로컬 수직 슬라이스)에서 그린필드 스캐폴딩(Next.js App Router + shadcn/ui + Tailwind / FastAPI + psycopg 3), P0 마이그레이션 3종(RLS ON·부분 유니크 `uq_medical_record_appointment`·`reserved_at` 30분 CHECK) + 시드, 단일 API 계약(`lib/api.ts`)을 세우고, Story 1.2(배포)에서 프런트 Vercel·백엔드 Railway 배포 뼈대와 RLS 실증을 얹는다 — 이후 모든 에픽이 이 뼈대 위에서 동작한다.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-13, FR-14
**NFRs:** NFR-1, NFR-2, NFR-3, NFR-4
**Architecture:** 스타터, AD-1(3-tier), AD-2(계층형), AD-7(RLS deny-by-default), AD-8(환자 스코핑 필터), AD-9(마이그레이션·시드), AD-10(단일 API 계약)
**UX:** UX-DR1(디자인 토큰), UX-DR4(역할 컨텍스트 바), UX-DR8(무인증 데모 고지), UX-DR9(접근성 바닥), UX-DR10(마이크로카피), UX-DR11(반응형)

### Epic 2: 예약 (환자가 잡고, 직원이 관리)
환자가 진료과·30분 슬롯·담당 의사를 직접 선택해 예약을 생성하고, 직원이 예약을 확정/취소하거나 담당 의사를 변경하며, 상태(대기→확정→취소)가 흐름에 따라 갱신·표시된다. (P0 — 가용성 충돌 검사·자동 배정은 Epic 5로 분리.)
**FRs covered:** FR-6 (P0), FR-7 (P0), FR-8 (대기→확정→취소)
**Architecture:** AD-5(예약 서비스만 status 전이), AD-10(API 계약)
**UX:** UX-DR2(상태 배지), UX-DR3(30분 슬롯 피커), UX-DR6(취소 확인 다이얼로그), UX-DR7(성공/오류 상태 패턴)

### Epic 3: 진료 기록 & 처방 (의사가 기록)
확정된 예약에 대해 진단·소견·진료일시를 진료 기록으로 남기고 처방을 0..N개 추가한다. 기록을 저장하면 같은 트랜잭션에서 그 예약이 완료로 전이되고, 기록은 발생 진료과·담당 의사를 작성 시점 값으로 자체 보관한다(이력 불변).
**FRs covered:** FR-9, FR-10, FR-8 (완료 전이)
**Architecture:** AD-5(기록→완료 전이), AD-6(진료과·의사 자체 저장)
**UX:** UX-DR5(처방 행 반복), UX-DR7(성공 toast)

### Epic 4: 조회 (P0 한 줄기 완성)
환자가 자기 예약 목록과 지난 진료 기록(진단·처방 포함)을 조회하고, 직원이 환자별 전체 진료 내역(예약·진료·처방)을 조회한다. 이 에픽 완료로 최소 성공 기준인 P0 E2E 한 줄기(등록→예약→확정→기록→조회)가 배포 URL에서 닫힌다.
**FRs covered:** FR-11, FR-12
**Architecture:** AD-8(환자 스코핑 `?patient_id=` 필터), AD-10(API 계약)
**UX:** UX-DR11(반응형 조회 화면), UX-DR2(상태 배지 재사용)

### Epic 5: 가용성 안전장치 & Walk-in (P1 — 관통 후 얹기)
P0 한 줄기가 배포된 뒤 안전 강화를 얹는다: 예약 생성·의사 배정/변경·walk-in 생성 시 앱(FastAPI)이 (의사, 30분 슬롯) 충돌을 차단하고, 예약 시 의사 미선택이면 해당 진료과의 빈 의사를 자동 배정(빈 의사 없으면 예약 불가)하며, 예약 없이 온 환자를 빈 의사에게 즉시 진료·기록(빈 의사 없으면 거부)한다.
**FRs covered:** FR-15, FR-16, FR-6 (P1 자동 배정), FR-7 (P1 재배정 재검사)
**Architecture:** AD-3(슬롯 정규화 키), AD-4(`check_and_occupy` 단일 관문)
**UX:** UX-DR7(도메인 거부 — 슬롯 충돌 인라인, walk-in 빈 의사 없음 Dialog)

## 횡단 규약 (Cross-cutting Conventions)

### UX 톤·오류 문구 규약 (UX-DR10)

- 모든 UI 문구는 한국어 **해요체**. 환자 화면은 안심·친근한 톤, 직원 화면은 간결한 톤.
- 오류·거부 메시지는 **정직하고 실행 가능**하게 — 무엇이 왜 막혔고 무엇을 하면 되는지 알려준다(예: "이 시간엔 이미 예약이 있어요. 다른 시간을 골라 주세요."). 스택 추적·내부 기술 용어 노출 금지.
- 전 화면 횡단 규약이며, 각 스토리의 도메인 거부·검증 AC(예: Story 2.1·3.1·5.1·5.3의 4xx `{detail}` 한국어 메시지)는 이 문구 규약을 따른다.

## Epic 1: 진입 & 환자 관리 (걷는 뼈대 + 배포)

배포된 URL에 들어가 역할(환자/직원)을 선택하고, 직원이 신규 환자를 등록·검색하며, 환자가 목록에서 본인 신원을 잡을 수 있다. 첫 두 스토리에서 뼈대를 세운다 — Story 1.1(로컬 수직 슬라이스)에서 그린필드 스캐폴딩·P0 마이그레이션 3종+시드·단일 API 계약을 로컬로 관통시키고, Story 1.2(배포)에서 프런트 Vercel·백엔드 Railway 배포와 RLS 실증을 얹는다. 이후 모든 에픽이 이 뼈대 위에서 동작하게 한다.

### Story 1.1: 로컬 수직 슬라이스 (스캐폴딩 + 마이그레이션/시드 + 역할 선택)

As a 서비스를 처음 여는 사용자,
I want 로컬에서 브라우저→FastAPI→Supabase가 실제로 관통하는 최소 뼈대에서 역할을 고를 수 있기를,
So that 배포 전에 전체 계층이 도는 것을 확인하고 이후 모든 기능이 얹힐 땅을 세운다.

**Acceptance Criteria:**

**Given** 구조 시드대로 monorepo(`frontend/`·`backend/`·`db/`)가 생성되고 `lib/api.ts` 단일 API 클라이언트가 존재할 때
**When** 개발자가 `next dev`와 `uvicorn`으로 로컬 실행한다
**Then** 첫 화면에 `[환자]`/`[직원]` 두 역할 버튼이 뜬다
**And** 프런트는 오직 `lib/api.ts`를 통해서만 백엔드를 호출하고 DB/시크릿을 모른다 (AD-1, AD-10)

**Given** shadcn/ui + Tailwind 기반 프런트에서
**When** 디자인 토큰을 설정한다
**Then** primary를 emerald `#047857`로, 본문 폰트를 Pretendard로 지정하고 나머지는 shadcn 기본을 상속한다 — 이후 슬롯 피커(2.1)·상태 배지(2.2) 등이 이 토큰 위에서 일관되게 렌더된다 (UX-DR1)

**Given** `db/migrations/001_rls.sql`·`002_uq_record.sql`·`003_reserved_at_check.sql`과 `db/seed/004_seed.sql`을 준비했을 때
**When** Supabase 프로젝트(`fphsxoweprztrekckzui`)에 마이그레이션·시드를 적용한다
**Then** 9테이블 RLS ON(anon 정책 미생성)·부분 유니크 인덱스 `uq_medical_record_appointment`·`reserved_at` 30분 CHECK가 존재한다
**And** 시연 시드(병원 1·진료과·진료과당 의사 2명 이상·약·환자 수명)가 `OVERRIDING SYSTEM VALUE`로 삽입된다 (AD-9, FR-13, FR-14)

**Given** 시드를 적용한 뒤
**When** 참조 테이블 행수를 점검한다
**Then** 병원 1행·진료과 존재·진료과당 의사 2명 이상·약·환자 수명이 실제로 존재함을 확인한 뒤에만 다음 작업으로 진행한다(시드 0행으로 아무 화면도 시연 못 하는 실패 차단) (FR-13, FR-14)

**Given** 단일 병원 전제에서
**When** 앱이 "진료과"를 다룬다
**Then** 진료과 선택이 그 단일 병원의 해당 `hospital_department` 행으로 결정적으로 매핑되고, 이후 의사 후보는 그 `hospital_department` 소속 의사에서만 나온다(FR-6 예약이 딛고 설 매핑을 여기서 확정) (AD-6)

**Given** 로컬에서 앱이 떠 있을 때
**When** 첫 화면이 `GET /departments`(refdata)를 호출한다
**Then** 브라우저→FastAPI→Supabase를 **관통해 시드된 진료과 행이 화면에 렌더**된다(정적 화면이 아닌 실제 수직 슬라이스) (AD-1)

**Given** 첫 화면에서 `[직원]`을 선택할 때
**When** 클릭한다
**Then** 별도 신원 선택 없이 직원 화면(전체 데이터 접근)으로 진입한다 (FR-3)

**Given** 로컬 빌드 산출물이 있을 때
**When** 프런트 브라우저 번들을 검사한다
**Then** `DATABASE_URL`·서버 자격증명이 번들에 포함되지 않는다 (AD-1, AD-7)

### Story 1.2: 배포 (Vercel + Railway) + RLS 실증

As a 서비스를 처음 여는 사용자,
I want 1.1의 뼈대가 공개 URL에서 그대로 관통하기를,
So that P0가 실제 배포 URL에서 돌고, 배포 사고 부류를 마감 직전이 아니라 1일차에 드러낸다.

**Acceptance Criteria:**

**Given** 1.1 뼈대를 프런트 Vercel, 백엔드(FastAPI) Railway에 배포했을 때
**When** 공개 URL로 접속한다
**Then** 첫 화면이 `NEXT_PUBLIC_API_BASE_URL`로 `GET /departments`를 호출해 시드 진료과를 렌더하며, 브라우저→FastAPI→Supabase 관통이 배포 환경에서도 동작한다 (NFR-1)

**Given** 배포 환경에서
**When** 프런트가 백엔드를 실제로 호출한다
**Then** CORS가 Vercel 프로덕션·프리뷰 오리진을 허용하고, `DATABASE_URL`은 세션 풀러(5432, 필요 시 `prepare_threshold=None`)를 가리켜 AD-4/AD-5 트랜잭션이 배포 환경에서 깨지지 않는다 (운영 봉투, 브리프 리스크)

**Given** 배포가 완료됐을 때
**When** Supabase advisor(또는 `pg_policies`)로 점검한다
**Then** 9테이블 모두 RLS ON임이 확인된다 (NFR-4 완료 정의)
**And** RLS ON 이후에도 FastAPI 경유 시드 읽기가 행을 정상 반환함을 확인한다(소유자 역할·RLS 우회 설정 검증 — "에러 없이 어디서나 빈 목록" 실패 차단) (AD-7, NFR-4)

**Given** 마감(2026-07-16)까지 3일뿐일 때
**When** 착수 순서를 정한다
**Then** 1.2(배포·RLS 실증)를 **1일차 종료 전에 완료**한다 — 배포를 뒤로 미루면 P0 관통 자체가 위험해진다 (브리프 리스크)

### Story 1.3: 직원 신규 환자 등록

As a 접수 직원,
I want 신규 환자를 이름·생년월일·성별·연락처로 등록하기를,
So that 처음 온 환자를 시스템에 올려 이후 예약·진료로 이을 수 있다.

**Acceptance Criteria:**

**Given** 직원 화면의 환자 등록 폼에서
**When** 이름(필수)·생년월일·성별·연락처를 입력하고 저장한다
**Then** `POST /patients`로 환자가 생성되고 응답이 리소스 정규 모델(정수 `id` + 평평한 표시 필드)로 온다 (FR-4, AD-10)

**Given** 이름이 비어 있을 때
**When** 저장을 시도한다
**Then** 라벨된 인라인 오류로 제출을 막고, 서버 도달 시 4xx `{"detail": ...}`(한국어)를 반환한다 (AD-10, UX-DR9)

**Given** 등록에 성공했을 때
**When** 저장이 끝난다
**Then** 성공 toast를 띄우고 환자가 목록/후속 선택에서 즉시 사용 가능하다 (UX-DR7)

### Story 1.4: 직원 환자 목록·이름 검색

As a 접수 직원,
I want 환자 목록을 보고 이름으로 찾기를,
So that 재방문 환자를 빠르게 특정해 예약·진료를 이어간다.

**Acceptance Criteria:**

**Given** 시드 및 등록된 환자들이 있을 때
**When** 직원이 환자 목록 화면을 연다
**Then** `GET /patients`로 목록이 표시된다 (FR-5)

**Given** 이름 일부를 입력했을 때
**When** 검색한다
**Then** `GET /patients?search=`로 이름 부분 일치 결과만 필터되어 나온다 (FR-5)

**Given** 데스크톱과 모바일에서
**When** 화면 폭이 바뀐다
**Then** ≥md에서는 밀도 있는 표, 모바일에서는 카드로 접혀 표시된다 (UX-DR11)

**Given** 검색 결과가 없을 때
**When** 조회한다
**Then** 빈 상태 UI를 보여준다 (UX-DR7)

### Story 1.5: 환자 신원 선택 & 역할 컨텍스트 바

As a 환자,
I want 등록 환자 목록에서 본인을 골라 신원을 잡기를,
So that 이후 화면이 내 데이터만 보여준다(로그인 대체).

**Acceptance Criteria:**

**Given** 첫 화면에서 `[환자]`를 선택했을 때
**When** 등록 환자 목록(Story 1.4의 `GET /patients` 재사용)에서 본인을 선택한다
**Then** 이후 환자용 조회 엔드포인트는 `?patient_id=`로 그 환자만 필터한다 (FR-2, AD-8)

**Given** 환자 신원이 선택된 상태에서
**When** 화면을 이동하거나 새로고침한다
**Then** 상단 역할 컨텍스트 바가 현재 역할 + 선택 환자 + 전환 액션을 유지해 보여준다 (UX-DR4)

**Given** 환자 신원 선택 화면에서
**When** 진입한다
**Then** "데모라 누구나 선택 가능하며 보안 격리가 아님"을 알리는 고지 배너가 표시된다 (UX-DR8, AD-8)

## Epic 2: 예약 (환자가 잡고, 직원이 관리)

환자가 진료과·30분 슬롯·담당 의사를 직접 선택해 예약을 생성하고, 직원이 예약을 확정/취소하거나 담당 의사를 변경하며, 상태(대기→확정→취소)가 흐름에 따라 갱신·표시된다. 가용성 충돌 검사·자동 배정은 Epic 5(P1)로 분리하고, 이 에픽은 P0 예약 한 줄기를 세운다.

### Story 2.1: 환자 예약 생성 (진료과·30분 슬롯·담당 의사 직접 선택)

As a 환자,
I want 진료과·시각(30분 슬롯)·담당 의사를 골라 예약을 만들기를,
So that 전화 한 통 없이 앱에서 진료 예약을 잡는다.

**Acceptance Criteria:**

**Given** 환자 신원이 선택된 상태(Epic 1)에서
**When** 진료과를 고르고 30분 슬롯 피커에서 시각을 선택하고 담당 의사를 직접 선택해 제출한다
**Then** `POST /appointments`로 `status=대기`이고 `doctor_id`가 채워진 예약이 생성된다 (FR-6 P0, AD-5 기본 상태)
**And** `doctor_id`가 항상 채워져 이후 진료 기록의 `doctor_id NOT NULL`까지 정합이 유지된다

**Given** 예약 화면의 슬롯 피커가
**When** 렌더된다
**Then** 30분 격자 셀이 available/selected 상태로 표시되고, 각 셀에 접근 가능한 이름(SR 라벨)이 있으며 키보드로 조작 가능하다 (UX-DR3, UX-DR9)

**Given** 담당 의사를 선택하지 않았을 때(P0에서 필수)
**When** 제출을 시도한다
**Then** 예약이 생성되지 않고 인라인 안내를 보여준다 (FR-6 P0)

**Given** 예약 시각을 선택했을 때
**When** 저장한다
**Then** `reserved_at`은 30분 경계(분 ∈ {0,30}, 초 = 0) 값만 저장되어 DB CHECK를 통과한다 (AD-9)

**Given** 예약 생성에 성공했을 때
**When** 저장이 끝난다
**Then** 성공 toast를 띄우고 예약이 대기 상태 배지로 목록에 반영된다 (UX-DR7, UX-DR2)

> ↪ 같은 (의사, 슬롯) 충돌 차단과 `taken` 셀 표시는 Epic 5(FR-15). P0에서는 검사 없이 생성한다.

### Story 2.2: 직원 예약 확정·취소 & 상태 흐름

As a 접수 직원,
I want 들어온 예약을 확정하거나 취소하고 상태를 한눈에 보기를,
So that 예약 흐름을 관리한다.

**Acceptance Criteria:**

**Given** 대기 상태의 예약이 있을 때
**When** 직원이 확정한다
**Then** status가 대기→확정으로 전이되고(예약 서비스만 status 소유) 목록 배지가 갱신된다 (FR-7, FR-8, AD-5)

**Given** 예약이 있을 때
**When** 직원이 취소한다
**Then** 파괴적 액션이라 shadcn Dialog 확인 1단계를 거친 뒤 status가 →취소로 전이되고 그 슬롯이 해제된다(향후 충돌 대상에서 제외) (FR-7, FR-8, UX-DR6, AD-4)

**Given** 예약 목록에서
**When** 상태 배지가 표시된다
**Then** 대기=amber·확정=blue·완료=green·취소=gray로 전 화면 동일 매핑되고, 색만이 아니라 한국어 텍스트를 병기한다 (UX-DR2, UX-DR9)

**Given** 데스크톱과 모바일에서
**When** 화면 폭이 바뀐다
**Then** ≥md는 표, 모바일은 카드로 접혀 표시된다 (UX-DR11)

### Story 2.3: 직원 담당 의사 변경 (재배정)

As a 접수 직원,
I want 예약의 담당 의사를 다른 의사로 바꾸기를,
So that 사정에 맞춰 진료 의사를 조정한다.

**Acceptance Criteria:**

**Given** 대기 또는 확정 상태의 예약이 있을 때
**When** 직원이 같은 진료과의 다른 의사를 선택해 변경한다
**Then** `appointment.doctor_id`가 갱신되고 응답이 리소스 정규 모델(정수 id + 평평한 표시 필드)로 온다 (FR-7, AD-10)

**Given** 의사 변경 UI에서
**When** 표시된다
**Then** 현재 담당 의사와 선택 가능한 의사(같은 진료과) 목록이 보인다

> ↪ 재배정 시 (의사, 슬롯) 가용성 재검사(`exclude_appointment_id` 자기 행 제외 + 이전 슬롯 해제/새 슬롯 점유)는 Epic 5(P1). P0에서는 `doctor_id` 갱신만 수행한다.

## Epic 3: 진료 기록 & 처방 (의사가 기록)

확정된 예약에 대해 진단·소견·진료일시를 진료 기록으로 남기고 처방을 0..N개 추가한다. 기록을 저장하면 같은 트랜잭션에서 그 예약이 완료로 전이되고, 기록은 발생 진료과·담당 의사를 작성 시점 값으로 자체 보관한다(이력 불변).

### Story 3.1: 확정 예약에 진료 기록 작성 & 완료 전이

As a 의사(직원 화면에서 진료),
I want 확정된 예약에 진단·소견·진료일시를 기록하기를,
So that 진료 내용이 남고 그 예약이 완료 처리된다.

**Acceptance Criteria:**

**Given** 확정 상태의 예약이 있을 때
**When** 의사가 진단명·소견·진료일시를 입력해 저장한다
**Then** `POST /medical-records`로 기록이 생성되고, 같은 트랜잭션에서 그 예약이 확정→완료로 전이된다 (FR-9, FR-8, AD-5)

**Given** 대기·취소·완료 상태의 예약일 때
**When** 진료 기록 작성을 시도한다
**Then** 서비스 가드가 거부하고(확정 예약에만 작성 가능) 4xx `{"detail": ...}`(한국어)를 반환한다 (AD-5)

**Given** 진료 기록을 생성할 때
**When** 저장한다
**Then** `hospital_department_id`는 그 예약의 과, `doctor_id`는 그 예약의 의사를 작성 시점 값으로 복사 저장한다(라이브 조인으로 유도하지 않음, 이력 불변) (AD-6)

**Given** 이미 진료 기록이 있는 예약일 때
**When** 두 번째 기록 작성을 시도한다
**Then** 부분 유니크 인덱스 `uq_medical_record_appointment`가 막아 예약당 기록 1건만 허용된다 (AD-9, FR-8)

**Given** 진료 기록 작성에 성공했을 때
**When** 저장이 끝난다
**Then** 성공 toast를 띄우고 해당 예약 배지가 완료(green)로 갱신된다 (UX-DR7, UX-DR2)

### Story 3.2: 진료 기록에 처방 추가 (0..N)

As a 의사(직원 화면에서 진료),
I want 진료 기록에 처방(약·용법·용량·처방일수)을 0개 이상 추가하기를,
So that 환자에게 필요한 약을 기록으로 남긴다.

**Acceptance Criteria:**

**Given** 진료 기록 폼에서
**When** 약을 고르고 용법·용량·처방일수를 입력해 행을 추가한다
**Then** 처방 행이 0..N개로 반복되며 추가/삭제할 수 있다 (FR-10, UX-DR5)

**Given** 처방 행들을 입력했을 때
**When** 기록을 저장한다
**Then** 각 처방이 그 `medical_record`에 N:1로 연결되어 생성된다 (FR-10)

**Given** 처방 행이 하나도 없을 때
**When** 저장한다
**Then** 처방 없이도 기록이 저장된다(0 허용) (FR-10)

**Given** 약을 선택하지 않은 처방 행이 있을 때
**When** 저장한다
**Then** 라벨된 인라인 오류로 저장을 막는다 (UX-DR9)

## Epic 4: 조회 (P0 한 줄기 완성)

환자가 자기 예약 목록과 지난 진료 기록(진단·처방 포함)을 조회하고, 직원이 환자별 전체 진료 내역(예약·진료·처방)을 조회한다. 이 에픽 완료로 최소 성공 기준인 P0 E2E 한 줄기(등록→예약→확정→기록→조회)가 배포 URL에서 닫힌다.

### Story 4.1: 환자 자기 예약·진료 기록 조회

As a 환자,
I want 내 예약 목록과 지난 진료 기록(진단·처방)을 보기를,
So that 전화 없이 내 진료 이력을 스스로 확인한다.

**Acceptance Criteria:**

**Given** 신원이 선택된 환자가
**When** 환자 화면에서 예약을 조회한다
**Then** `GET /appointments?patient_id=`로 내 예약 목록이 상태 배지와 함께 표시된다 (FR-11, AD-8, UX-DR2)

**Given** 신원이 선택된 환자가
**When** 진료 기록을 조회한다
**Then** `GET /medical-records?patient_id=`로 내 지난 기록(진단·소견·발생 진료과·연결된 처방 포함)이 표시된다 (FR-11, AD-8)

**Given** 데모 환경에서
**When** 목록에서 다른 환자를 선택한다
**Then** 그 환자 데이터가 보이며, 이는 앱 레벨 필터일 뿐 보안 격리가 아님을 고지 배너로 유지한다 (AD-8, UX-DR8)

**Given** 예약이나 기록이 없을 때
**When** 조회한다
**Then** 빈 상태 UI를 보여주고, 모바일에서는 단일 컬럼으로 표시된다 (UX-DR7, UX-DR11)

### Story 4.2: 직원 환자별 전체 진료 내역 조회

As a 접수 직원,
I want 특정 환자의 예약·진료·처방 전체 내역을 보기를,
So that 그 환자의 상태를 파악해 응대한다.

**Acceptance Criteria:**

**Given** 직원이 환자를 특정했을 때(Story 1.4 검색)
**When** 그 환자의 전체 내역을 조회한다
**Then** 예약·진료 기록·처방을 한 화면에서 볼 수 있다 (FR-12)

**Given** 내역을 조회할 때
**When** 데이터가 로드된다
**Then** 응답이 리소스별 정규 모델(정수 id + 평평한 표시 필드)로 일관되게 온다 (AD-10)

**Given** 데스크톱과 모바일에서
**When** 화면 폭이 바뀐다
**Then** 데스크톱은 밀도 표, 모바일은 카드로 표시하고 로딩 중에는 Skeleton을 보여준다 (UX-DR11, UX-DR7)

## Epic 5: 가용성 안전장치 & Walk-in (P1 — 관통 후 얹기)

P0 한 줄기가 배포된 뒤 안전 강화를 얹는다: 예약 생성·의사 배정/변경·walk-in 생성 시 앱(FastAPI)이 (의사, 30분 슬롯) 충돌을 차단하고, 예약 시 의사 미선택이면 해당 진료과의 빈 의사를 자동 배정하며(빈 의사 없으면 예약 불가), 예약 없이 온 환자를 빈 의사에게 즉시 진료·기록한다(빈 의사 없으면 거부). Story 5.1이 가용성 엔진을 세우고, 5.2·5.3이 그 위에서 같은 헬퍼를 공유한다.

> 🚧 **착수 게이트:** Epic 5는 Epic 1–4가 배포 URL에서 시연된(=P0 한 줄기가 관통한) 뒤에만 착수한다. P1이 흥미롭더라도 P0 미완 상태에서 먼저 손대지 않는다(PRD 가드레일).

### Story 5.1: 가용성 충돌 검사 (예약 생성·의사 변경 재검사)

As a 시스템(직원/환자 대신 무결성을 지키는),
I want 예약 생성과 의사 배정/변경 시 (의사, 슬롯) 충돌을 앱이 차단하기를,
So that 한 의사가 같은 슬롯에 이중 배정되지 않는다.

**Acceptance Criteria:**

**Given** 슬롯 키를 계산할 때
**When** Python `to_slot()`과 SQL floor 식이 실행된다
**Then** 둘이 동일하게 30분 격자(UTC floor)로 계산하고, 점유 판정의 source of truth는 SQL 충돌 쿼리다 (AD-3)

**Given** 점유가 발생하는 쓰기(예약 생성·의사 배정/변경·walk-in)일 때
**When** 삽입 직전이다
**Then** 단일 `check_and_occupy(conn, doctor_id, slot, exclude_appointment_id)`를 호출자 트랜잭션 안에서 호출해 검사+삽입을 한 트랜잭션으로 수행한다 (AD-4)

**Given** 충돌을 검사할 때
**When** 후보 (의사, 슬롯)을 본다
**Then** `appointment`(status ∈ 대기·확정) ∪ walk-in `medical_record`(appointment_id null)을 합집합으로 보고, 취소는 해제·완료는 미래와 무관으로 제외한다 (AD-4)

**Given** 이미 점유된 (의사, 슬롯)일 때
**When** 예약 생성을 시도한다
**Then** 4xx 도메인 거부(한국어)로 막고, 슬롯 피커의 그 셀을 `taken`(비활성)으로 갱신하며 red 인라인 안내를 보여준다 (FR-15, UX-DR3, UX-DR7)

**Given** 의사 변경(FR-7 재배정)일 때
**When** 새 (의사, 슬롯) 점유를 확인한다
**Then** 자기 행을 제외(`exclude_appointment_id`)하고 이전 슬롯 해제 + 새 슬롯 점유를 같은 트랜잭션에서 수행한다 (FR-7, AD-4)

**Given** `reserved_at`을 저장할 때
**When** 값을 검증한다
**Then** 30분 정렬 CHECK가 슬롯 키 무결성을 보강한다 (AD-9)

> 경계(정직): 앱 레벨 검사는 동시 요청이 없는 단일 세션 전제에서 차단을 보장하며, 동시 요청 경쟁(TOCTOU)의 완전 차단은 범위 밖이다.

### Story 5.2: 의사 자동 배정 (예약 시 의사 미선택)

As a 환자,
I want 담당 의사를 비워두면 그 진료과의 빈 의사가 자동 배정되기를,
So that 특정 의사를 고르지 않아도 예약이 잡힌다.

**Acceptance Criteria:**

**Given** 진료과·슬롯을 선택하고 의사를 비워둔 채
**When** 예약을 제출한다
**Then** 그 진료과 의사 중 그 슬롯이 빈 의사를 골라 자동 배정하고 `doctor_id`를 채워 예약을 생성한다 (FR-6 P1)

**Given** 그 진료과의 모든 의사가 그 슬롯에 점유됐을 때
**When** 예약을 제출한다
**Then** 예약 불가로 거부하고 한국어로 다른 시각을 안내한다 (FR-6 P1)

**Given** 빈 의사를 찾는 로직이
**When** 실행된다
**Then** walk-in과 같은 헬퍼(진료과 의사들에 대해 `check_and_occupy`로 빈 슬롯 탐색)를 공유해 로직이 발산하지 않는다 (AD-4)

### Story 5.3: Walk-in 즉시 진료

As a 접수 직원/의사,
I want 예약 없이 온 환자를 진료과 선택 후 빈 의사에게 즉시 진료·기록하기를,
So that 예약 없는 환자도 바로 처리한다.

**Acceptance Criteria:**

**Given** 예약 없이 온 환자에 대해
**When** 직원이 진료과를 먼저 선택한다
**Then** 그 과에서 현재 슬롯(`visited_at`을 floor한 슬롯)이 빈 의사에게 배정해 `medical_record`를 `appointment_id` 없이 생성한다 (FR-16)

**Given** walk-in 기록을 생성할 때
**When** 저장한다
**Then** 그 (의사, 슬롯)을 점유해 같은 슬롯의 예약을 막고, `hospital_department_id`는 배정된 의사의 현재 소속으로 저장한다 (FR-16, FR-15, AD-4, AD-6)

**Given** 그 슬롯에 빈 의사가 없을 때
**When** walk-in을 시도한다
**Then** red Dialog로 거부 메시지(다른 시각 안내)를 띄우고 종료하며(대기열 없음), NOT NULL 삽입 에러가 노출되기 전에 앱이 먼저 거부한다 (FR-16, UX-DR7, AD-6)
