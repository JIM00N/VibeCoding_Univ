---
title: Sprint Change Proposal — walk-in 전용 경로 철회, 대리 예약으로 흡수
status: approved
created: 2026-07-28
workflow: bmad-create-story (스코프 결정 중 발의)
approver: 지석
---

# Sprint Change Proposal (2026-07-28)

> 병원 진료관리(hospital-care) — Epic 5의 마지막 스토리 5.3 착수 직전. 규모: **Small(스토리 1건 재정의, FR 1건 범위 축소)**.
> 되돌릴 완료 작업 없음. 코드 삭제 0 · DB 마이그레이션 0 · 백엔드 변경 0.

## 1. 이슈 요약 (Issue Summary)

**트리거:** 5.3 스코프 확인 중 사용자 제기 —

> "워크인도 환자 등록을 하고 기존의 환자와 동일하게 처리해야 함. 그렇다면 비어있는 가장 빠른 시간으로 예약하면 되는데, 따져보니 환자등록과 대리예약이 있는데 워크인을 따로 처리해야 하는지 의문"

FR-16(walk-in 즉시 진료)은 **예약 없이** `medical_record`를 만드는 **네 번째 쓰기 경로**를 요구한다. 그런데 Epic 6에서 **FR-18 직원 대리 예약**이 들어오고 Epic 5.2에서 **서버 자동 배정**이 들어오면서, 같은 업무(예약 없이 온 환자를 지금 진료 넣기)를 기존 경로로 처리할 수 있게 됐다. 전용 경로는 세 번째 예약/기록 표면이 되어 중복이다.

## 2. 영향 분석 (Impact Analysis)

### 이미 완성돼 있던 것 (5.1·5.2가 만든 것)

| 능력 | 상태 | 위치 |
|---|---|---|
| 빈 의사 자동 배정 + 전원 점유 409 거부 | **동작 중** | `POST /appointments` `doctor_id: null` (Story 5.2) |
| walk-in 점유 판정(충돌 합집합의 `medical_record` arm) | **동작 중** | `db/availability.py` `occupied_sources_sql` (Story 5.1) |
| 슬롯 taken 사전 표시 · 교집합 계산 | **동작 중** | `GET /availability` + `patient/book` (5.1·5.2) |

즉 FR-16이 필요로 하던 **가용성·배정·거부는 전부 이미 서 있다.** 없는 것은 "예약 없이 기록을 만드는 경로" 하나뿐이다.

### 전용 walk-in 경로가 대리 예약과 실제로 다른 점

딱 하나다 — **5.1의 과거 시각 가드**(`슬롯 < 지금` → 400 "이미 지난 시간이에요")에 걸려, 대리 예약으로는 **지금 진행 중인 슬롯**을 잡을 수 없다. 10:14에 접수하면 10:00은 거부되고 10:30으로 밀린다. walk-in만 `visited_at = 지금`으로 현재 슬롯을 점유할 수 있다(`medical_record`엔 30분 CHECK가 없다).

나머지 차이(의사 자동 배정, 빈 의사 없으면 거부, 진료과=배정 의사 소속)는 전부 대리 예약 경로로도 성립한다.

### 트레이드오프

| | 전용 walk-in 경로(원안) | 대리 예약 흡수(채택) |
|---|---|---|
| 접수 단계 | 2 (폼 → 저장) | 4 (대리예약 → 확정 → 기록 작성 → 저장) |
| 잡히는 슬롯 | 지금 진행 중 슬롯 | 다음 빈 슬롯(최대 30분 뒤) |
| 데이터 표현 | `appointment_id` null = "예약 없었음"이 정직하게 남음 | 예약 행이 남음(사후 예약처럼 보임) |
| 신규 표면 | 엔드포인트 1 · 스키마 1 · SQL문 1 · 페이지 1 · 사이드바 항목 1 | **0** |
| 직원이 배울 개념 | +1 (walk-in) | 0 |

**결정 근거:** 데모·학습용 단일 병원 앱에서 "최대 30분 뒤 슬롯"과 "예약 행이 남음"은 수용 가능한 정직한 한계인 반면, 세 번째 예약/기록 표면은 영구적인 유지 비용이다. 사용자의 "환자 등록 → 기존 환자와 동일하게 처리"라는 업무 모델이 실제 접수 데스크 흐름과도 더 가깝다.

## 3. 채택안 (Recommended Path Forward)

**Story 5.3을 "대리 예약의 walk-in 흡수"로 재정의한다.** 직원 대리 예약 다이얼로그에 두 가지 어포던스만 얹는다:

1. **담당 의사 "자동 배정" 옵션** — `doctor_id: null` 제출(서버는 5.2로 이미 준비 완료). 직원이 의사를 직접 고르지 않아도 된다.
2. **"가장 빠른 시간"** — 그 날짜의 빈 슬롯 중 첫 번째를 고른다. 직원이 격자를 눈으로 훑지 않아도 된다.

**변경 범위: `frontend/components/proxy-booking-dialog.tsx` 1파일.** 백엔드 diff 0 · 신규 파일 0 · 신규 엔드포인트 0 · 마이그레이션 0 · 의존성 0.

### 명시적으로 이행하지 않는 것 (정직)

- **FR-16의 "예약 없이 기록(`appointment_id` null)"** — 범위에서 제외한다. 앱은 `medical_record`를 예약 기반으로만 만든다.
- **현재 진행 중인 슬롯 점유** — 5.1 과거 가드가 유지되므로 접수는 다음 빈 슬롯으로 잡힌다.
- **`medical_record.appointment_id` nullable · `uq_medical_record_appointment`의 부분 조건 · 5.1 충돌 합집합의 walk-in arm** — 전부 그대로 둔다. 죽은 코드가 아니라 **설계 여유**로 남는다(FR-16을 되살릴 때 다시 필요하고, 지금 걷어내면 5.1 게이트 SQL을 건드리는 회귀 위험만 생긴다).

## 4. 산출물 변경 (Artifact Adjustments)

| 산출물 | 변경 |
|---|---|
| `epics.md` FR-16 | "(2026-07-28 correct-course: 전용 경로 철회 — 대리 예약 흡수)" 주석 + 범위 축소 명시 |
| `epics.md` FR Coverage Map | FR-16 행을 축소된 범위로 갱신 |
| `epics.md` Epic 5 개요 (2곳) | "예약 없이 온 환자를 빈 의사에게 즉시 진료·기록" → "직원이 walk-in 환자를 자동 배정·가장 빠른 시간으로 접수" |
| `epics.md` Story 5.3 | 스토리 문장·AC 전면 재정의 |
| `epics.md` UX-DR7 · Story 6.3 경계 · FR-18 | walk-in 전용 red Dialog → 인라인 수렴, FR-16과 "구분한다" 문구 정정 |
| `sprint-status.yaml` | 키 `5-3-walk-in-즉시-진료` → `5-3-대리예약-walk-in-흡수`, backlog → ready-for-dev |
| 스토리 파일 | `5-3-대리예약-walk-in-흡수.md` 신규 |
| `prd.md` FR-16·FR-18 | 범위 축소 주석 + 철회 항목·정직한 한계 명시(원문은 취소선으로 보존). 2026-07-25 correct-course 가 FR-18 을 PRD 에 직접 반영한 선례를 따른다 |
| `ARCHITECTURE-SPINE.md` | Capability Map 의 FR-16 행 갱신 + Deferred 앞 correct-course 주석. **AD-4·AD-6 조항 본문은 무수정** — 충돌 합집합의 walk-in arm·`appointment_id` nullable·부분 유니크는 전부 보존(설계 여유). AD-6의 "walk-in → 배정 의사 소속" 분기만 현재 도달 코드 없음을 명시 |
| `EXPERIENCE.md` | IA 표(전용 화면 → 대리 예약 경유)·Flow 3 개정·State Patterns(전원 점유 = red 인라인) |
| `implementation-readiness-report-2026-07-13.md`, `sprint-change-proposal-2026-07-25.md` | **수정하지 않는다** — 날짜가 박힌 시점 기록물 |

**되돌릴 완료 작업 없음.** Epic 5의 5.1·5.2·5.4는 전부 그대로 유효하다.

## 5. 승인

2026-07-28 사용자(지석) 승인 — 3개 안(전용 경로 / 대리예약 흡수 / 5.3 삭제) 중 **대리예약 흡수** 선택.
