---
title: Spine Review — RECONCILE + RUBRIC (hospital-care)
reviewer: spine-reviewer
date: 2026-07-13
target: architecture-hospital-care-2026-07-13/ARCHITECTURE-SPINE.md
sources:
  - prds/prd-hospital-care-2026-07-12/prd.md
  - prds/prd-hospital-care-2026-07-12/addendum.md
verdict: PASS-WITH-FIXES
---

# Spine Review — hospital-care

> 맥락: 1인 교육 과제, 마감 3일, 스파인은 **빌드 기질(build substrate)** = 조각들이 어긋나지 않게 하는 불변식만 못 박는 문서. 스타일이 아니라 **실제 갭**만 본다.

## Verdict: PASS-WITH-FIXES

스파인은 이 과제의 **진짜 발산 지점**(슬롯 계산, 교차-테이블 충돌 검사, status 소유권, 진료과 자체보관, 단일 API 클라이언트)을 정확히 겨냥해서 못 박았다. PRD/addendum의 load-bearing 요구는 거의 전부 착지했고, 요청받은 *조용한 요구*(walk-in 거부, 완료 전이 동일-tx 부작용, medical_record 자체보관, 정직한 TOCTOU 경계, advisor 완료정의)도 대부분 살아남았다. 남은 것은 구조적 실패가 아니라 **몇 개의 enforceable 갭 보강**이다 — 특히 (1) 완료 전이의 **선행조건(확정 상태) 가드 누락**, (2) **커넥션 풀러/psycopg 트랜잭션 운영 갭**, (3) **appointment.doctor_id 항상-채움 불변식이 암시적**.

---

## Part 1 — RECONCILE (요구 → 착지 여부)

### 1.1 FR/NFR 커버리지 매트릭스

| 요구 | load-bearing 핵심 | 스파인 착지 | 판정 |
| --- | --- | --- | --- |
| FR-1 역할 선택 | 로그인 없이 환자/직원 진입 | `page.tsx` 역할선택 + Cap Map | ✅ |
| FR-2 환자 신원·필터 | patient_id 필터 = 보안 아님(데모 경고) | AD-8 (명시적 필터·비격리 문서화) | ✅ |
| FR-3 직원 전체 접근 | 별도 신원 없이 전체 | AD-8(역: 필터 없는 엔드포인트) 암시 | ✅ (암시) |
| FR-4/5 환자 등록·조회 | 필수 필드, 이름 검색 | AD-2/AD-10 (routers 검증) | ✅ |
| FR-6 예약 생성(P0 직접선택) | doctor_id 항상 채움, 30분 슬롯 | AD-3/AD-4 (+ 아래 갭 F3) | ⚠️ 부분 |
| FR-7 확정/취소/의사변경 | 재배정 재검사(P1) | AD-4/AD-5, 재검사는 Deferred | ✅ |
| FR-8 status 흐름·완료전이 | 기록의 동일-tx 부작용, 예약당 1건 | AD-5 (+ 아래 갭 F1) | ⚠️ 부분 |
| FR-9 진료 기록·자체보관 | 발생 진료과 복사, 의사 선지정 | AD-5/AD-6 | ✅ |
| FR-10 처방 0..N | drug N:1, medical_record N:1 | ERD + Cap Map | ✅ |
| FR-11/12 조회 | 환자 스코핑, 처방 포함 | AD-8/AD-10 | ✅ |
| FR-13/14 참조·시드 | 진료과당 의사 2명↑ | AD-9 항목4(시드) | ✅ |
| FR-15 가용성 규칙 | (의사,슬롯), 2테이블 합집합, 정직한 경계 | AD-3/AD-4 | ✅ (모범) |
| FR-16 walk-in | 진료과→빈의사→기록, 슬롯점유, 거부 | AD-3/4/6 + 오류규약 | ✅ (아래 F4/F5) |
| NFR-1 배포 | Railway, 초기 뼈대 | 운영봉투 mermaid + 순서 | ✅ |
| NFR-2 정합성 | FK·CHECK | AD-9 | ✅ |
| NFR-3 스택 경계 | 브라우저 Supabase 직접호출 금지 | AD-1 | ✅ |
| NFR-4 RLS·보안 | 9테이블 RLS ON, advisor 완료정의 | AD-7 | ✅ |
| NFR-5 사용성 | 한국어 UI, 브라우저 E2E 확인 | 규약(한국어) + 데모 | ✅ (경량) |

바인딩 누락 없음: 스파인 frontmatter `binds: FR-1..FR-16, NFR-1..NFR-5` 전부에 실체적 홈이 있다. ERD 엔티티 9개(hospital, department, hospital_department, doctor, patient, appointment, medical_record, prescription, drug) 정확히 일치.

### 1.2 조용한 요구(quiet requirement) 생존 점검 — 요청받은 항목

| 조용한 요구 | 출처 | 스파인에서 | 생존? |
| --- | --- | --- | --- |
| **walk-in 거부 UX** (빈 의사 없으면 거부·종료·다른시각 안내, 대기열 없음) | FR-16, A4 | 오류규약("도메인 거부=4xx+한국어") + AD-6("빈 의사면 앱이 먼저 거부") + 대기열은 Deferred | ✅ (규약 경유, 경량) |
| **완료 전이 = 동일 트랜잭션 부작용** | FR-8 | AD-5("같은 트랜잭션에서 완료 전이") + 규약(트랜잭션 행) | ✅ (명확) |
| **medical_record 자체보관 진료과** | FR-9, A3 | AD-6(발생시점 값 복사, 라이브 조인 금지, walk-in=현재 소속) | ✅ (강함) |
| **정직한 TOCTOU 경계** | FR-15, A4 | AD-4("단일 세션 보장, 동시요청 범위 밖") + Deferred | ✅ (명확) |
| **RLS 완료정의 = advisor 확인** | NFR-4, A1 | AD-7("배포 후 advisor로 9테이블 RLS ON 확인해야 완료") | ✅ (명확) |

**요청된 5개 조용한 요구는 전부 생존.** 다만 walk-in 거부는 별도 규칙이 아니라 오류규약 + AD-6 부산물로만 존재 — 착지했으나 가장 얇다(아래 F4/F5에서 보강 제안).

### 1.3 추가로 발견한 미세 불일치 (reconcile 부산물)

- **RLS 확인 시점**: PRD NFR-4는 "배포 **전** 확인", 스파인 AD-7/addendum A1은 "배포 **후/직후** advisor 확인". RLS를 배포 뼈대 마이그레이션으로 적용하므로 "후"가 현실적 — 실질 모순 아님, 표기 차이. (TRIVIAL)
- **service_role vs DATABASE_URL**: A1은 백엔드가 "service_role 키"로 접근한다고 씀. 스파인 Stack/규약은 **psycopg + DATABASE_URL(직접 Postgres 접속)** 선택. 둘 다 "서버측 자격증명 = RLS에 안 걸리는 경로"라 posture는 동일하나, **접근 방식이 다른 두 경로**다. 스파인이 supabase-py를 대안으로 언급해 사실상 화해했지만, 한 줄 각주("DATABASE_URL 직접접속이 A1 service_role 경유를 대체")가 있으면 빌더 혼선을 없앤다. (LOW, 아래 F6)

---

## Part 2 — RUBRIC (good-spine checklist)

### 2.1 각 AD의 Rule은 enforceable하고, 명시한 발산을 실제로 막는가?

| AD | Rule enforceable? | 명시 발산 차단? | 비고 |
| --- | --- | --- | --- |
| AD-1 3-tier 경계 | ✅ (import/리뷰) | ✅ 프런트 Supabase 직접호출 차단 | 견고 |
| AD-2 계층형·db 단일소유 | ✅ (import 방향) | ✅ 커넥션 산개·규칙 누수 차단 | 견고 |
| AD-3 to_slot 단일 구현 | ✅ ("정확히 하나") | ✅ 예약/walk-in 슬롯 불일치 차단 | 견고 (백엔드 3경로 공유; 프런트 비정렬은 CHECK가 4xx로 표면화) |
| AD-4 check_and_occupy 단일·동일tx | ✅ | ✅ 3쓰기경로 제각각 차단 | **모범.** 문구 "삽입 직전"은 insert-편향 → 의사변경(UPDATE)엔 애매 (F7) |
| AD-5 status 소유·완료 부작용 | ⚠️ 부분 | ⚠️ **선행조건 가드 없음** | 완료 전이의 소스 status 제약 미명시 (F1) |
| AD-6 자체보관 | ✅ | ✅ 라이브조인 왜곡 차단 | 견고 |
| AD-7 RLS deny-default | ✅ (advisor) | ✅ anon 전체개방 차단 | 견고 |
| AD-8 명시적 patient_id | ✅ | ✅ 엔드포인트별 스코핑 발산 차단 | 견고 |
| AD-9 마이그레이션·bigint | ✅ | ✅ 스키마 드리프트 차단 | 견고 |
| AD-10 단일 API 계약 | ✅ | ✅ 클라이언트 파편화 차단 | 견고 |

**결론:** 10개 중 9개 Rule은 enforceable하며 명시 발산을 실제로 막는다. **AD-5만 반쪽** — 아래 F1.

### 2.2 Deferred가 두 유닛을 여전히 발산시킬 수 있는가?

- **인증·DB격리 defer**: AD-8이 현재 접근을 못 박아 발산 없음. ✅
- **동시성 완전강제(TOCTOU) defer**: AD-4가 단일-세션 보장 + 정직한 경계를 균일하게 못 박음 → 발산 아니라 **알려진 균일한 한계**. ✅
- **P1 편의: 자동 의사배정·빈의사 거부·FR-7 재검사 defer**: ⚠️ **여기가 유일한 잔여 발산원.** 자동배정(FR-6 P1)은 defer됐지만 **walk-in(FR-16)은 in-scope로 취급**되고, 둘 다 "해당 진료과에서 슬롯이 빈 의사를 고른다"는 **동일한 선택 로직**을 필요로 한다. 스파인은 이 선택 헬퍼가 **하나로 공유돼야 한다**고 못 박지 않아, 두 경로가 다른 선택 규칙(첫-빈-의사 vs 라운드로빈 등)으로 갈릴 수 있다. 정합성엔 영향 적음(아무 빈 의사나 정답)이나 일관성 갭. (F4)
- 다병원·근무표·30분초과 defer: 범위 밖, 발산 없음. ✅

### 2.3 이 고도(altitude)가 소유한 모든 차원이 결정/유예/공개됐는가 — 조용히 빠진 것은?

점검한 차원: tier 경계 ✅ / 백엔드 계층 ✅ / 데이터모델·ERD ✅ / 마이그레이션 규율 ✅ / API 계약 ✅ / 오류형태 ✅ / 식별자 ✅ / 시각·슬롯 ✅ / enum ✅ / 명명 ✅ / 시크릿·설정 ✅ / 트랜잭션 ✅ / 보안 posture ✅ / 가용성·동시성 ✅ / **운영·배포 봉투** ✅ (Railway 2서비스, 공용 Supabase, DATABASE_URL, CORS, 순서) / 스택·버전 ✅ / 폴더구조 ✅.

**조용히 빠졌거나 약한 지점:**
1. **DB 라이브러리 결정이 미결(OPEN)** — Stack에 `[가정·확인요청]`으로 psycopg3 추천. 이건 적절히 표면화됐으나 **AD-4의 "원자적 검사+삽입 동일 tx"를 gate**한다(supabase-py면 Postgres RPC 필요). 빌드 전 확정 필요. (표면화됨 → 갭 아님, 그러나 blocking 결정)
2. **커넥션 풀러 모드가 애매** — 운영봉투가 "Supabase **커넥션 풀러 URL**"을 DATABASE_URL로 쓴다고만 함. session(5432) vs transaction(6543) 풀러를 안 정했다. **psycopg3 + transaction 모드 풀러 + prepared statements = 알려진 파손**("prepared statement already exists"). AD-4/AD-5가 **진짜 트랜잭션을 요구**하므로 이 상호작용이 실질 배포사고가 될 수 있고, 브리프의 "막판 배포 사고 예방" 리스크와 정면으로 맞닿는다. (F2)
3. appointment.doctor_id 항상-채움 불변식이 암시적 (F3).

그 외 차원은 결정/유예/공개가 명확. **조용한 대량 누락은 없음.**

---

## Findings (우선순위·수정안 포함)

### [MEDIUM] F1 — 완료 전이의 선행조건(확정 상태) 가드가 없다 (AD-5)
AD-5는 "medical_record가 작성되면 같은 트랜잭션에서 완료로 전이"만 규정하고, **어떤 소스 status에서 전이가 합법인지**를 못 박지 않는다. FR-9는 "**확정된** 예약에 대해 기록 작성"이다. 가드가 없으면 빌더가 `대기`(미확정)나 `취소` 예약에 기록을 써서 **불법 전이**(대기→완료로 확정 건너뛰기, 또는 취소→완료)를 만들 수 있다. 부분 유니크 인덱스는 "예약당 1건"만 막지 status 선행조건은 안 막는다.
- **실패 시나리오:** 직원이 확정을 안 거친 `대기` 예약에 곧장 기록 작성 → status가 확정을 건너뛰고 완료로 점프. 또는 `취소`된 예약에 기록 → 취소가 완료로 되살아남.
- **수정(enforceable):** AD-5 Rule에 한 줄 — "기록 삽입은 대상 예약이 `확정`일 때만 허용(아니면 4xx로 거부); 완료 전이는 확정→완료만." 상태기계 가드를 스파인 고도에서 못 박는다(스파인이 이미 status 흐름을 소유하므로 제자리다).

### [MEDIUM] F2 — 커넥션 풀러 모드 미결정이 트랜잭션 요구와 충돌할 수 있다 (운영봉투)
스파인은 psycopg3 + "커넥션 풀러 URL" + **진짜 트랜잭션**(AD-4/AD-5)을 동시에 커밋했는데, Supabase **transaction-mode 풀러(6543)**는 psycopg3의 기본 prepared statements와 충돌해 트랜잭션 경로가 깨지는 흔한 파손 모드가 있다. 브리프의 "막판 배포 사고" 리스크와 직결.
- **실패 시나리오:** Railway 배포 후 6543 풀러로 접속 → 두 번째 예약 생성 tx에서 `prepared statement "..." already exists`로 500. E2E 관통 데모가 배포에서만 실패.
- **수정(pragmatic):** 운영봉투에 한 줄 확정 — **session-mode 풀러(5432)** 사용(또는 psycopg 연결에 `prepare_threshold=None`으로 prepared statement 비활성). "커넥션 풀러 URL"을 모드까지 명시. 초기 배포 뼈대 세울 때 실제 tx 1회를 찔러 확인.

### [MEDIUM] F3 — appointment.doctor_id "DB-nullable이나 앱-항상-채움" 불변식이 암시적 (AD-5/AD-6, A3)
A3는 이를 "DB는 허용, 앱이 강제"의 **2계층 구조**로 명시했다. 스파인은 medical_record 두 컬럼 NOT NULL은 못 박지만, **예약 생성 시 doctor_id가 항상 채워진다(P0=직접선택 필수)**는 불변식을 명시적으로 못 박지 않는다(AD-6에 "빈 의사면 앱이 먼저 거부"로 파편만 존재).
- **실패 시나리오:** 빌더가 DB nullability를 그대로 따라 P0 예약에서 doctor_id를 비워 저장 허용 → 나중에 기록 작성 시 medical_record.doctor_id NOT NULL에서 파열, 또는 완료 전이 불가.
- **수정:** 규약 또는 AD에 한 줄 — "예약 생성 시 `doctor_id`는 항상 채운다(P0=직접선택 필수, P1=자동배정). DB nullable은 walk-in/스키마 안정성용일 뿐."

### [LOW] F4 — "빈 의사 선택" 헬퍼의 공유가 미명시 (Deferred/AD-4)
walk-in(in-scope)과 자동배정(defer)이 동일한 "진료과에서 (의사,슬롯) 빈 의사 고르기"를 필요로 하는데 단일 공유 헬퍼로 못 박히지 않아 두 경로가 다른 선택/타이브레이크로 갈릴 수 있다. 정합성 영향은 낮음(아무 빈 의사나 정답).
- **수정:** AD-4에 한 줄 — "진료과 내 빈 의사 선택은 walk-in·자동배정이 **동일한 한 함수**를 쓴다(선택 기준 임의 but 단일 구현)."

### [LOW] F5 — walk-in 거부가 오류규약 부산물로만 착지
거부 UX(빈 의사 없음 vs 슬롯 충돌 두 원인 모두 4xx+한국어로 귀결, 대기열 없음·종료)는 AD-6 + 오류규약 + Deferred(대기열)로 흩어져 있다. 착지는 했으나 가장 얇다. F4 수정에 "빈 의사 없으면 4xx 도메인 거부(다른시각 안내), 대기열 없음"을 한 줄 붙이면 자족적.

### [LOW] F6 — service_role(A1) ↔ DATABASE_URL(스파인) 접근경로 각주 부재
posture는 동일하나 접근 방식이 다른 두 경로. 각주 한 줄("DATABASE_URL 직접 Postgres 접속이 A1의 service_role 경유를 대체 — 둘 다 서버측 자격증명")로 빌더 혼선 제거.

### [LOW] F7 — AD-4 "삽입 직전" 문구가 UPDATE 경로에 애매
FR-7 의사변경은 INSERT가 아니라 UPDATE로 점유를 바꾼다(재검사는 P1이지만 문구는 지금 고쳐두는 게 싸다). "쓰기(삽입/갱신) 직전에 check_and_occupy"로 표현 확장.

---

## 총평

이 스파인은 3일 마감의 빌드 기질로서 **강하다**. 진짜 어려운 발산점(슬롯 계산 단일화, 교차-테이블 충돌의 원자적 검사, status 단일 소유, 진료과 자체보관, 단일 API 클라이언트, RLS deny-by-default + advisor 완료정의)을 정확히·정직하게 못 박았고, 정직한 경계 표기(TOCTOU, 앱-레벨 필터=비보안)가 특히 좋다. **PASS-WITH-FIXES**: F1(완료 전이 확정-가드)과 F2(풀러 모드)는 배포/데모 파손을 실제로 유발할 수 있어 반영 권장, F3는 저비용 명시화, F4~F7은 한 줄 보강. 어느 것도 재설계를 요구하지 않는다.
