---
baseline_commit: 7a07d32
---

# Story 5.3: 대리 예약의 walk-in 흡수 (자동 배정 + 가장 빠른 시간)

Status: done

> 🚧 **착수 게이트: 열림.** 선행 5.1(가용성 엔진)·5.4(사본 정리)·5.2(자동 배정) 전부 done(2026-07-27, 커밋+배포+라이브). 이 스토리는 **5.2가 서버에 이미 넣어둔 자동 배정을 직원 화면에 배선하는 것**이 전부다 — 백엔드는 1바이트도 건드리지 않는다.
>
> ⚠️ **스코프 재정의(2026-07-28 correct-course).** 원안 "walk-in 즉시 진료(예약 없이 `appointment_id` null 기록)"는 **철회**됐다. 사유·트레이드오프·정직한 한계는 `planning-artifacts/sprint-change-proposal-2026-07-28.md`가 정본. **이 스토리에서 `medical_record`를 만드는 새 경로를 절대 만들지 말 것.**

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 접수 직원,
I want 예약 없이 온 환자를 대리 예약에서 의사·시간을 직접 찾지 않고 바로 접수하기를,
so that walk-in 환자도 기존 환자와 같은 흐름(등록 → 예약 → 확정 → 기록)으로 빠르게 처리된다.

**한 줄 성격:** **프런트 1파일.** `components/proxy-booking-dialog.tsx`에 어포던스 2개(의사 "자동 배정" · "가장 빠른 시간")를 얹는다. 자동 배정 배선은 `app/patient/book/page.tsx`(5.2)가 **정본 참조 구현**이라 그 4곳을 그대로 이식하고, "가장 빠른 시간"만 이 스토리의 신규 코드다(핸들러 1개 + 버튼 1개). **백엔드 diff 0 · `lib/api.ts` diff 0 · 신규 파일 0 · 신규 엔드포인트 0 · 마이그레이션 0 · 의존성 0.**

## Acceptance Criteria

**AC1 — 담당 의사 "자동 배정" 옵션 (FR-16, FR-6 P1)**
**Given** 대리 예약 다이얼로그에서 진료과를 골라 의사 목록이 로드됐을 때
**When** 담당 의사 Select 를 연다
**Then** **첫 항목 "자동 배정"** 이 있고, 고르면 안내 캡션이 뜨며(`aria-describedby` 체인 — 5.2 선례), 제출 시 `doctor_id: null` 로 보낸다. 서버가 그 과의 빈 의사를 골라 채운 `Appointment` 를 돌려주고, **서버·`lib/api.ts` 계약은 무변경**이다(5.2가 이미 지원 — `AppointmentCreate.doctor_id: number | null`). 빈 선택(미선택 제출)은 **자동이 아니라** 기존 인라인 에러 "담당 의사를 선택해 주세요." 그대로다(실수 자동 배정 방지 — 5.2 구현 결정 3 계승).

**AC2 — 자동 모드 교집합 taken 표시 (FR-15, UX-DR3)**
**Given** 자동 배정을 고른 상태에서
**When** 그 날짜의 슬롯 격자를 본다
**Then** 그 과 의사 **전원의 `GET /availability` 를 병렬 호출해 교집합(전원 점유 슬롯)만** taken 으로 렌더한다 — 한 명이라도 비면 접수 가능이다. 기존 3상태·"이 날짜는 예약이 모두 찼어요" 안내가 그대로 동작한다. 부분 실패 포함 조회 실패는 **비치명** — 이전 스냅샷을 보존하고 taken 없이 렌더한다(5.1 리뷰 P3 규율, 콘솔 0 유지). 직접 선택 모드의 단일 호출 경로는 **무변경**이다.

**AC3 — "가장 빠른 시간" (FR-16, UX-DR7, UX-DR10)**
**Given** 슬롯 격자가 렌더된 상태에서
**When** **[가장 빠른 시간]** 을 누른다
**Then** 그 날짜의 슬롯 중 **① 아직 지나지 않았고 ② taken 이 아닌** 첫 슬롯이 선택된다. 조건을 만족하는 슬롯이 없으면 선택하지 않고 인라인으로 안내한다(`slotErr` — 전원 점유면 "이 날짜는 예약이 모두 찼어요. 다른 날짜를 골라 주세요.", 남은 시간이 없으면 "이 날짜엔 예약 가능한 시간이 없어요. 다른 날짜를 골라 주세요."). ① 판정은 **클릭 시점의 `new Date()`** 로 다시 한다 — 메모된 `slots` 는 마운트 시각 기준이라 오래 열어둔 다이얼로그에서 이미 지난 슬롯을 고를 수 있다(Epic 6 회고 액션 #1 "시간 경과"). 탐색 범위는 **선택된 날짜 안**이며 날짜를 넘어가지 않는다(다음 날 가용성은 조회하지 않음 — 경계 참조).

**AC4 — 거부·요약·성공 문구 흡수 (UX-DR7, UX-DR10)**
**Given** 자동 배정으로 제출했는데 그 슬롯에 그 과 의사가 전원 점유일 때
**When** 서버가 409 `"이 시간엔 모든 의사의 예약이 차 있어요. 다른 시간을 골라 주세요."` 를 돌려준다
**Then** **기존 409 분기**(red 인라인 `slotErr` + 그 셀 즉시 taken + 선택 해제 + 재조회 + `revealField`)가 새 문구를 그대로 흡수한다 — **코드 분기 추가 0**. 요약 블록은 자동 모드에서도 렌더되고(의사 자리 "자동 배정"), 성공 toast 는 자동 모드일 때만 **배정된 의사 이름**을 알려준다(`appt.doctor_name`). **직접 선택 모드의 기존 toast 문구는 바이트 무변경.**

**AC5 — 회귀 0 · 동결면 (add-only)**
**Given** 이 스토리가 대리 예약 다이얼로그 한 곳만 건드릴 때
**When** 끝난다
**Then** ① **백엔드 diff 0** (`git diff --stat backend/` 가 비어 있음) ② `lib/api.ts`·`components/slot-picker.tsx`·`lib/booking-slots.ts`·`app/patient/book/page.tsx`·`app/staff/appointments/page.tsx` **diff 0** ③ 직접 선택 대리 예약 흐름(환자 검색 → 진료과 → 의사 → 날짜 → 슬롯 → 생성 → 목록 prepend)이 **동작·문구 무변경** ④ 신규 상태 변수 0(자동 배정은 기존 `doctorId` 에 센티넬 문자열이 들어갈 뿐이라 `resetForm()` 도 무수정).

**AC6 — 품질 게이트**
**Given** 검증할 때
**When** 게이트를 돈다
**Then** ① 백엔드 pytest 전체 green(무수정 — diff 0 이므로 기준선 그대로) · ruff 0건 ② `npm run lint` 클린 · `npm run build` 그린(라우트 성격 무변화) ③ **curl 실증**(실 Supabase, 로컬 uvicorn): 대리 예약과 **같은 payload 모양**으로 자동 배정 201 · 점유 의사 회피 pick · 전원 점유 409 문구 — 5.2 계약이 여전히 그대로임을 확인(백엔드 무변경의 실 보증) ④ **브라우저 실측**(390×844 + ≥md, 콘솔 0): 자동 배정 교집합 렌더 · [가장 빠른 시간] · 409 인라인 · **"시간 경과"·"같은 값 재선택"·"자동↔직접 전환 잔상"·"다이얼로그 재열림 신선도" 4종 필수**(Epic 6 회고 액션 #1·#2) ⑤ 검증 데이터 SQL 원복(예약만 — 이 스토리는 기록을 만들지 않는다).

> **경계(정직):**
> - **접수는 "다음 빈 슬롯"이다.** 5.1 과거 시각 가드(`슬롯 < 지금` → 400)가 유지되므로 **지금 진행 중인 슬롯은 잡을 수 없다**(10:14 접수 → 10:30). 이 가드를 walk-in 을 위해 우회하지 말 것 — 5.1 AC7 이 세운 계약이다.
> - **예약 없이 온 환자도 예약 행으로 남는다.** `medical_record.appointment_id` nullable · `uq_medical_record_appointment` 부분 조건 · 5.1 충돌 합집합의 walk-in arm 은 **전부 그대로 보존**한다(죽은 코드 아님 — 설계 여유. 걷어내면 5.1 게이트 SQL 회귀 위험만 생긴다).
> - **[가장 빠른 시간]은 날짜를 넘지 않는다.** 여러 날 가용성 조회는 N일 × N의사 호출이라 범위 밖 — 그 날이 다 차면 안내로 끝낸다.
> - TOCTOU 는 5.1·5.2와 동일하게 범위 밖(단일 세션 전제).

## Tasks / Subtasks

- [x] **Task 0 — 착수 게이트·브랜치 (workflow.md 2단계)**
  - [x] 5.1·5.2·5.4 done 확인(sprint-status.yaml) → `story/5-3-proxy-booking-walk-in` 브랜치 → 스토리 Status·sprint-status `5-3-대리예약-walk-in-흡수` → in-progress.
  - [x] **DB 마이그레이션 없음** 확인 — 스키마 무변경, `information_schema` 실측 불필요.
  - [x] frontend 작업 전 `frontend/AGENTS.md` 필독(Next.js 16 ≠ 훈련 데이터). base-ui Select `items` 계약·동일값 재발화는 이 다이얼로그 기존 코드가 정본.
  - [x] **정본 참조 구현 정독**: `app/patient/book/page.tsx` 의 자동 배정 4곳(아래 "배선 청사진" 표) — 이식 대상이다. 읽지 않고 새로 쓰지 말 것.

- [x] **Task 1 — 자동 배정 옵션 (AC1)**
  - [x] 파일 상단에 `const AUTO_DOCTOR = "auto";` (patient/book:37 미러 — 의도적 무해 사본, Dev Notes "구현 결정 1" 참조).
  - [x] `doctorItems` memo(:256-259)에 `[AUTO_DOCTOR]: "자동 배정"` 을 **먼저** 넣는다(트리거 라벨용) — `{ [AUTO_DOCTOR]: "자동 배정", ...Object.fromEntries(...) }`.
  - [x] `SelectContent`(:633-639) 첫 항목에 `<SelectItem value={AUTO_DOCTOR}>자동 배정</SelectItem>`.
  - [x] 캡션 `<p id="proxy-doctor-auto-hint" className="text-xs text-muted-foreground">` — `doctorId === AUTO_DOCTOR && !doctorErr` 일 때만. `aria-describedby` 체인(:614-619)에 **오류 > 자동 캡션 > doctorsEmpty** 순으로 끼운다.
  - [x] 제출(:376) `doctor_id: doctorId === AUTO_DOCTOR ? null : Number(doctorId)`.
  - [x] **건드리지 않는 것**: 의사 Select 의 `disabled`(:607 — `!deptId || doctorsLoading || doctorsEmpty` 그대로. 빈 과엔 자동 배정도 불가라 정합), `onValueChange` 의 동일값 가드·`setTakenMs(null)`(:599-606), placeholder 분기(:621-631).

- [x] **Task 2 — 교집합 가용성 (AC2)**
  - [x] 가용성 effect(:220-249)에 자동 분기 이식 — patient/book:130-174 를 **그대로** 옮기되 이 다이얼로그의 `open` 가드·`effectiveYmd` 를 유지한다. deps 에 `doctors` 추가 → `[open, doctorId, doctors, effectiveYmd, availabilityNonce]`.
  - [x] 자동인데 의사 목록이 비면 조회 생략: `if (doctorId === AUTO_DOCTOR && (doctors ?? []).length === 0) return;` — 도달 경로는 **의사 로드 실패**(`doctors` null 유지, Select 는 활성)의 지속 상태다(patient/book 주석의 정정된 서술을 그대로 가져올 것. 과도기 아님).
  - [x] `cancelled` 가드 · catch 의 스냅샷 보존(주석 포함) · 선택 슬롯이 taken 판명 시 해제+`slotErr` 안내(:235-240)는 **공용 경로 그대로** 재사용 — 자동/직접 분기는 `nextTaken` Promise 를 만드는 부분에만 둔다.
  - [x] 부분 실패: `Promise.all` 은 하나만 실패해도 reject → 기존 catch 로 흘러 스냅샷 보존(비치명). 새 오류 UI 를 만들지 말 것.

- [x] **Task 3 — "가장 빠른 시간" (AC3, 이 스토리의 유일한 신규 로직)**
  - [x] 핸들러 `selectEarliestFreeSlot()` — 클릭 시점 `new Date().getTime()` 으로 지난 슬롯을 다시 거르고, `takenMs?.has(ms)` 가 아닌 첫 슬롯을 `setSelectedIso` + `setSlotErr(null)`. 없으면 선택하지 않고 `setSlotErr(…)` (문구 2종은 AC3).
  - [x] `takenMs === null`(미조회·조회 실패)이면 점유 조건은 **통과 처리**한다(`takenMs?.has(ms) ?? false`) — 시간상 첫 슬롯을 고르고 서버 409 가 백스톱한다. 가용성이 없다고 버튼을 막지 않는다(조용한 강등 규율, 5.1).
  - [x] 버튼 배치: 슬롯 라벨 행(:696-704, 이미 `justify-between`)에 `size="sm" variant="outline"`. `slots.length === 0` 이면 격자 자체가 안 뜨므로 함께 숨긴다.
  - [x] **라벨·배치 세부는 로컬 실측(:3000)에서 확정** — 기본안은 "가장 빠른 시간". 대안(첫 가용성 응답 도착 시 자동 선택)은 기존 전화 예약 흐름의 오선택 위험 때문에 기본안에서 제외했다(Dev Notes 구현 결정 3) — 실측에서 버튼이 굼뜨게 느껴지면 그때 재검토.

- [x] **Task 4 — 요약·성공 문구 (AC4)**
  - [x] 파생값(:408) `doctorName` → `doctorLabel` 로 확장: `doctorId === AUTO_DOCTOR ? "자동 배정" : doctorName ? \`${doctorName} 선생님\` : null` (patient/book:287-288 미러). 요약 블록(:741-746)의 조건·표기를 `doctorLabel` 기준으로 — 현재 문구가 `… · ${doctorName} 선생님 · …` 이라 **"선생님"이 라벨 안으로 들어간다**(자동 모드에서 "자동 배정 선생님"이 되지 않게).
  - [x] 성공 toast(:381): **자동 모드일 때만** 배정 의사 이름 추가(예: `${appt.patient_name}님 예약을 만들었어요. ${appt.doctor_name} 선생님으로 배정됐어요. 상태는 '대기'로 시작해요.`). `doctor_name` 은 nullable 타입이므로 `?? "담당 의사"` 폴백. **직접 선택 문구는 바이트 무변경.**
  - [x] 409 경로(:386-394)·성공 후 `resetForm()`+닫기(:382-384)는 **무수정**. ⚠️ 5.2 의 "자동 성공 낙관 마킹 revert" Med 이슈는 **여기 해당 없음** — 이 다이얼로그는 성공 시 리셋하고 닫으므로 낙관 마킹 자체가 없다. 낙관 마킹을 새로 넣지 말 것.

- [x] **Task 5 — 검증 ([[feedback-verify-ui-live-before-deciding]])**
  - [x] `git diff --stat backend/` **비어 있음** 확인(AC5 ①) + 동결 5파일(`lib/api.ts`·`slot-picker`·`booking-slots`·`patient/book`·`staff/appointments`) 전부 무변경 확인.
  - [x] 백엔드 pytest **126 passed**(5.2 기준선 그대로 — 무수정) · ruff **All checks passed** · `npm run lint` 클린 · `npm run build` 그린(15 라우트 성격 무변화).
  - [x] **curl 실증(로컬 uvicorn :8000 + 실 Supabase)** ①–⑥ 전부 기대대로: ① 자동 → **201 id 72 김민재**(과 최소 id) ② 같은 슬롯 자동 → **201 id 73 박서연**(점유 회피 pick) ③ 한 번 더 → **409 정확 문구** ④ 지정 경로 → 201 id 74(회귀 0) ⑤ 과거+자동 → **400**(경계 "다음 빈 슬롯"의 실증 근거) ⑥ `GET /availability` 키셋·값 불변.
  - [x] **브라우저 실측**(Playwright, 1280×900 + 390×844): 자동 배정 첫 항목·트리거 라벨·캡션·`aria-describedby=proxy-doctor-auto-hint` → **교집합 렌더 증명**(7/31 전원 점유 10:00 = "예약됨" · 김민재만 점유한 10:30 = "예약 가능") → [가장 빠른 시간] → **09:00** → 요약 "자동 배정" → 제출 → toast **"김민재 선생님으로 배정됐어요"** → 목록 prepend 확인 → 전원 점유 후 재제출 → **409 red 인라인 정확 문구 + 그 셀 taken + 선택 해제 + 폼 보존**.
  - [x] **회고 액션 #1·#2 시나리오 4종**: ① **시간 경과** — `page.clock` 으로 다이얼로그를 연 채 2시간 전진 → [가장 빠른 시간] 이 마운트 시각 첫 슬롯(15:30)이 아니라 **17:30** 을 골랐다(핸들러 안 현재 시각 재판정 증명) ② **같은 값 재선택** — "자동 배정" 재클릭 무해·데드락 0 ③ **자동↔직접 전환 잔상** — 김민재 전환 시 10:00·10:30 둘 다 taken, 자동 복귀 시 10:30 재개방 ④ **재열림 신선도** — reload+재열림 후에도 교집합 신선.
  - [x] 390×844: 격자 18셀·[가장 빠른 시간] 버튼 렌더(x=254 w=95)·**가로 오버플로 0**. Chrome 확장 미연결로 프로젝트 표준 대체 경로인 Playwright 사용(5.2 선례, 콘솔 검증 포함).
  - [x] **검증 데이터 원복(최우선 금기)**: 예약 **72–79 (8건)** id 지정 삭제(uv+psycopg) → 잔여 `[22, 40, 41, 68, 69]`. `medical_record` 는 생성도 삭제도 없음(총 2행 불변 — 이 스토리는 기록을 만들지 않는다). 시드 재실행 없음. ⚠️ 68·69 는 이 세션 시작 전부터 존재(첫 생성이 72) — 남의 데이터라 보존.
  - [x] `deferred-work.md` 갱신 — "알려진 사본(사전 트리아지)" 2건 기록.

- [x] **Task 6 — 마감: 커밋 + 배포 + 라이브 확인**
  - [x] `Story 5.3:` 한국어 커밋 → **Codex 사전 리뷰(필수)** + `/bmad-code-review` 3층 → 트리아지 → Patch 반영 커밋. **폼·상태 스토리라 리뷰 예산 상향**(Epic 6 회고 액션 #3) — 리뷰어에게 High 후보를 명시 지목: "교집합 계산 오류로 가능 슬롯이 taken 표시" · "[가장 빠른 시간]이 지난/점유 슬롯 선택" · "자동↔직접 전환 시 stale taken" · "직접 선택 흐름 회귀".
  - [x] 로컬 서버(:8000 + :3000) 기동 → PR 생성 → **사용자 승인 후 머지**(merge commit) — PR #27 머지 `34d2a4a`(2026-07-28 16:17 KST).
  - [x] Vercel 자동 배포(Railway 도 push 로 재배포되지만 백엔드 코드가 동일해 동작 변화 0 — 성공 여부만 확인) → **라이브 실측** → 검증 데이터 SQL 원복 → 스토리 Status·sprint-status `5-3` → done, main 에 done 커밋·push → 서버 종료.
    - Railway `/health` **200** · Vercel `/staff/appointments` **200**(신규 번들).
    - **교집합 실증용 라이브 시드**: `POST /appointments` 로 7/29 10:00 KST 에 김민재(3)·박서연(4) 점유 → **id 116·117 (201)**. 같은 슬롯 자동 배정(`doctor_id` 생략) → **409 "이 시간엔 모든 의사의 예약이 차 있어요. 다른 시간을 골라 주세요."** (AC2 거부 문구 라이브 실증).
    - **브라우저 실측**(Playwright 390×844, 라이브 Vercel): 의사 옵션 `["자동 배정","김민재 선생님","박서연 선생님"]` — **"자동 배정" 첫 항목**(AC1) · 트리거 라벨 "자동 배정" · 캡션 "고른 시간에 비어 있는 선생님이 자동으로 배정돼요." · `aria-describedby=proxy-doctor-auto-hint` → **교집합 렌더 증명**(AC2): 10:00 = `예약됨` disabled(전원 점유) / 09:00·09:30·10:30 = `예약 가능` → **[가장 빠른 시간] → 09:00 선택**(AC3) → 요약 `role=status` = "📅 7월 29일 (수) 09:00 · 이비인후과 · **자동 배정** · 박지훈님 (#2)"(AC4) → 격자 18칸 · **가로 오버플로 0px** · **콘솔 에러 0건**. 제출은 하지 않음(라이브 쓰기 최소화).
    - **검증 데이터 원복(최우선 금기)**: 예약 **116·117** id 지정 삭제 → 잔여 `[22, 40, 41, 68, 69]` = 검증 전과 동일. `medical_record` 2 · `prescription` 3 · `patient` 3 전부 불변. 시드 재실행 없음.
  - [x] **Epic 5 종료** — 5.1·5.2·5.3·5.4 전부 done → `epic-5: done` + `/bmad-retrospective`(액션 항목을 sprint-status 에 반영).

### Review Findings (2026-07-28)

4층 병렬 리뷰: **Codex 사전 리뷰**(1건) + **Blind Hunter**(10건) + **Edge Case Hunter**(8건) + **Acceptance Auditor**(7건 — 하드 게이트는 전부 독립 재실행으로 PASS 확인). 병합·중복 제거 후 유니크 18건 → 코드 도달성을 직접 읽어 심각도 재산정 → **Patch 13 · Defer 3 · Dismiss 2**.

Acceptance Auditor 가 재실행으로 확인한 PASS: 백엔드 diff 0 · 동결 5파일 0줄 · 코드 파일 정확히 1개 · `useState` 26→26(신규 상태 0) · pytest 126 · ruff · lint/build 15라우트 · 안티패턴 5종 전부 미위반 · 경계 2건(다음 빈 슬롯·walk-in arm 보존) 정직함 확인.

**[Review][Patch] — 13건**

- [x] [Review][Patch] **[Med] `slotErr` 가 의사·진료과 변경에도 살아남아 그리드와 모순** (blind) — 날짜 변경 핸들러는 `setSlotErr(null)` 을 하는데 의사 변경(`:670-677`)·진료과 변경(`:342-356`)은 안 한다. 만석 의사에서 [가장 빠른 시간] → red "이 날짜는 예약이 모두 찼어요" → 널널한 의사로 전환하면 그리드는 전부 열리는데 red 는 그대로. 게다가 `:812-814` 가 그 오류 id 를 radiogroup `aria-labelledby` 에 이어 붙여 SR 이 빈 그리드 위에서 계속 읽는다. 성질은 5.3 이전부터 있었으나 새 버튼이 **한 번의 클릭으로 도달**하게 만들었다. [frontend/components/proxy-booking-dialog.tsx:670]
- [x] [Review][Patch] **[Med] [가장 빠른 시간]이 의사 선택 전에도 눌려 가용성 무지 상태로 슬롯을 고르고, 이후 거짓 사유를 표시** (blind) — 버튼이 `slots.length > 0` 로만 게이트돼 있다. 환자만 고른 뒤 클릭 → `takenMs === null` 이라 09:00 이 잡힘 → 그 뒤 진료과·자동 배정 선택 → 조회 결과 09:00 이 교집합에 있으면 선택이 해제되며 "고른 시간이 그새 예약됐어요"가 뜬다. **거짓이다** — 방금 찬 게 아니라 처음부터 차 있었고 앱이 안 봤을 뿐. [frontend/components/proxy-booking-dialog.tsx:789]
- [x] [Review][Patch] **[Med] [가장 빠른 시간]이 제출 중에도 활성 — mid-flight 클릭이 409 핸들러의 stale 클로저에 삼켜짐** (edge+blind 교차) — 닫기·예약 만들기만 `disabled={submitting}` 이다. 제출 중 클릭하면 `selectedIso` 가 바뀌는데, 409 catch 는 클로저가 캡처한 **이전** `selectedIso` 로 `setTakenMs` 를 찍고 `setSelectedIso(null)` 한다 → 방금 고른 칸은 사라지고 엉뚱한 칸이 "예약됨"이 된다. [frontend/components/proxy-booking-dialog.tsx:789]
- [x] [Review][Patch] **[Med] `selectEarliestFreeSlot()` 의 막다른 길 분기가 stale `selectedIso` 를 안 지움** (edge) — `!first` 는 "미래의 빈 슬롯이 하나도 없다"는 뜻이라 현재 선택은 반드시 지났거나 점유된 것인데, 형제 거부 경로(가용성 effect `:268`·제출 재검증 `:420`)와 달리 선택을 남긴다. red "예약 가능한 시간이 없어요"가 뜬 채 그 셀은 계속 선택돼 있고 요약 블록도 그 시각을 보여준다. [frontend/components/proxy-booking-dialog.tsx:379]
- [x] [Review][Patch] **[Med] 의사 로드 실패 시 "자동 배정"이 유일 항목으로 선택 가능해져 가용성 무지 상태를 앱이 권유** (edge+blind 교차) — `getDoctors` 실패면 `doctors` 가 `null` 로 남아 `doctorsEmpty` 가 false → Select 가 **활성**인데 항목은 자동 배정 하나뿐이다. 고르면 `:239` 가드로 조회를 건너뛰어 `takenMs` 가 null → 전 셀이 "예약 가능"으로 칠해지고 슬롯 범례도 사라진다. 5.3 이전엔 항목이 0개라 아무것도 커밋할 수 없었다. 자동 배정 항목을 `doctors` 비었을 때 렌더하지 않으면 이 경로와 아래 두 파생 건이 함께 닫힌다. [frontend/components/proxy-booking-dialog.tsx:707]
- [x] [Review][Patch] **[Low] "이 날짜는 예약이 모두 찼어요"가 회색 status·빨강 alert 로 두 번 렌더** (edge+blind 교차) — 버튼의 실패 문구가 기존 막다른 길 안내(`:823-829`)와 바이트 동일이고 두 조건이 동시에 참일 수 있다. 같은 문장이 색만 다르게 두 줄, SR 에도 두 번(polite+assertive) 읽힌다. [frontend/components/proxy-booking-dialog.tsx:382]
- [x] [Review][Patch] **[Low] 버튼 성공 분기가 보조기술에 무음(실패만 announced)** (edge+blind 교차) — 실패는 `role="alert"` 로 읽히는데 성공은 포커스가 버튼에 남고 격자 깊숙한 라디오의 `aria-checked` 만 바뀐다. SR 사용자는 **버튼이 아무것도 안 했을 때만 소리를 듣고 시각을 골랐을 땐 침묵을 듣는다.** 이 파일이 UX-DR9 에 들인 투자(spokenTime·라벨 체인)와 비대칭. [frontend/components/proxy-booking-dialog.tsx:389]
- [x] [Review][Patch] **[Low] `Promise.all` catch 주석의 "이전 스냅샷 보존"이 절반만 참** (blind) — 의사·진료과·날짜 변경은 전부 `setTakenMs(null)` 을 먼저 하므로 그 경로에서 보존되는 스냅샷은 항상 `null` 이다. 주석이 참인 건 409 후 `availabilityNonce` 재조회 경로뿐(그 땐 409 로 찍은 마킹이 실제로 보존된다). 다음 사람이 이 실패 모드를 오해한다. [frontend/components/proxy-booking-dialog.tsx:249]
- [x] [Review][Patch] **[Med] `.claude/rules/backend.md:57` 이 철회된 walk-in 을 예정 작업으로 지시** (auditor) — "(Story 5.3 워크인이 네 번째 호출자를 추가하기로 예정돼 있다.)" 가 남아 있다. 이건 날짜 박힌 기록물이 아니라 `paths: backend/**` 로 **자동 로드되는 살아있는 규칙**이라, 앞으로 모든 백엔드 세션에 오지 않을 호출자를 예고한다. correct-course 정리가 `_bmad-output/` 만 훑고 `.claude/rules/` 를 빠뜨렸다. [.claude/rules/backend.md:57]
- [x] [Review][Patch] **[Low] `EXPERIENCE.md:33` 이 아직 직원 홈에 walk-in 바로가기를 둠** (auditor) — 같은 파일 `:39` 는 이 diff 가 "전용 화면 없음 · 예약 관리 → 대리 예약"으로 고쳤는데 `:33` 은 그대로다(그 바로가기는 코드에도 없다). [_bmad-output/planning-artifacts/ux-designs/ux-hospital-care-2026-07-13/EXPERIENCE.md:33]
- [x] [Review][Patch] **[Low] `EXPERIENCE.md:54` 마이크로카피 표가 옛 거부 문구를 정본으로 유지** (auditor) — `:54` 는 "지금 이 진료과엔 빈 의사가 없어요…"를, `:83` 은 실제 배포된 "이 시간엔 모든 의사의 예약이 차 있어요…"를 정본이라 한다. 한 문서 안에 같은 거부의 정본이 둘이고, 백엔드에 존재하는 건 후자뿐. [_bmad-output/planning-artifacts/ux-designs/ux-hospital-care-2026-07-13/EXPERIENCE.md:54]
- [x] [Review][Patch] **[Low] `DESIGN.md` 미정리 + correct-course §4 sweep 표에 누락** (auditor) — `:25`·`:73` 이 destructive red 를 "슬롯 충돌 · walk-in 빈 의사 없음"으로 서술한다. 색 의미론 자체는 살아남아(거부는 여전히 red 인라인) 모순은 아니고 문구 드리프트지만, CLAUDE.md 가 정본 UX 문서로 지목한 파일이 sweep 표에서 빠진 것은 §4 완결성 결함. [_bmad-output/planning-artifacts/ux-designs/ux-hospital-care-2026-07-13/DESIGN.md:25]
- [x] [Review][Patch] **[Low] `epics.md:37` FR-16 이 전달된 흐름을 과장** (auditor) — "직원이 진료과만 고르면 … 가장 빠른 빈 시간으로 예약이 잡힌다"고 썼지만 코드는 **명시적 자동 배정 선택 + 명시적 버튼 클릭**을 요구한다(AC1 과 `handleSubmit` 이 미선택을 의도적으로 인라인 에러로 막는다). 제안서의 트레이드오프 표("접수 4단계")와 EXPERIENCE Flow 3 은 정확한데 이 한 줄만 느슨하다. 겸해서 AC5③ 관련 정직 보강: 슬롯 라벨 행 레이아웃(`items-baseline` → `flex-wrap items-center` + 중첩 div)이 직접 선택 경로에서도 바뀌었다 — 동작·문구는 무변경이라 AC5③ 자체는 성립하나 스토리가 이 시각 변화를 공개하지 않았다. [_bmad-output/planning-artifacts/epics.md:37]

**[Defer] — 3건**

- [x] [Review][Defer] **`selectedIsoRef` 미러 지연 — `setSelectedIso` 의 모든 writer 에 해당** [frontend/components/proxy-booking-dialog.tsx:389] — deferred, pre-existing. (codex) 새 핸들러가 ref 를 직접 안 쓰므로, 가용성 응답이 렌더 커밋↔패시브 effect 사이에 도착하면 `:266` 의 `cur` 가 stale 이다. **기존 슬롯 클릭 경로(`:817`)도 완전히 동일**해 한쪽만 고치면 비대칭이 된다. 근본 해결은 두 writer 를 작은 헬퍼로 모으는 것인데 그건 동결된 SlotPicker 핸들러를 건드린다. 창이 극히 좁고 409 가 자기교정한다.
- [x] [Review][Defer] **400(과거 슬롯)은 인라인 경로가 없어 toast 로만 흐르고 선택도 안 지워진다** [frontend/components/proxy-booking-dialog.tsx:452] — deferred, pre-existing. 409 전용 분기는 5.1·6.3 이 세운 것이고 5.3 이 만들지 않았다. 처리 시 400 도 `slotErr` + 선택 해제로 흡수.
- [x] [Review][Defer] **`doctorLoadError` 가 `aria-describedby` 체인에 id 없이 존재** [frontend/components/proxy-booking-dialog.tsx:722] — deferred, pre-existing. 5.3 이전 체인도 `doctorErr`/`doctorsEmpty` 뿐이라 로드 실패는 원래 연결된 적이 없다. 나타날 때 한 번 announced 되고, 트리거를 다시 포커스하면 사유가 안 읽힌다.

**[Dismiss] — 2건**

- **walk-in 이 "지금 서 있는 슬롯"을 못 잡고 다음 빈 슬롯으로 밀린다** (blind — "확인이 필요한 결정") — 결함이 아니라 **명시적으로 채택된 경계**다. correct-course 제안서 §2 트레이드오프 표·epics Story 5.3 경계·스토리 AC 경계 3곳에 기록됐고 사용자가 3개 안 중 이 안을 선택했다. 5.1 과거 가드에서 상속된 게 아니라 그 가드를 유지하기로 한 의식적 선택.
- **버튼이 만료 직전 슬롯(14:29:58 → 14:30)을 돌려줄 수 있다** (blind) — 제출 직전 재검증(`:416`)이 설계된 방어층이고 두 번째 클릭에서 자기교정한다. 여유 마진(예: 2분 버퍼)을 넣는 건 제품 정책 발명이라 리뷰가 결정할 사안이 아니다.

## Dev Notes

### 🎯 이 스토리의 한 줄 요약

**서버는 이미 다 돼 있다 — 직원 화면에 스위치 2개를 다는 것이 전부다.** 자동 배정은 `patient/book` 의 배선을 그대로 옮기는 이식 작업이고, 진짜 새 코드는 "가장 빠른 시간" 핸들러 하나뿐이다. 백엔드를 여는 순간 이 스토리는 스코프를 벗어난 것이다.

### 왜 walk-in 전용 경로를 만들지 않는가 (읽고 시작할 것)

`sprint-change-proposal-2026-07-28.md` 가 정본. 요지:

- 5.2가 **자동 배정 + 전원 점유 409 거부**를, 6.3이 **직원 대리 예약**을 이미 만들어서, FR-16의 업무(예약 없이 온 환자를 지금 진료 넣기)가 기존 경로로 커버된다.
- 전용 경로는 **세 번째 예약/기록 표면**(신규 엔드포인트·스키마·SQL문·페이지·내비 항목)이 되어 영구 유지 비용이 된다.
- 유일한 실질 차이는 **"지금 진행 중인 슬롯"** 이고, 그건 5.1 과거 가드가 막는 정상 동작이다. 다음 빈 슬롯(최대 30분 차)은 데모에서 수용 가능한 한계로 명시 채택됐다.

**따라서 이 스토리에서 절대 하지 말 것:** `POST /medical-records/walk-in` 신설 · `WalkInRecordCreate` 스키마 · `_INSERT_WALKIN_RECORD` SQL · `/staff/walk-in` 페이지 · `staff-sidebar.tsx` 항목 추가 · 5.1 과거 시각 가드 우회.

### 구현 결정 3건 (대안 비교 완료)

1. **`AUTO_DOCTOR = "auto"` 는 이 파일에 로컬 상수로 둔다 — 공유 모듈로 빼지 않는다.** patient/book:37 과 문자열이 같아지지만 **드리프트해도 아무것도 깨지지 않는다**(각 화면이 자기 상수를 자기 상태와만 비교한다 — 공유 동작이 아니다). 5.4가 수렴한 것은 *로직* 사본(booking-slots·format·ErrorState·fetch-or-404)이었고, 1줄 무해 상수를 위해 `lib/booking-slots.ts`(순수 시각 계산 모듈)에 의사 Select 센티넬을 넣거나 done 스토리 파일을 건드리는 것은 비용이 이득보다 크다. 의도적 사본으로 기록한다.
2. **교집합 계산은 `patient/book` 에서 이식(사본), 공유 헬퍼로 추출하지 않는다.** 추출안(`lib/availability-slots.ts` 에 `[start,end)` 범위 계산 + 단일/교집합 조회를 모아 두 화면이 import)이 구조적으로는 더 낫고 기존 `startIso/endIso` 사본까지 함께 없앨 수 있지만, **사용자가 승인한 이 스토리의 범위는 "프런트 1파일·신규 파일 0"** 이다. 추출은 done 스토리(`patient/book`)를 리팩토링하고 신규 모듈을 추가하는 별개 작업이라 스코프를 넘는다. 사전 트리아지로 deferred 에 올려 다음 정리 스토리가 3사본을 한 번에 수렴하게 한다.
3. **"가장 빠른 시간"은 명시 버튼, 자동 선택 아님.** 첫 가용성 응답에 자동으로 슬롯을 고르면 **전화 예약(기존 주 용도) 흐름에서도** 원치 않는 슬롯이 미리 선택돼 오선택 위험이 생긴다. 버튼은 walk-in 의도를 가진 클릭에만 반응하고 기존 흐름의 동작을 1바이트도 바꾸지 않는다(회귀 0). 라벨·배치는 :3000 실측 확정.

### 배선 청사진 — 정본 참조 구현 대응표

`app/patient/book/page.tsx`(5.2, done)가 자동 배정의 정본이다. 아래 4곳을 **읽고 이식**한다:

| 관심사 | 정본(patient/book) | 이식 대상(proxy-booking-dialog) | 주의 |
|---|---|---|---|
| 센티넬 상수 | `:37` | 파일 상단 | 값 동일(`"auto"`) |
| items + SelectItem + 캡션 | `:180-187`, `:405-419` | `:256-259`, `:633-639`, `aria-describedby` `:614-619` | 다이얼로그엔 `doctorsEmpty`·`doctorLoadError` 분기가 더 있다 — **덮어쓰지 말고 끼워 넣을 것** |
| 교집합 가용성 effect | `:130-174` | `:220-249` | `open` 가드 유지 · `selectedYmd` → `effectiveYmd` · deps 에 `doctors` 추가 |
| 제출 `doctor_id` | `:237` | `:376` | 나머지 payload 무변경 |
| `doctorLabel` 파생 | `:287-288` | `:408` | 요약 문구의 "선생님"을 라벨 안으로 옮길 것 |

**신규 코드는 `selectEarliestFreeSlot()` + 버튼 하나뿐.**

### 건드리지 않는 것 (동결 유지)

- **`backend/` 전부** — diff 0 이 AC5 ①이다.
- `lib/api.ts`(`AppointmentCreate.doctor_id` 는 5.2가 이미 `number | null`), `components/slot-picker.tsx`(takenMs 계약 동결), `lib/booking-slots.ts`, `lib/format.ts`, `components/error-state.tsx`, `app/patient/book/page.tsx`, `app/staff/appointments/page.tsx`(부모 — `key` remount·`onCreated` prepend 계약 그대로), `components/staff-sidebar.tsx`, `next.config.ts`, 나머지 화면 전부.
- 다이얼로그 안에서도 동결: 환자 검색 블록(:426-519)·`resetForm`(:272-293)·`handleOpenChange`(:295-301)·`handleDeptChange`(:308-322)·`handleDateChange`(:324-331)·409 catch(:386-394)·`revealField`(:56-61)·제출 전 인라인 검증과 과거 시각 재검증(:334-367).
- **수정 frontend 1**: `frontend/components/proxy-booking-dialog.tsx`. 그 외 0.

### 컴포넌트 수명(mount lifetime) — 설계 결정 (Epic 6 회고 액션 #2)

**무변경이 결정이다.** 이 다이얼로그는 부모가 열 때마다 `key`(`bookingSession`)를 바꿔 **새로 마운트**한다(6.3 확립, `staff/appointments/page.tsx:105-107·243-247`). 따라서 `dayOptions`·`defaultYmd`·`slots`(지난 슬롯 필터)가 **여는 시점** 기준으로 신선하고, 교집합 조회도 열림 후 (의사, 날짜) 선택 시 발생한다. 폴링은 두지 않는다(5.1 deferred "의도" 항목 계승).

**남는 신선도 구멍 하나:** 다이얼로그를 **열어둔 채** 시간이 흐르면 `slots` 메모가 낡는다. 그래서 AC3이 [가장 빠른 시간] **핸들러 안에서** 현재 시각을 다시 읽게 하고, 제출 직전 재검증(:356-362)과 서버 400이 최종 방어다. 이 세 겹이 실측 시나리오 ①의 대상이다.

### 핵심 안티패턴 (하지 말 것)

- **백엔드를 열지 말 것** — 자동 배정·전원 점유 409·빈 과 400 전부 5.2가 구현·배포·라이브 확인 완료다. 서버에서 재현되지 않는 문제가 보이면 그건 프런트 배선 문제다.
- **walk-in 전용 경로를 만들지 말 것** — 위 correct-course 절. `medical_record` 를 만드는 새 코드는 이 스토리에 없다.
- **5.1 과거 시각 가드를 우회하지 말 것** — "지금 슬롯을 잡고 싶다"는 유혹이 이 스토리의 가장 큰 함정이다. 다음 빈 슬롯이 명시 채택된 동작이다.
- **`GET /availability` 에 진료과 파라미터를 추가하지 말 것** — 키셋 고정 계약(5.1 계약 테스트). 교집합은 클라이언트 몫이다(5.2 구현 결정 2 계승).
- **성공 경로에 낙관 taken 마킹을 넣지 말 것** — 이 다이얼로그는 성공 시 닫히므로 마킹할 대상이 없다(5.2가 `patient/book` 에서 자동 모드 마킹을 **제거**한 이유와 동류).
- **`slots` 메모만 믿고 [가장 빠른 시간]을 구현하지 말 것** — 마운트 시각 기준이라 지난 슬롯을 고를 수 있다(AC3 ①).
- **자동 선택(auto-pick on load)으로 바꾸지 말 것** — 구현 결정 3. 기존 전화 예약 흐름에 오선택을 심는다.
- **빈 선택을 자동 배정으로 해석하지 말 것** — 미선택 제출은 기존 인라인 에러 유지(5.2 구현 결정 3).
- **`patient/book` 을 리팩토링하지 말 것** — 이식은 복사 방향이 한쪽이다(정본 → 다이얼로그). 공유 추출은 구현 결정 2로 deferred.

### 알려진 사본 (사전 트리아지 — `deferred-work.md` 에 기록할 것)

리뷰에서 반드시 지적될 항목이라 미리 판정해 둔다. 새로 발견한 결함이 아니라 **승인된 스코프의 계산된 비용**이다.

1. **`AUTO_DOCTOR` 상수 2사본** — 무해(공유 동작 없음, 드리프트해도 각자 정상). 구현 결정 1.
2. **가용성 조회 로직 3사본** — `[start, end)` 범위 계산은 `patient/book` ↔ 다이얼로그에 **이미 2사본**(5.1이 남김)이고 이 스토리가 교집합 분기까지 얹어 사본 폭이 넓어진다. 추출안(`lib/availability-slots.ts`)은 done 스토리 리팩토링 + 신규 파일이라 승인 범위 밖 — 다음 정리 스토리가 한 번에 수렴. 구현 결정 2.

### 테스트 전략

- **백엔드 테스트는 추가하지 않는다** — 서버 diff 0. 기존 테스트가 무수정 green 인 것 자체가 "계약을 안 건드렸다"는 증명이다(깨지면 스코프를 벗어났다는 신호).
- **프런트는 테스트 스크립트가 없다** — `npm run lint`(타입체크 안 함) + `npm run build`(타입 오류는 여기서만) + **브라우저 실측**이 검증층이다. 교집합·[가장 빠른 시간]은 실측 시나리오가 직접 증명한다(한 의사만 점유 = 접수 가능 / 전원 점유 = 예약됨 / 버튼이 taken 셀을 건너뜀).
- **curl 은 "백엔드 무변경"의 실 보증**이다 — 계약 테스트는 db 계층을 monkeypatch 하므로 실 SQL 회귀를 못 잡는다(`.claude/rules/workflow.md`).

### 검증 데이터 원복 규율

- curl ①–④ 와 브라우저 실측이 **예약을 여러 건** 만든다(`medical_record` 는 만들지 않는다 — 이 스토리 범위). 전 id 를 기록해 **예약만** id 지정 삭제(`docs/환경셋업.md` §5 — uv+psycopg 또는 Supabase MCP). 시드 재실행 금지(TRUNCATE CASCADE — 최우선 금기). 라이브 실측 데이터도 동일 규율.
- 확정/기록까지 진행한 검증 예약이 있으면 **기록 → 예약 순**으로 삭제한다(FK).

### Project Structure Notes

- 신규 파일 0 — 변경은 `frontend/components/proxy-booking-dialog.tsx` 한 곳. 아키텍처 Capability Map 상 "예약 생성·가용성"의 **표현 계층 배선**일 뿐이고 서버 표면은 그대로다(AD-1·AD-10 무영향).
- 웹 리서치 불필요 — 신규 라이브러리·API 0. `Promise.all` 은 표준, base-ui Select 항목 추가는 이 파일의 기존 items 패턴 그대로(Next.js 16 신규 API 사용 없음).
- 브랜치 `story/5-3-proxy-booking-walk-in` · 커밋 접두 `Story 5.3:`.

### 이전 스토리 인텔리전스

- **5.2가 남긴 것(직접 소비)**: 서버 자동 배정(`doctor_id: null` → 빈 의사 pick, 전원 점유 409 `"이 시간엔 모든 의사의 예약이 차 있어요. 다른 시간을 골라 주세요."`, 빈 과 400) · `AppointmentCreate.doctor_id: number | null` · `patient/book` 의 배선 정본 · **자동 모드 낙관 마킹 금지**(코드리뷰 Med — 교집합 의미론).
- **5.2가 의도적으로 남겨둔 것**: "대리 예약 다이얼로그는 UI 무변경"(FR-18이 P0 폼 재사용 명시). **이 스토리가 바로 그 유보를 푸는 스토리다** — 5.2 안티패턴 목록의 "proxy 에 자동 배정을 이식하지 말 것 … 필요해지면 UI만 얹는 별도 스토리"가 예고한 그 스토리.
- **5.1이 남긴 것**: `GET /availability` 키셋 고정 계약 · 슬롯 피커 taken 3상태 · 409 인라인+재조회 인프라(이 다이얼로그에 이미 배선됨) · 과거 시각 가드(400).
- **6.3이 남긴 것**: 이 다이얼로그 자체 · `key` remount 규율 · base-ui 동일값 재발화 가드(High 2건의 교훈) · `revealField` 스크롤·포커스.
- **기준선(실측)**: main `7a07d32` · 워킹트리 클린 · 백엔드 pytest·ruff green · lint/build 그린 · 라이브 정상(5.2 라이브 실측 완료).
- **실측 인프라**: Chrome 확장이 localhost 를 막으면 LAN IP 경로(5.1·5.2 확립 — `next.config` `allowedDevOrigins` 기설정 + 백엔드 `--host 0.0.0.0` + CORS·`NEXT_PUBLIC_API_BASE_URL` 프로세스 env 오버라이드, 파일 무변경). 모바일은 Playwright 390×844 표준.

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-28.md] — **스코프 재정의 정본**(FR-16 축소 사유·트레이드오프·명시적 미이행 목록)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3] — 재정의된 AC 4개 · #Epic 5 개요·correct-course 주석 · #FR-16(축소) · #횡단 규약(오류 문구 톤)
- [Source: _bmad-output/implementation-artifacts/5-2-의사-자동-배정.md] — 자동 배정 서버 계약·구현 결정 2(교집합)·3(빈 선택≠자동)·코드리뷰 Med(낙관 마킹)·"proxy 는 별도 스토리" 예고
- [Source: _bmad-output/implementation-artifacts/5-1-가용성-충돌-검사.md] — 과거 시각 가드(AC7)·409 인라인 규율·리뷰 P3(스냅샷 보존)·mount lifetime 표
- [Source: _bmad-output/implementation-artifacts/6-3-직원-대리-예약.md] — 이 다이얼로그의 설계 근거(remount·동일값 발화·인라인 검증 순서)
- [Source: frontend/app/patient/book/page.tsx] — **정본 참조 구현**: `AUTO_DOCTOR`(:37) · 교집합 effect(:130-174) · doctorItems(:180-187) · 제출(:237) · doctorLabel(:287-288) · Select+캡션(:365-425)
- [Source: frontend/components/proxy-booking-dialog.tsx] — 이식 대상 전부: 가용성 effect(:220-249) · doctorItems(:256-259) · 제출(:373-378) · toast(:381) · 파생값(:407-409) · 의사 Select(:591-669) · 슬롯 라벨 행(:695-704) · 요약(:741-746)
- [Source: backend/app/services/appointments.py#_create_appointment_auto] — 자동 배정 서버 분기(무수정 확인용): 빈 과 400 → 전원 점유 409 → FK 400
- [Source: frontend/lib/api.ts#createAppointment (:239-246)] — `doctor_id: null` 계약(무수정)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-hospital-care-2026-07-13/EXPERIENCE.md] — UX-DR3(슬롯 피커 taken)·UX-DR7(도메인 거부 red 인라인·비관적 저장)·UX-DR10(직원 톤 = 간결)
- [Source: _bmad-output/implementation-artifacts/epic-6-retro-2026-07-26.md] — 액션 #1(시간 경과·같은 값 재선택 실측 필수)·#2(mount lifetime 명시)·#3(폼 스토리 리뷰 예산 상향)
- [Source: docs/환경셋업.md#5] — psql 없는 DB 접속·검증 데이터 원복
- [Source: .claude/rules/workflow.md] — done 정의(커밋+배포+라이브)·add-only 규율·"lint/build 로 검증을 끝내지 말 것"

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Code, dev-story)

### Debug Log References

- **백엔드**: 코드 diff **0** — 자동 배정·전원 점유 409·빈 과 400 전부 5.2가 이미 배포한 것을 소비만 했다. pytest **126 passed**·ruff 0건(무수정 확인용 실행).
- **프런트**: `npm run lint` 클린 · `npm run build` 그린(15 라우트, `/staff/appointments` Static 유지). 동결 5파일 diff 0 확인.
- **curl 실증(실 Supabase)**: 자동 201(최소 id pick) → 같은 슬롯 자동 201(회피 pick) → 409 정확 문구 → 지정 경로 201 회귀 → 과거+자동 400 → availability 계약 불변. 6/6.
- **브라우저 실측(Playwright)**: Chrome 확장이 미연결(`tabs_context_mcp` 실패)이라 5.2 선례대로 Playwright 로 대체. 설치된 playwright(1.58)와 캐시된 브라우저(chromium-1208) 버전이 어긋나 `executablePath` 로 캐시 실행파일을 직접 지정해 우회(재다운로드 없이). 스크립트 2본은 스크래치패드(`verify.mjs`·`verify2.mjs`).
  - 초기 실패 1건은 앱이 아니라 스크립트 결함이었다 — taken 셀의 텍스트가 `"10:00예약됨"` 이라 `textContent` 를 그대로 키로 쓴 덤프가 `undefined` 를 냈다(앞 5글자만 키로 쓰도록 수정). 앱 동작은 처음부터 정상.
  - **시간 경과 검증에 `page.clock.install()` + `fastForward("02:00:00")` 사용** — 다이얼로그를 연 채 2시간을 넘겨도 [가장 빠른 시간]이 마운트 시각 첫 슬롯(15:30)이 아니라 17:30 을 골랐다. 이 스토리의 유일한 신규 로직에 대한 직접 증명.
- **콘솔**: 앱 에러 **0**. 409 시나리오에서 브라우저 네트워크 로그 1줄(`Failed to load resource: 409 (Conflict)`)이 남는데, 이는 의도된 도메인 거부 응답이 남기는 기록이지 앱 오류가 아니다(5.1·5.2 동일 성격 — 정직 기록).
- **검증 데이터 원복**: 예약 72–79 삭제, 잔여 `[22, 40, 41, 68, 69]`. `medical_record` 총 2행 불변.

### Completion Notes List

- **구현 완료(Task 0–5)**: `frontend/components/proxy-booking-dialog.tsx` **1파일**에 ① `AUTO_DOCTOR` 센티넬 + 의사 Select 첫 항목 "자동 배정" + 안내 캡션(`aria-describedby` 체인) + 제출 `doctor_id: null` ② 가용성 effect 자동 분기(과 의사 전원 `Promise.all` → 교집합, deps 에 `doctors` 추가) ③ `selectEarliestFreeSlot()` + [가장 빠른 시간] 버튼 ④ `doctorLabel` 파생(요약 블록)·자동 모드 성공 toast 분기.
- **AC 충족**: AC1(첫 항목·캡션·aria·`doctor_id: null`·빈 선택≠자동 — 브라우저+curl) · AC2(교집합 렌더 증명·부분 실패 스냅샷 보존·직접 경로 무변경) · AC3([가장 빠른 시간] 09:00 pick·시계 전진 시 17:30·문구 2종) · AC4(409 인라인 흡수 — **코드 분기 추가 0**·요약 "자동 배정"·자동 모드 toast 에 배정 의사) · AC5(**백엔드 diff 0**·동결 5파일 diff 0·직접 선택 흐름 무변경·신규 상태 변수 0) · AC6(pytest 126·ruff 0·lint/build·curl 6종·브라우저 4시나리오+모바일·원복).
- **경계 유지(정직)**: 접수는 **다음 빈 슬롯**으로 잡힌다(5.1 과거 가드 유지 — curl ⑤ 로 실증). 예약 없이 온 환자도 예약 행으로 남는다. `medical_record.appointment_id` nullable·부분 유니크·5.1 충돌 합집합의 walk-in arm 전부 무수정 보존. TOCTOU 범위 밖.
- **낙관 마킹 미도입 확인**: 5.2가 `patient/book` 에서 제거한 "자동 모드 성공 낙관 taken 마킹"은 이 다이얼로그에 원래 없다(성공 시 `resetForm()`+닫기) — 새로 넣지 않았다.
- **사전 트리아지 2건**을 `deferred-work.md` 에 기록(가용성 조회 3사본·`AUTO_DOCTOR` 2사본) — 승인 범위("프런트 1파일·신규 파일 0")를 지킨 계산된 비용이지 놓친 결함이 아니다.
- **코드리뷰 반영(2026-07-28)**: 4층(Codex 1 + Blind 10 + Edge 8 + Auditor 7) → 유니크 18건 → **Patch 13 · Defer 3 · Dismiss 2** 전부 처리. 코드 8건은 전부 새 버튼이 만든 조합(만석 오류가 의사 전환 후 잔존 · 버튼이 의사 선택 전 동작해 거짓 사유 표시 · 제출 중 클릭이 stale 클로저에 삼켜짐 · 막다른 길에서 선택 미해제 · 로드 실패 시 자동 배정만 남아 무지 상태 권유 · 문구 2중 렌더 · 성공 SR 무음 · catch 주석 부정확). 문서 5건은 correct-course sweep 잔재이며 그중 `.claude/rules/backend.md` 는 **자동 로드되는 살아있는 규칙**이라 최우선. **재검증**: pytest 126·ruff 0·lint/build 그린·백엔드 diff 0 유지 + 브라우저 재실측(버튼 게이트 3단계·교집합 회귀·요약 role=status·409 후 의사 변경 시 slotErr 해제·막다른 길 문구 1회+선택 해제) 전부 통과, 검증 예약 80–115 원복(잔여 `[22, 40, 41, 68, 69]`).
- Status → review (**릴리스 게이트 미완** — `done` 은 커밋+배포+라이브 확인 3가지 전부, workflow.md).

### File List

**frontend(수정 1):**
- `frontend/components/proxy-booking-dialog.tsx` — `AUTO_DOCTOR` 센티넬·의사 Select 자동 배정 항목/캡션/aria·교집합 가용성 effect·`selectEarliestFreeSlot()`+[가장 빠른 시간] 버튼·`doctorLabel` 요약·자동 모드 성공 toast
  - ⚠️ **공개(정직, 코드리뷰 지적)**: 슬롯 라벨 행의 레이아웃이 직접 선택 경로에서도 바뀌었다 — 버튼을 넣느라 `flex items-baseline justify-between gap-2` → `flex flex-wrap items-center justify-between gap-x-2 gap-y-1` + `dayLabel` 을 감싸는 중첩 flex. **동작·문구는 무변경**이라 AC5③("동작·문구 무변경")은 문자 그대로 성립하나, 기존 전화 예약 흐름의 시각이 미세하게 달라진 것을 스토리가 처음에 공개하지 않았다. 390×844 실측에서 가로 오버플로 0 확인.

**추적·기획(코드리뷰 반영):**
- `.claude/rules/backend.md` — SQL 조각 빌더 절의 철회된 walk-in 예고 제거(**자동 로드되는 살아있는 규칙**)
- `_bmad-output/planning-artifacts/`: `epics.md`(FR-16 문구 정확화) · `EXPERIENCE.md`(직원 홈 행·거부 문구 정본) · `DESIGN.md`(red 사용처) · `sprint-change-proposal-2026-07-28.md`(§4 sweep 표에 누락 3파일 추가)

**backend: 변경 없음(AC5 ① — `git diff --stat backend/` 비어 있음).**

**추적·기획(스코프 재정의 동반 — create-story 단계 산출물):**
- `_bmad-output/implementation-artifacts/5-3-대리예약-walk-in-흡수.md` (신규) · `sprint-status.yaml` · `deferred-work.md`(5-3 절 신설 2건)
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-28.md` (신규 — FR-16 범위 축소 correct-course)
- `_bmad-output/planning-artifacts/epics.md` · `prds/prd-hospital-care-2026-07-12/prd.md` · `architecture/…/ARCHITECTURE-SPINE.md` · `ux-designs/…/EXPERIENCE.md` (FR-16 축소 반영·역방향 참조 정리)

## Change Log

| 날짜 | 작성 | 내용 |
|------|------|------|
| 2026-07-28 | create-story | 스토리 파일 생성(backlog → ready-for-dev). **스코프 재정의** — 사용자 제기("환자등록·대리예약이 있는데 워크인을 따로 처리해야 하는지 의문")로 walk-in 전용 경로를 철회하고 대리 예약이 흡수하는 안을 승인·채택(`sprint-change-proposal-2026-07-28.md`, epics.md FR-16·Epic 5·Story 5.3 반영). 결과: 백엔드 diff 0 · 신규 파일 0 · 프런트 1파일. 구현 결정 3건: ① `AUTO_DOCTOR` 로컬 상수(무해 사본) ② 교집합은 `patient/book` 에서 이식(공유 추출은 승인 범위 밖 — deferred 사전 트리아지) ③ "가장 빠른 시간"은 명시 버튼(자동 선택은 기존 전화 예약 흐름 오선택 위험). 회고 액션 #1(시간 경과·같은 값 재선택 + 재열림 신선도 4종 실측)·#2(mount lifetime 무변경 결정)·#3(리뷰 예산 상향·High 후보 지목) 반영. |
| 2026-07-28 | dev | 구현 완료(Task 1–5) → review. 백엔드 diff **0바이트** · 프런트 **1파일**(`proxy-booking-dialog.tsx`). pytest **126** · ruff 0 · lint/build 그린 · curl 실증 6종 · 브라우저 실측(1280×900 + 390×844, 회고 액션 시나리오 4종 포함). 검증 예약 72–79 원복. |
| 2026-07-28 | code-review | 4층 병렬 리뷰(Codex · Blind Hunter · Edge Case Hunter · Acceptance Auditor) → **Patch 13 · Defer 3 · Dismiss 2**. Patch 13 = 새 버튼이 만든 조합 8건(`slotErr` 잔존 · 의사 미선택 클릭 · mid-flight 클릭 · 막다른 길 stale 선택 · 의사 로드 실패 시 자동 배정 단독 노출 · 문구 이중 렌더 · 성공 분기 SR 무음 · catch 주석) + correct-course 문서 잔재 5건(`.claude/rules/backend.md` · `EXPERIENCE.md` ×2 · `DESIGN.md` · `epics.md` FR-16). Defer 3건 `deferred-work.md` 기록. |
| 2026-07-28 | dev | **릴리스 게이트 마감 → done.** PR #27 머지(`34d2a4a`) → Vercel·Railway 배포 → **라이브 실측**: Railway `/health` 200 · Vercel 신규 번들에 "자동 배정" 첫 항목·[가장 빠른 시간]·교집합 taken(10:00 예약됨 / 10:30 예약 가능) 전부 확인 · 자동 배정 409 문구 실증 · 콘솔 0 · 390×844 오버플로 0. 검증 예약 116·117 원복(잔여 `[22,40,41,68,69]` 불변). **Epic 5 종료** — 5.1·5.2·5.3·5.4 전부 done. |
