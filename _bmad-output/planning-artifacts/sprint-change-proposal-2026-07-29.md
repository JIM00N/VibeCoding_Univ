---
title: Sprint Change Proposal — 예약 일정 변경(FR-19) 신설, Epic 7 개설
status: approved
created: 2026-07-29
workflow: bmad-correct-course
approver: 지석
---

# Sprint Change Proposal (2026-07-29)

> 병원 진료관리(hospital-care) — Epic 1~6 전 스토리 done, 계획 범위 종료(2026-07-28) 이후 첫 신규 요구.
> 규모: **Moderate(FR 1건 신설 · Epic 1건 신설 · 스토리 1건 · 엔드포인트 1개 교체)**.
> 되돌릴 완료 작업 없음 · DB 마이그레이션 0건 · 신규 의존성 0건.

## 1. 이슈 요약 (Issue Summary)

**트리거:** 사용자(지석) 신규 요구 —

> "직원이 예약 시간을 바꿀 수 있어야 한다. 확정 전이든 후든, '변경' 버튼 하나로."

**유형:** 기술적 한계나 요구 오해가 아니라 **stakeholder 신규 요구**다. 계획 범위(Epic 1~6)가 소진된 뒤 들어왔다.

**핵심 문제 — 예약 생성 후 `reserved_at`을 바꾸는 경로가 0개다.** 코드 실측:

| 경로 | 바꾸는 것 | 시각 변경 |
|---|---|---|
| `PATCH /appointments/{id}` | `status`(확정/취소만) | ❌ `extra="forbid"` |
| `PATCH /appointments/{id}/doctor` | `doctor_id`만 | ❌ `extra="forbid"` |
| `_UPDATE_APPOINTMENT_DOCTOR` (db) | 주석 명시: *"status·reserved_at·hospital_department_id는 건드리지 않는다"* | ❌ |

직원이 시간을 바꾸려면 **취소 후 재예약**뿐이다. 예약 행이 끊기고(새 id) 취소 행이 쌓이며, 그 환자의 "언제 왜 왔는지"가 PRD가 풀려던 바로 그 문제로 되돌아간다.

**FR 커버리지:** 어느 FR에도 없다. FR-7은 확정/취소/의사 변경까지만 정의한다.

## 2. 영향 분석 (Impact Analysis)

### 에픽 영향

진행 중 에픽 **없음**(Epic 1~6 전부 done). 되돌릴 작업 0 · 기존 에픽 수정 0 · 롤백 대상 0 · 재정렬 대상 0.
구조적 변경은 **Epic 7 신설 하나**뿐이다.

### 분기 기준 적용 (epics.md "계획 범위 종료" 절)

| 성격 | 처리 | 이번 건 |
|---|---|---|
| FR 에 있는데 안 됨 | 버그 → `chore/` | ❌ 해당 없음 |
| FR 에 없음 | 신규 요구 → **Epic 7 신설** | ✅ **해당** |

FR-15b가 **예외 1건**으로 기록돼 있고 문서가 *"예외가 두 번이면 기준이 틀린 것"* 이라 못박아 뒀다.
이번은 **기준을 그대로 적용**한다 — 예외를 만들지 않으므로 기준 재검토는 발동하지 않는다.
근거: 산출물이 신규 엔드포인트 + UI 다이얼로그 + 가용성 재검사 3층 + 과거 시각 가드 규모라 FR-15b(인덱스 1개 + 매핑 1곳)와 성격이 다르다. 스토리·AC·Change Log 추적의 값이 오버헤드보다 크다.

### 이미 서 있는 것 (재사용 가능)

| 능력 | 상태 | 위치 |
|---|---|---|
| (의사, 슬롯) 충돌 게이트 + 자기 행 제외 | **동작 중** | `db/availability.py` `slot_taken_sql(…, exclude_appointment_id)` (5.1) |
| CAS(대기·확정 조건부 UPDATE) | **동작 중** | `_UPDATE_APPOINTMENT_DOCTOR` (2.3+5.1) |
| 환자 축 중복 차단 | **동작 중 · UPDATE 에도 발동** | `db/migrations/006` 부분 유니크 인덱스 |
| UniqueViolation → 환자 축 409 매핑(제약 이름 확인) | **동작 중** | `services/appointments.py` `_reject_unique_violation` |
| 과거 시각 400 가드 | **동작 중(생성 전용)** | `services/appointments.py` `create_appointment` |
| 30분 슬롯 격자·날짜 선택지 | **동작 중** | `lib/booking-slots.ts` · `components/slot-picker.tsx` |
| 같은 과 의사 후보 Select + 비파괴 Dialog | **동작 중** | `app/staff/appointments/page.tsx` (2.3) |

**없는 것은 세 가지뿐이다:** ① `reserved_at`을 쓰는 UPDATE 경로 ② 그 UPDATE에 대한 과거 시각 가드 ③ 다이얼로그에서 **자기 예약을 taken에서 빼는 것**.

### 실측으로 드러난 기술 영향 3건

1. **환자 축 006 인덱스가 UPDATE에도 걸린다** — `(patient_id, reserved_at) where status in ('대기','확정')`.
   시간 변경이 그 환자가 이미 가진 슬롯으로 이동하면 `UniqueViolation`이 뜬다. 기존 `_reject_unique_violation`이 제약 이름을 확인하므로 **매핑 코드 신규 0**.

2. **과거 시각 가드가 새로 필요하다** — 생성 경로엔 있지만 의사 변경엔 없다(`reserved_at`을 안 바꾸니까, 코드 주석이 *"생성 전용 — 의사 변경은 reserved_at 을 바꾸지 않아 과거 예약 재배정을 막지 않는다"* 로 명시). 시각을 바꾸는 순간 그 전제가 깨진다.

3. **`GET /availability`가 자기 행을 못 뺀다 — 화면과 서버가 어긋난다.**
   `select_taken_slots`는 `exclude_appointment_id: None` 하드코딩이고, `_SELECT_PATIENT_TAKEN_SLOTS`는 제외 조건 자체가 없다.
   결과: 변경 다이얼로그를 열면 **그 예약 자신이 점유한 슬롯이 taken으로 보인다.** 서버는 `exclude_appointment_id`로 허용하는데 화면이 막는 어긋남 — "10:00 그대로 두고 의사만 바꾸기"가 UI에서 불가능해진다. 두 축 모두 제외 파라미터가 필요하다.

### SQL 조각 트립와이어 (`.claude/rules/backend.md`)

`slot_taken_sql`·`free_doctor_sql`·`occupied_sources_sql` 호출부 실측 **6곳** — 규칙 파일의 숫자와 일치.
`_UPDATE_APPOINTMENT_DOCTOR`가 `_UPDATE_APPOINTMENT_SCHEDULE`로 **교체**되므로 호출부는 **6곳 그대로**다(순증 0).
다만 규칙 파일 본문의 "예정된 새 호출자는 없다 / walk-in 철회" 서술은 이 스토리 이후 사실과 어긋나므로 갱신 대상이다.

## 3. 채택안 (Recommended Path Forward)

**Option 1 — Direct Adjustment(신규 에픽·스토리 추가)를 채택한다.** Rollback·MVP 재검토는 해당 없음(되돌릴 작업 0, MVP는 이미 배포·관통 완료).

### 3.1 FR-19 신설 (사용자 결정)

> **FR-19 (예약 일정 변경, 2026-07-29 correct-course)**: 직원이 **대기·확정** 예약의 **담당 의사와 진료 시각**을 한 번에 변경한다. 변경 시 (의사, 슬롯) 가용성(FR-15)과 환자 1인 동시 예약 금지(FR-15b)를 **자기 행 제외**로 재검사하고, 과거 시각은 거부한다. `status`·`hospital_department_id`는 바꾸지 않는다(진료과 이동·상태 전이는 범위 밖).

**FR-7 확장이 아니라 신설인 이유:** FR-7은 Epic 2·5로 커버가 닫힌 done FR이다. 본문을 고치면 Coverage Map의 done 판정이 흔들린다. FR-15b가 같은 이유로 신설된 선례를 따른다.

### 3.2 Epic 7 신설 · Story 7.1 하나

```
Epic 7: 예약 일정 변경 (계획 범위 종료 후 신규 요구)
└─ Story 7.1: 예약 일정 변경 (담당 의사 + 진료 시각)
```

마이그레이션 0건 · 신규 테이블 0 · 신규 의존성 0. 기존 게이트·인덱스·슬롯 피커 위에 얹는다.

### 3.3 UI — 통합 [변경] 버튼 (사용자 결정)

```
【예약 관리 행 액션】
대기  [확정] [취소] [변경]              ← 버튼 수 3개 유지
확정  [취소] [변경] [기록 작성]         ← 버튼 수 3개 유지

【[변경] 다이얼로그】 (비파괴적 Dialog — UX-DR6의 AlertDialog 대상 아님)
  담당 의사  [김민재 ▾]                 ← 2.3 Select 재사용
  진료 날짜  [7월 30일 (목) ▾]          ← booking-slots seoulDayOptions 재사용
  시간      [09:00][09:30][10:00]…      ← slot-picker 재사용, 자기 슬롯은 taken 아님
  → 의사만 / 시각만 / 둘 다 — 한 번에 저장
```

**[의사 변경] 별도 버튼을 안 만든 이유:** 대기 행이 버튼 4개가 되어 390px 카드가 넘친다. 그리고 의사+시각을 따로 바꾸면 다이얼로그 2번 + PATCH 2번이라 부분 실패(의사는 성공, 시각은 409) 상태가 생긴다.

**대가(정직):** 기존 의사 변경 다이얼로그·서비스·엔드포인트를 개조한다 — `add-only` 규율의 예외다. 개조 범위를 **일정(의사·시각) 한 덩어리**로 한정하고 `status` 소유권(AD-5)은 건드리지 않는다.

### 3.4 API — `/doctor` 폐기, `/reschedule` 로 대체 (사용자 결정)

| 사라지는 것 | 들어오는 것 |
|---|---|
| `PATCH /appointments/{id}/doctor` | `PATCH /appointments/{id}/reschedule` |
| `AppointmentDoctorUpdate` | `AppointmentRescheduleUpdate` (`doctor_id?`·`reserved_at?`, 둘 다 없으면 400) |
| `set_appointment_doctor()` | `set_appointment_schedule()` |
| `_UPDATE_APPOINTMENT_DOCTOR` | `_UPDATE_APPOINTMENT_SCHEDULE` (두 컬럼 set) |
| `lib/api.ts updateAppointmentDoctor()` | `rescheduleAppointment()` |

**순 표면 증가 0** — 경로 1개가 1개로 교체된다. 같은 행·같은 컬럼을 놓고 두 게이트가 경쟁하는 사본(5.4가 없앤 바로 그 종류)을 만들지 않는다.

**위험(정직):** 라이브에서 동작 중인 경로를 지운다. Vercel(프런트)이 Railway(백엔드)보다 먼저 배포되면 그 사이 [변경]이 404다. 단일 데모 앱이라 수용하되, 릴리스 시 **Railway 배포 완료를 확인한 뒤 라이브 실측**한다.

**서비스 로직:** 서비스가 유효값을 먼저 합성한다 — `effective_doctor_id = payload.doctor_id ?? current.doctor_id`, `effective_reserved_at = to_slot(payload.reserved_at ?? current.reserved_at)`. UPDATE 문은 항상 두 컬럼을 쓰므로 SQL 분기가 없다.

**한 문장 안 3층 가드:**
```
① CAS      status = any('{대기,확정}')        → 0행이면 409 (기존 CAS 문구)
② 의사 축   not slot_taken(새 의사, 새 슬롯,   → SlotTakenError → 409
             exclude_appointment_id=자기)
③ 환자 축   006 부분 유니크 인덱스가 UPDATE 시 → UniqueViolation → 409 (환자 문구)
             자동 발동
```

### 3.5 계약 변화 (명시)

- **`"이미 담당하고 있는 의사예요"` 400 규칙은 제거된다.** 의사를 그대로 두고 시각만 바꾸는 것이 정당한 요청이 됐기 때문. 대신 **의사·시각이 둘 다 그대로면** 400 한국어("바뀐 내용이 없어요")로 막는다.
- `GET /availability`에 `exclude_appointment_id` 선택 파라미터를 추가한다 — 의사 축·환자 축 **둘 다** 적용. 미지정 시 기존 동작과 바이트 동일(기존 호출자 4곳 무수정).

### 3.6 명시적으로 이행하지 않는 것 (정직)

- **진료과 이동** — `hospital_department_id`는 안 바꾼다. 의사 후보는 그 예약의 진료과 안에서만 나온다(기존 의사 변경과 동일 경계).
- **환자 셀프 시간 변경** — 이번엔 직원 화면만. 환자 포털의 예약 변경은 별도 FR이 필요하다.
- **완료·취소 예약의 시각 변경** — 400으로 거부한다(기존 의사 변경 문구 계승).
- **변경 이력(누가 언제 무엇에서 무엇으로)** — 감사 로그는 PRD §4 제외 항목이다. `reserved_at`은 제자리에서 덮어써진다.
- **TOCTOU 완전 차단** — 의사 축은 여전히 단일 세션 전제(AD-4 경계 그대로). 환자 축은 006 인덱스라 동시 요청까지 닫힌다.

## 4. 산출물 변경 (Artifact Adjustments)

### 4.1 계획 정본

| 산출물 | 변경 |
|---|---|
| `prd.md` §F3 | **FR-19 신설**(FR-7 아래). FR-7 본문은 무수정 — done 커버리지 보존 |
| `prd.md` §4 범위 | "포함"에 P2 줄 추가 — 계획 범위 종료 후 신규 요구임을 명시 |
| `epics.md` Functional Requirements | **FR-19 항목 신설** |
| `epics.md` FR Coverage Map | `FR-19: Epic 7` 행 추가 |
| `epics.md` "계획 범위 종료" 절 | *"Epic 7 은 없다"* → **Epic 7 개설 기록**으로 갱신. 분기 기준은 **유지**하고, 이번이 기준의 **첫 정상 적용**임을 명시(FR-15b 예외와 대비) |
| `epics.md` Epic List | **Epic 7 항목 신설** |
| `epics.md` 본문 | **Epic 7 절 + Story 7.1(AC 9개)** 신규 |
| `ARCHITECTURE-SPINE.md` AD-4 | **`일정 변경(FR-19)` 하위 항목 추가** — 자기 행 제외 + 두 축(의사·환자) 재검사 + 과거 시각 가드. `Binds:`에 FR-19 추가. AD-4 본문·AD-5·AD-3은 무수정 |
| `ARCHITECTURE-SPINE.md` Capability Map | `예약 일정 변경 (FR-19)` 행 추가. 기존 FR-7 행은 무수정 |
| `ARCHITECTURE-SPINE.md` frontmatter | `binds` FR 범위 확장 + `updated: 2026-07-29` |
| `EXPERIENCE.md` IA 표 | 예약 관리 행 액션 `확정 · 취소 · 의사 변경` → `확정 · 취소 · 변경` |
| `DESIGN.md` | **무수정** — 색 시맨틱·Dialog 규약이 그대로 성립한다(변경은 비파괴적 Dialog, red 대상 아님) |
| `sprint-status.yaml` | `epic-7: backlog` + `7-1-예약-일정-변경: backlog` 추가 · `last_updated` 갱신 · Epic 5 회고 액션 **#2 done 처리**(이 sweep이 그 이행) |
| `implementation-readiness-report-2026-07-13.md`, `sprint-change-proposal-2026-07-25.md`, `sprint-change-proposal-2026-07-28.md`, 완료 스토리 파일 전체 | **수정하지 않는다** — 날짜가 박힌 시점 기록물 |

### 4.2 살아있는 규칙 파일 (Epic 5 회고 액션 #2 이행)

> 이 행들이 액션 #2의 실체다. `paths:` 붙은 규칙은 해당 경로를 만질 때 **자동 로드되는 살아있는 지시**라, 날짜 박힌 기록물과 달리 드리프트 비용이 즉시 발생한다.

| 규칙 파일 | 변경 |
|---|---|
| `.claude/rules/backend.md` §SQL 조각 빌더 | 호출부 목록에서 `_UPDATE_APPOINTMENT_DOCTOR` → `_UPDATE_APPOINTMENT_SCHEDULE` 교체 명시. **숫자 6은 유지**(교체라 순증 0). "예정된 새 호출자는 없다(walk-in 철회)" 문장을 FR-19 반영으로 갱신 |
| `.claude/rules/backend.md` §계층 | **무수정** — 4파일 규약이 그대로 성립 |
| `.claude/rules/frontend.md` | 확인 결과 **무영향**(lint/build 분업·Next 16 함정만 다룸) |
| `.claude/rules/workflow.md` | **무수정** — 이 스토리는 `story/7-1-appointment-reschedule` 로 기존 사이클을 그대로 탄다 |
| `CLAUDE.md` | **무수정** — 마이그레이션 0건이라 `db/migrations` 순서 서술이 그대로 유효. 200줄 제한도 여유 |
| `frontend/AGENTS.md` | 확인 결과 **무영향**(Next 16 버전 경고만 담음) |
| `deferred-work.md` | 2-3 리뷰 defer 3건이 `[의사 변경]` UI를 지목 — [변경] 통합으로 **대상이 바뀐다.** 해당 항목에 "7.1 에서 UI 교체됨" 주석. 신규 defer는 스토리 리뷰가 추가 |

## 5. 신규 스토리 명세

### Epic 7: 예약 일정 변경 (계획 범위 종료 후 신규 요구)

직원이 이미 잡힌 예약의 담당 의사와 진료 시각을 한 번에 조정한다. 취소 후 재예약으로 예약 이력이 끊기던 것을 제자리 변경으로 대체한다. 데이터 모델·가용성 게이트·환자 축 인덱스·슬롯 피커가 이미 서 있어 **신규 마이그레이션 없이** 기존 UPDATE 경로를 일정(의사+시각) 단위로 일반화해 얹는다.

**FRs covered:** FR-19 (+ FR-15·FR-15b 재검사 재사용)
**Architecture:** AD-3(슬롯 정규화), AD-4(단일 관문·자기 행 제외), AD-5(status 불변), AD-10(API 계약) — 마이그레이션 0건
**UX:** UX-DR3(슬롯 피커 재사용), UX-DR7(도메인 거부 인라인), UX-DR11(모바일 카드)
🚧 **착수 게이트:** 없음 — Epic 1~6 전부 done.

### Story 7.1: 예약 일정 변경 (담당 의사 + 진료 시각)

As a 접수 직원,
I want 대기·확정 예약의 담당 의사와 진료 시각을 한 번에 바꾸기를,
So that 취소 후 재예약 없이 일정을 조정하고 그 환자의 예약 이력이 끊기지 않는다.

**Acceptance Criteria:**

**AC1 — 일정 변경 성립**
**Given** 대기 또는 확정 상태의 예약이 있을 때
**When** 직원이 `[변경]`에서 담당 의사·날짜·시각을 골라 저장한다
**Then** `PATCH /appointments/{id}/reschedule`로 `doctor_id`·`reserved_at`이 **한 SQL 문에서** 갱신되고 응답이 기존 `AppointmentOut` 정규 모델로 온다 (FR-19, AD-10)
**And** `status`·`hospital_department_id`는 어떤 경로에서도 바뀌지 않는다 (AD-5)

**AC2 — 부분 변경과 무변경**
**Given** 변경 요청에서
**When** 의사만 / 시각만 / 둘 다 바꿔 제출한다
**Then** 세 경우 모두 성립한다(미지정 필드는 현재 값을 유지)
**And** 둘 다 현재 값과 같으면 400 한국어로 거부한다("바뀐 내용이 없어요…")
**And** 기존 `"이미 담당하고 있는 의사예요"` 400 규칙은 **제거**된다 — 의사 유지 + 시각 변경이 정당한 요청이 됐다

**AC3 — 변경 불가 상태**
**Given** 완료 또는 취소 상태의 예약일 때
**When** 변경을 시도한다
**Then** 400 한국어로 거부한다(2.3의 상태별 문구 계승 — "완료된 예약은…"·"취소된 예약은…")
**And** 검증과 UPDATE 사이 status 경합은 CAS가 막고 409 한국어(기존 `CAS_CONFLICT_DETAIL`)로 안내한다

**AC4 — 의사 축 가용성 재검사**
**Given** 새 (의사, 슬롯)이 이미 점유돼 있을 때
**When** 저장한다
**Then** 409 한국어로 거부하고 슬롯 피커의 그 셀을 `taken`으로 갱신한다 (FR-15, AD-4, UX-DR3·UX-DR7)
**And** **자기 행은 제외**한다(`exclude_appointment_id`) — 자기가 점유한 슬롯으로의 "변경"이 자기 자신과 충돌하지 않는다

**AC5 — 환자 축 중복 차단**
**Given** 그 환자가 새 슬롯에 이미 다른 활성(대기·확정) 예약을 갖고 있을 때
**When** 저장한다
**Then** `db/migrations/006` 부분 유니크 인덱스가 UPDATE를 거부하고, 기존 `_reject_unique_violation`(제약 이름 확인)이 409 환자 축 문구로 매핑한다 (FR-15b)
**And** 매핑 코드는 신규로 만들지 않는다 — 생성 경로와 같은 함수를 쓴다

**AC6 — 과거 시각 가드**
**Given** 새 시각이 이미 지난 슬롯일 때
**When** 저장한다
**Then** 400 한국어로 거부한다(생성 경로 `create_appointment`와 **바이트 동일한 문구**)
**And** 이 가드는 `reserved_at`이 실제로 바뀔 때만 적용한다 — 과거 예약의 의사만 바꾸는 기존 동작을 깨지 않는다

**AC7 — 자기 예약을 taken에서 제외**
**Given** `[변경]` 다이얼로그의 슬롯 격자가
**When** 렌더된다
**Then** **그 예약 자신이 점유한 슬롯은 `taken`으로 표시되지 않는다** — `GET /availability`가 `exclude_appointment_id`를 받아 **의사 축·환자 축 둘 다**에서 자기 행을 뺀다 (UX-DR3)
**And** 파라미터 미지정 시 응답이 기존과 바이트 동일해 기존 호출자 4곳(예약 생성·대리 예약 등)이 무수정으로 동작한다

**AC8 — 행 액션 통합**
**Given** 직원 예약 관리 목록에서
**When** 행 액션이 렌더된다
**Then** `[의사 변경]`이 `[변경]`으로 대체되고 버튼 수는 그대로다(대기 3개·확정 3개)
**And** 390×844에서 카드 오버플로 0, 콘솔 오류 0 (UX-DR11)
**And** `[변경]`은 비파괴적 Dialog다(취소만 AlertDialog 유지 — UX-DR6 무변경)

**AC9 — `/doctor` 폐기 완결**
**Given** `PATCH /appointments/{id}/doctor` 폐기 후
**When** 레포를 검색한다
**Then** 라우터·서비스·db SQL·스키마·`lib/api.ts` 함수·해당 계약 테스트가 **함께** 제거되고 살아있는 코드·규칙 파일에 남은 참조가 0이다
**And** 완료 스토리 파일(2-3 등)의 언급은 시점 기록물이라 **그대로 둔다**

> **경계(정직):** 진료과 이동·환자 셀프 변경·변경 이력(감사 로그)은 범위 밖. 의사 축 TOCTOU는 AD-4 경계 그대로 단일 세션 전제이며, 환자 축만 006 인덱스로 동시 요청까지 닫힌다.

## 6. 구현 핸드오프 (Implementation Handoff)

**변경 규모: Moderate** — 백로그 재구성(에픽 신설)이 필요하고, 구현은 스토리 1건이다.

| 단계 | 담당 | 산출 |
|---|---|---|
| 1. 산출물 반영 | dev (이 세션) | §4 표의 계획 정본 + 규칙 파일 편집 |
| 2. 스토리 파일 생성 | `/bmad-create-story` | `7-1-예약-일정-변경.md` (Dev Notes에 §2 실측 3건·§3.4 3층 가드 내장) |
| 3. 구현 | `/bmad-dev-story` | `story/7-1-appointment-reschedule` 브랜치, TDD 선 red |
| 4~7. 리뷰·실증·PR·릴리스 | 기존 사이클 | `.claude/rules/workflow.md` 그대로 |

**성공 기준:** 라이브에서 직원이 확정된 예약의 시각을 바꾸고, 그 슬롯이 다른 예약을 막으며, 원래 슬롯이 풀리고, 취소 행이 생기지 않는다.

**릴리스 주의:** `/doctor` 폐기 때문에 **Railway 배포 완료를 확인한 뒤** 라이브 실측한다(Vercel이 먼저 뜨면 그 사이 [변경]이 404).

## 7. 승인

**2026-07-29 사용자(지석) 승인 완료.** 결정 4건:

1. **FR-19 신설** (FR-7 확장 아님 — done 커버리지 보존)
2. **Epic 7 신설** (chore 아님 — 분기 기준 그대로 적용, 예외 만들지 않음)
3. **통합 `[변경]` 버튼** (별도 `[시간 변경]` 아님 — 모바일 버튼 수·부분 실패 회피)
4. **`/doctor` 폐기 → `/reschedule` 대체** (경로명 유지 + 스키마 확장 아님 — 게이트 사본 방지)

§4 산출물 변경 전건 반영 완료(같은 날). Epic 5 회고 액션 #2(규칙 파일 sweep)도 §4.2 로 종결.
