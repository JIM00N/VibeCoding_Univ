---
title: 병원 진료관리 서비스 — PRD 부록 (기술 세부·다운스트림 이관)
status: final
created: 2026-07-12
updated: 2026-07-13
---

# Addendum — hospital-care PRD

> PRD 본문은 "무엇을(What)"만 담는다. 아래는 아키텍처/구현 단계에서 결정·반영할 "어떻게(How)" 세부다. 이 부록은 `bmad-architecture` 입력으로 사용한다.

## A1. 보안 posture — RLS ON + 백엔드 경유 잠금 (NFR-4 구현 세부)

**결정 배경.** 이번 범위엔 로그인이 없다(역할 선택으로 대체). RLS는 본래 `auth.uid()`(로그인 사용자)를 기준으로 행을 격리하는데, 로그인이 없으면 사용자별 진짜 격리는 불가능하다. 그래서 "진짜 사용자 격리"가 아니라 **"공개 키로 DB가 통째로 열리는 구멍을 막는다"** 를 목표로 한다.

**적용 방식(아키텍처 단계에서 확정·구현):**
1. 9개 테이블 전부 `alter table ... enable row level security` 로 RLS 활성화.
2. anon(공개/publishable) 역할에 대한 허용 정책을 만들지 않는다 → **anon 키로는 어떤 행도 읽/쓰기 불가**(deny-by-default).
3. 모든 DB 접근은 **FastAPI 백엔드가 서버 측 키(service_role 등)로만** 수행한다. service_role은 RLS를 우회하므로 앱은 정상 동작하되, 브라우저에 노출되는 공개 키로는 DB에 직접 손댈 수 없다.
4. 서버 측 키는 **환경변수로만** 관리하고 절대 프런트(Next.js 브라우저 번들)에 넣지 않는다. 프런트는 오직 FastAPI만 호출한다.
5. **환자별 데이터 격리(FR-2)는 FastAPI(API) 레벨 필터**로 처리한다(선택된 patient_id 기준). 이는 DB 레벨 강제가 아니라 앱 레벨 필터임을 명확히 인지한다.

> ⚠️ 현재 `db-design/schema.sql`에는 RLS 활성화 구문이 **없다**. 배포용 마이그레이션에 9개 테이블 `enable row level security`(+ anon 정책 미생성)를 추가해야 이 posture가 실제로 적용된다.
>
> **완료 정의(P0 초기 산출물).** RLS 활성화 마이그레이션은 배포 뼈대(NFR-1)와 **함께** 세운다 — 뒤로 미루면 3일 마감에 누락되기 쉽다. 배포 직후 **Supabase advisor(또는 `pg_policies` 조회)로 9개 테이블 RLS ON을 확인**하는 것을 "완료"의 일부로 삼는다. 배포된 프로젝트(`fphsxoweprztrekckzui`)의 현재 RLS 상태가 OFF면 즉시 적용한다.

**남는 한계(확장 과제):** 로그인이 없으므로 DB 레벨 사용자별 격리는 아니다. 진짜 격리는 Supabase Auth 로그인 + `auth.uid()` 기반 per-user 정책 도입 시 가능(향후 확장).

## A2. 아키텍처 전제 (참고)

- 프런트 **Next.js** → 백엔드 **FastAPI** → **Supabase(PostgreSQL)**. 브라우저는 Supabase를 직접 호출하지 않는다.
- 배포: **프런트 Vercel · 백엔드(FastAPI) Railway**(아키텍처 결정 2026-07-13). 초반에 배포 뼈대부터 세워 막판 배포 사고를 앞당겨 방지(브리프 리스크 반영). CORS는 FastAPI가 Vercel 프리뷰 URL까지 허용.
- ERD/SQL 원본: `db-design/` (9개 테이블, FK·CHECK 제약 확정). Supabase 프로젝트 `hospital-care`(`fphsxoweprztrekckzui`)에 배포 완료.

## A3. 데이터 모델 상 유의점 (FR 구현 시 참조)

- `appointment.status` ∈ (`대기`,`확정`,`완료`,`취소`), 기본값 `대기`. `doctor_id`는 **DB 스키마상 nullable**(walk-in 경로·스키마 안정성 위해 유지). **단, 앱 정책상 예약 생성 시 항상 채운다** — **P0는 직접 선택**, **P1은 자동 배정**(FR-6·A4). 즉 "DB는 허용, 앱이 강제"의 2계층 구조다.
- `medical_record.doctor_id`는 **NOT NULL** → 진료 기록 작성 시점엔 담당 의사가 반드시 지정돼 있어야 한다(FR-9는 FR-7의 의사 배정에 의존).
- `medical_record.hospital_department_id`는 진료 발생 장소를 **자체 보관**(이력 보존) — 의사 소속 변경과 무관하게 과거 기록 불변.
- 단일 병원 전제: `hospital` 1행 시드. 예약/진료는 그 병원의 `hospital_department` 행을 참조. 환자는 "진료과"만 고르고 앱이 단일 병원의 해당 `hospital_department`로 매핑.
- `prescription`은 `medical_record` N:1, `drug` N:1. 진료 1건에 0..N개.
- `medical_record.appointment_id`에 UNIQUE가 없어 ERD의 예약:기록 1:1이 DB에서 강제되지 않음. **결정:** walk-in(`appointment_id` NULL 다건)을 깨지 않으면서 1:1을 DB에서 강제하는 **부분 유니크 인덱스**를 마이그레이션에 추가한다 —
  ```sql
  create unique index uq_medical_record_appointment
    on medical_record(appointment_id) where appointment_id is not null;
  ```
  (FR-8의 완료 전이·'예약당 기록 1건'을 앱 로직 + DB 양쪽에서 보장.)
- **정규화 스키마 유지 이유:** 단일 병원 전환으로 `hospital`·`hospital_department`(N:M) 중복 제거 이점은 지금 발현되지 않지만, ERD 학습 목적·향후 다병원 확장을 위해 9개 테이블 정규화 구조를 그대로 둔다.

## A4. 가용성/충돌 모델 (FR-6·FR-15·FR-16 구현 세부)

- **슬롯 정의 = 30분 격자.** 모든 시각을 30분 슬롯으로 정규화한다. 예약(`reserved_at`)은 슬롯 경계에서만 선택하고, walk-in(`visited_at`)은 현재 시각을 속한 슬롯으로 내림(floor)해 슬롯 키를 만든다. → 초 단위 timestamp가 정확히 같을 일이 없어도 **정규화된 (의사, 슬롯)** 으로 비교하므로 walk-in이 예약을 실제로 막는다. *(이전 "정확 시각 일치" 안은 충돌이 사실상 안 잡혀 폐기)*
- **가용성 단위 = (의사, 슬롯).** 한 의사는 한 슬롯에 활성(대기·확정) 예약 또는 walk-in 진료를 하나만 가진다.
- **점유 소스 2가지(교차 테이블):** ① `appointment`(status ∈ 대기·확정) ② walk-in `medical_record`(`appointment_id` null). 충돌 검사는 두 테이블을 (doctor_id, 슬롯)으로 **합집합**해서 본다.
- **예약 생성(FR-6):** **(P0)** 의사 지정 O → 그 (doctor_id, 슬롯) 점유 확인 후 예약(의사 직접 선택 필수). **(P1)** 의사 지정 X → 해당 진료과 의사 중 그 슬롯이 빈 의사를 골라 자동 배정, 없으면 거부. (→ 두 경로 모두 예약은 항상 `doctor_id`가 채워짐.)
- **의사 변경(FR-7):** 새 (doctor_id, 슬롯) 점유 확인 후 갱신.
- **walk-in(FR-16):** 직원이 **진료과를 먼저 선택** → 그 과에서 현재 슬롯이 빈 의사를 골라 진료 기록 생성 → 점유. `hospital_department_id`는 **배정된 의사의 소속**에서 유도해 저장한다. **빈 의사 없으면 walk-in 거부**(다른 시각 안내로 종료 — **대기열은 범위 밖**). `medical_record.doctor_id`·`hospital_department_id`가 NOT NULL이므로 반드시 의사가 정해진 뒤에만 생성된다(빈 의사 없을 때 앱이 먼저 거부해 NOT NULL 삽입 에러가 사용자에게 노출되지 않게 한다).
- **점유 대상:** 활성(**대기·확정**) 예약 + walk-in 기록만. **취소**는 슬롯 해제, **완료**는 과거라 미래 충돌과 무관.
- **동시성/무결성:** 충돌 검사는 **애플리케이션(FastAPI) 레벨**에서 한다. 주의 — 충돌 소스가 `appointment`·`medical_record` **두 테이블**에 걸쳐 있어, 단일 테이블 부분 유니크 인덱스(`(doctor_id, reserved_at)` 등)로는 교차 충돌을 못 막는다. **강제 수준(정직한 경계):** 앱 레벨 검사는 **동시 요청이 없는 단일 세션 전제에서만 차단을 보장**한다(TOCTOU 경쟁은 과제 범위 밖).
- **보강(결정):** ① `appointment.reserved_at`에 **30분 정렬 CHECK**로 슬롯 키 무결성을 확보한다 — `check (extract(minute from reserved_at) in (0,30) and extract(second from reserved_at) = 0)` (10:17 같은 값 저장을 막아 슬롯 키 비교가 깨지지 않게). ② 예약/walk-in의 **충돌 검사 + 삽입을 한 트랜잭션**으로 묶어 TOCTOU를 완화한다. ③ 완전 강제(동시성까지)는 두 소스를 합친 뷰 위 EXCLUDE 제약 또는 점유 전용 `slot_occupancy` 단일화가 필요 — 확장.
- **범위 밖:** 영업시간·의사 근무표·휴진·30분보다 긴 진료의 시간 겹침 계산.
