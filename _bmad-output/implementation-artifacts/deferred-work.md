# Deferred Work

> 2026-07-27 Story 5.4(중복 사본 정리)가 사본 수렴류 10건을 처리·삭제했다 — booking-slots 2-소스 ·
> orDash 4사본 · 짝 없는 slot-label · formatReservedAt 2-소스 · ErrorState 로컬 6사본(승격 임계 항목) ·
> fetch-or-404 4사본 · CAS 409 문구 3사본 · naive→UTC 인라인 3곳 · \_blank_str_to_none 2사본 ·
> 의사↔진료과 검증 블록 2-소스. 내역은 스토리 파일(5-4-중복-사본-정리.md)과 해당 커밋이 정본.

## Deferred from: code review of 5-3-대리예약-walk-in-흡수 (2026-07-28)

- **`selectedIsoRef` 미러 지연 — `setSelectedIso` 의 모든 writer 에 해당** — ref 는 패시브 effect(`:118-120`)로 한 박자 늦게 따라오는데, 가용성 응답이 렌더 커밋↔effect 플러시 사이에 도착하면 `:266` 의 `cur` 가 stale 이라 "고른 시간이 그새 예약됐어요" 해제가 안 걸린다. 5.3 의 `selectEarliestFreeSlot`(`:389`)만의 문제가 아니라 **기존 슬롯 클릭 경로(`:817`)도 완전히 동일**해, 한쪽만 고치면 비대칭이 된다. 근본 해결은 두 writer 를 `selectSlot(iso)` 같은 헬퍼로 모아 state 와 ref 를 함께 쓰는 것인데 그건 동결된 SlotPicker onChange 를 건드린다. 창이 극히 좁고(마이크로태스크 경합) 서버 409 가 자기교정한다. [frontend/components/proxy-booking-dialog.tsx:389 ↔ :817]
- **400(과거 슬롯) 응답에 인라인 경로가 없다** — 제출 catch 가 `409` 로만 분기해 나머지(과거 슬롯 400 포함)는 toast 로 흐르고 `slotErr`·선택 해제·`revealField` 가 없다. 같은 슬롯이 선택된 채 남아 다시 누르면 동일한 400 이 반복된다. 409 전용 분기는 5.1·6.3 이 세운 것이고 5.3 이 만들지 않았다. 처리 시 400 도 409 와 같은 인라인 경로로 흡수. [frontend/components/proxy-booking-dialog.tsx:452]
- **`doctorLoadError` 가 `aria-describedby` 체인에 연결되지 않는다** — 의사 목록 로드 실패 문단(`:722-726`)에 id 가 없어 체인이 `undefined` 로 떨어진다. 나타날 때 `role="alert"` 로 한 번 읽히지만, 여전히 활성인 트리거를 다시 포커스하면 "왜 자동 배정만 있는지" 사유가 안 읽힌다. 5.3 이전 체인도 `doctorErr`/`doctorsEmpty` 뿐이라 로드 실패는 원래 연결된 적이 없다(회귀 아님). [frontend/components/proxy-booking-dialog.tsx:722]

## Deferred from: 5-3-대리예약-walk-in-흡수 구현 (2026-07-28)

> 아래 2건은 리뷰가 발견할 항목을 **스토리 작성 시점에 미리 판정한** 것이다(계산된 비용이지 놓친 결함이 아니다).

- **가용성 조회 로직 3사본** — `[start, end)` 범위 계산(`daySlots[0].iso` ~ `+1_800_000`)은 `patient/book` ↔ `proxy-booking-dialog` 에 **5.1 때부터 이미 2사본**이었고, 5.3이 자동 배정 교집합 분기(`toMsSet` + `Promise.all` + 교집합)까지 두 곳에 나란히 두면서 사본 폭이 넓어졌다. 추출안은 `lib/availability-slots.ts` 신설(범위 계산 + 단일/교집합 조회를 한 모듈로) + 두 화면 import — **기존 2사본까지 함께 없앨 수 있어 순 LOC 는 오히려 줄지만**, done 스토리(`patient/book`) 리팩토링 + 신규 파일이라 5.3의 승인 범위("프런트 1파일·신규 파일 0")를 넘는다. 다음 정리 스토리가 3사본을 한 번에 수렴. [frontend/app/patient/book/page.tsx (가용성 effect) ↔ frontend/components/proxy-booking-dialog.tsx (가용성 effect)]
- **`AUTO_DOCTOR` 상수 2사본** — `"auto"` 센티넬이 두 화면에 각각 있다. **무해한 사본**이다: 각 화면이 자기 상수를 자기 `doctorId` 상태와만 비교하므로 공유 동작이 없고, 값이 드리프트해도 어느 쪽도 깨지지 않는다(5.4가 수렴한 것은 *로직* 사본). 1줄 상수를 위해 순수 시각 모듈(`lib/booking-slots.ts`)에 의사 Select 센티넬을 넣거나 done 스토리를 건드리는 비용이 이득보다 크다고 판단. 위 항목(가용성 추출)을 처리할 때 자연히 함께 수렴된다. [frontend/app/patient/book/page.tsx:37 ↔ frontend/components/proxy-booking-dialog.tsx]

## Deferred from: code review of 5-2-의사-자동-배정 (2026-07-27)

- **환자 단위 중복 예약 가드 부재** — 같은 환자가 같은 시각에 복수 의사에게 예약을 만들 수 있다(appointment 에 환자·시각 유니크 없음, 서비스 검사도 (의사, 슬롯) 점유뿐). 직접 선택 모드에서도 의사만 바꿔 고르면 원래 가능했던 앱 전반 기존 부재 — 5.2 자동 모드는 성공 직후 그 셀이 (교집합 의미론상 참으로) 다시 열리므로 우발 도달성을 높였을 뿐이다. 처리 시 서비스에 환자 단위 충돌 검사(400 한국어) 또는 제출 전 안내. 데모 하드닝류. [backend/app/services/appointments.py, frontend/app/patient/book/page.tsx]

## Deferred from: 5-2-의사-자동-배정 구현 (2026-07-27)

- **자동 배정 taken 사전 표시의 N-호출 교집합** — book 화면 자동 모드는 기존 `GET /availability`를 진료과 의사 수만큼 병렬 호출해 클라이언트에서 교집합(전원 점유 슬롯)을 계산한다(신규 엔드포인트 0 — 5.1 응답 키셋 고정 계약 보존이 이유). 과당 의사 수가 소수(시드 2명)라는 전제의 의도적 설계 — 의사 수가 커지면 진료과 단위 가용성 API(`hospital_department_id` 파라미터 또는 별도 리소스)로 승격. 표시 전용이라 정합성 위험은 없다(서버 409가 진실). [frontend/app/patient/book/page.tsx (가용성 effect)]
- **표시 조인 SQL 6번째 사본** — `_INSERT_APPOINTMENT_AUTO`가 projection 사본을 5→6개로 늘렸다(2-3 절 기존 항목의 연장 — 의도적 컨벤션 유지, 공유 fragment 추출은 일괄 정리 몫). [backend/app/db/appointments.py]

## Deferred from: 5-4-중복-사본-정리 구현 (2026-07-27)

- **`genderText`·`GENDER_LABEL` 3사본** — 성별 역매핑(M/F/null → 남/여/—)이 patient/select · staff/patients · staff/patients/[id] 에 동일 구현으로 존재. 5.4 스토리 대상 목록(회고 액션 #5 + deferred 라우팅 건) 밖이라 스코프 규율상 보류 — orDash 와 같은 방식으로 `lib/format.ts` 이관이 자연스럽다. 다음 정리 기회(또는 해당 화면을 만지는 스토리)에서 처리. [frontend/app/patient/select/page.tsx ↔ frontend/app/staff/patients/page.tsx ↔ frontend/app/staff/patients/[id]/page.tsx]
- **`ensure_utc` 의 datetime 경계 OverflowError** — 5.4 가 visited_at 인라인 정규화(naive 만 replace)를 공유 `ensure_utc`(항상 `astimezone(utc)`)로 바꾸며, 연도 1/9999 경계의 aware 비-UTC 입력(예: `0001-01-01T00:00:00+09:00`)이 기존 201(저장)에서 500(OverflowError→전역 핸들러)으로 바뀌는 병리 경로가 생겼다(5.4 드리프트 검증 발견 → 코드리뷰 3층 교차 재확인·Defer 확정, Low). 프런트는 이런 값을 만들 수 없고 크래프트 API 한정 — 필요해지면 ensure_utc 에 경계 가드 또는 400 매핑. [backend/app/slots.py, backend/app/services/medical_records.py]
- **`ErrorState` 정본의 live-region 부재** — 정본(`components/error-state.tsx`)에 `role`/`aria-live` 가 없어 오류 상태 전환이 스크린리더에 통지되지 않는다(같은 파일군의 NoticeState 는 `role="status"` 보유 — 드리프트). 3.1 deferred 항목("사본 승격 임계")에 딸려 있던 관찰이 5.4 의 항목 삭제로 소실될 뻔해 재기록(5.4 코드리뷰 Patch). 이관 화면들의 기존 동작과 동일해 회귀는 아님 — 1.5 deferred 의 SR 침묵 하드닝(aria-live)과 함께 처리 후보. [frontend/components/error-state.tsx]

## Deferred from: code review of 6-3-직원-대리-예약 (2026-07-26)

- **환자 검색이 페이징 없이 전체 환자를 조회·렌더** — `GET /patients`(`backend/app/db/patients.py:22-26`)에 `LIMIT`이 없고 `lib/api.ts:174-180`에도 페이징이 없어, 대리 예약 다이얼로그를 열 때마다 전체 환자 표를 받아 `max-h-48` 스크롤러 안에 전량 `<button>`으로 렌더한다. 시드 3명 규모에선 무해하나 실제 규모에선 매 열림마다 전량 전송 + DOM 수백 노드. 처리 시 서버 `LIMIT`+검색어 필수화 또는 무한 스크롤. [frontend/components/proxy-booking-dialog.tsx (환자 검색), backend/app/db/patients.py]
- **검색 0건에서 [신규 환자 등록]으로 이탈하면 나머지 입력이 소실되고 복귀 경로가 없음** — 다이얼로그를 벗어나 `/staff/patients/new`로 이동하면 컴포넌트가 언마운트돼 진료과·의사·날짜·시간 선택이 사라지고, 등록 성공 후에도 그 화면에 머물러(`app/staff/patients/new/page.tsx`) 예약 화면으로 돌려보내지 않는다. 환자를 폼 첫 필드로 둔 설계가 피해를 줄이지만(보통 다른 값 입력 전에 이탈) 완전 해소는 아니다. 근본 해결은 다이얼로그 안 인라인 환자 등록(모달 2단계 — UX-DR6 위배)이나 복귀 쿼리(`?returnTo=`). [frontend/components/proxy-booking-dialog.tsx (0건 안내 링크)]
- **환자 선택·[변경] 시 포커스가 `document.body`로 떨어짐** — 선택 시 검색 블록이 요약 블록으로 통째 교체되는데 포커스 인계가 없어, 키보드 사용자의 다음 Tab이 다이얼로그 처음부터 다시 시작한다. 처리 시 선택 후 [변경] 버튼(또는 진료과 트리거)에 `focus()` 인계. [frontend/components/proxy-booking-dialog.tsx (selectPatient / [변경])]

## Deferred from: code review of 6-1-3역할-진입-의사-대시보드 (2026-07-26)

- **재배정된 의사 신원의 1프레임 교차-의사 데이터 플래시** — `/doctor` 대시보드의 예약 로드 effect(`getAppointmentsByDoctor(doctor.id)`)와 신원 서버 대조 effect(`getAllDoctors()` → 불일치 시 `clearDoctor()`+redirect)가 `ready && doctor` 만으로 병렬 실행되고 서로 순서가 없다. 재시드로 저장된 id 가 **다른 의사**에게 재할당된 상태에서 로드가 대조보다 먼저 resolve 하면, 리다이렉트 전 1프레임 동안 남의 예약 목록(다른 환자 이름)이 렌더된다. 환자 홈(`/patient`)은 데이터를 안 불러 이 구멍이 없었으나, 6.1 이 홈+목록을 한 화면(대시보드)으로 합치며 재노출됐다. **도달성 낮음**(재시드 id 재할당 전제)·**자기수정**(대조가 곧 redirect)·**AD-8 데모 모델**(앱 레벨 스코핑은 보안 격리가 아님 — 명시)이라 4.1/4.2 가 동일류 1프레임 스테일을 defer 한 선례를 계승한다. 근본 해결은 실인증·서버측 신원 바인딩(P0 스코프 밖) 또는 로드를 대조 통과 뒤로 시퀀싱(verified 게이트). [frontend/app/doctor/page.tsx (로드 effect ↔ 대조 effect 레이스)]

## Deferred from: code review of 4-2-직원-환자별-전체-진료-내역-조회 (2026-07-26)

- **상세→상세 직접 이동 시 1프레임 스테일 렌더** — `/staff/patients/[id]` 는 `setLoading(true)`·환자/오류/부재 세팅을 전부 `setTimeout(…, 0)` 콜백 안에서 하므로(React 19 린트 회피), 같은 컴포넌트 인스턴스로 다른 환자 상세로 **직접** 이동(주소창 편집·브라우저 뒤로/앞으로)하면 `patientId` 는 즉시 바뀌어 리렌더되지만 `loading`/`patient`/`error`/`notFound` 는 타이머 발화 전이라 **1프레임 동안 이전 환자 데이터(또는 스테일 ErrorState/NotFound)가 새 URL 아래** 보인다. 도달성 낮음(앱에 상세→상세 링크가 없어 목록 경유가 정상 경로)·자기수정(타이머 0ms). 4.1 이 동일류 1프레임 스테일(탭 간 신원 교체)을 defer 한 선례를 계승. 근본 해결은 컴포넌트 `key={id}` 리마운트 또는 스테일 가드(`useRef` 로 요청 id 대조) — 실인증/라우팅 정리 스토리에서 함께. [frontend/app/staff/patients/[id]/page.tsx:78-79]

## Deferred from: code review of 3-1-확정-예약에-진료-기록-작성-완료-전이 (2026-07-24)

- **가드 pre-fetch 의 4-조인 폭** — `create_medical_record` 가드는 status·doctor_id 만 읽는데 표시용 4-조인 9컬럼 쿼리를 재사용(왕복 자체는 상태별 400 문구 계약상 필요). 최소 셀렉트 `fetch_appointment_status` 분리는 이 규모에선 저우선. [backend/app/services/medical_records.py:33]
- **저장 성공 직후 이중 제출 창** — 기록 저장 성공 시 `finally`가 `submitting`을 풀고 `router.push` 완료 전까지 버튼이 잠깐 재활성. 재제출해도 서버 가드(완료 400·중복 409)가 막아 무해 — 성공 경로에서 submitting 유지(내비게이션까지)로 정리 가능. [frontend/app/staff/appointments/[id]/record/page.tsx:96-107]
- **URL id 의 `Number()` 관용 파싱** — `/staff/appointments/0x1F/record` 같은 16진/지수 표기가 `Number()`로 유효 id 가 됨(서버 404 가 최종 방어라 무해). 엄격 파싱은 `/^\d+$/` 검사로. [frontend/app/staff/appointments/[id]/record/page.tsx:29-31]
- **doctor-null CAS 경합의 409 문구** — `and doctor_id is not null` 로 걸린 0행도 "예약 상태가 방금 바뀌었어요"(상태 문구)로 안내됨. 의사 지정 변화 문구 분리는 도달 불가 경합의 문구 정밀화라 저우선. [backend/app/services/medical_records.py:79-84]
- **record 페이지 죽은 `: null` 삼항 가지** — 로드 성공 시 `appt`가 항상 채워져 마지막 `: null` 가지는 도달 불가(방어적 타입 정직). 정리 시 조건 구조 단순화 가능. [frontend/app/staff/appointments/[id]/record/page.tsx:226]

## Deferred from: Codex 사전 리뷰 of 3-1-확정-예약에-진료-기록-작성-완료-전이 (2026-07-24)

- **`UniqueViolation` catch가 위반 제약 이름 미확인** — `create_medical_record`의 except 블록이 모든 유니크 위반을 "이미 진료 기록이 있는 예약"(409)으로 매핑. 현재 `medical_record`의 유니크 제약은 부분 유니크 `uq_medical_record_appointment` 하나뿐(PK 는 identity)이라 실질 오분류 경로 없음. 유니크 제약이 추가되거나 OVERRIDING 삽입으로 시퀀스가 뒤처질 수 있게 되면 `exc.diag.constraint_name` 확인으로 정밀화(단, 손제작 예외의 diag 는 None 이라 테스트 페이크 방식 함께 조정 필요). [backend/app/services/medical_records.py:62-68]
- **계약 테스트가 실 CTE/제약/timestamptz 미실행** — `test_medical_records.py`가 db 계층을 monkeypatch 해 SQL 회귀를 못 잡는 것은 2-3 리뷰에서 기록된 계약 테스트 아키텍처의 본질적 한계와 동일. 3.1의 실 보증은 라이브 Supabase curl 실증(원자성·중복 409 롤백 포함, dev-story Debug Log)으로 수행됨. [backend/tests/test_medical_records.py]

## Deferred from: code review of 7-1-예약-일정-변경 (2026-07-29)

- **`GET /availability` 의 `exclude_appointment_id` 무검증** — 그 예약이 조회 대상 의사·환자와 관련 있는지 확인하지 않는다. 남의 예약 id 를 넘기면 그 점유가 사전 표시에서 가려지고, 쓰기 게이트는 항상 자기 행만 제외하므로 제출 시 409 가 난다. 프런트는 항상 자기 id 를 보내고 최종 차단은 쓰기 게이트가 하므로 실피해는 "제출 후 409" 뿐. 서버측 소유권 검증(`fetch_appointment` 후 doctor_id·patient_id 대조)은 별도 작업. [backend/app/routers/availability.py:14-37 · backend/app/services/availability.py:31-38]
- **환자 축 409 테스트가 제약 이름 확인을 실제로 검증 못 함** — 손제작 `UniqueViolation` 은 `exc.diag.constraint_name` 이 항상 None 이라 `_reject_unique_violation` 의 폴백 분기만 탄다. 테스트 안의 제약 이름 문자열은 장식이고, deferred-work 가 예고한 `(doctor_id, reserved_at)` 부분 유니크 추가 시 의사 충돌이 환자 문구로 오보되는 시나리오는 커버리지 0. `_reject_unique_violation` docstring 과 위 60행이 이미 인정한 알려진 한계(psycopg diag 는 서버 응답에서만 채워짐). 실 보증은 curl 실증. [backend/tests/test_appointments.py:1055-1078]
- **`revealField` 두 번째 사본** — `frontend/components/proxy-booking-dialog.tsx:68-73` 과 바이트 동일한 5줄 헬퍼가 `reschedule-dialog.tsx:48-53` 에 복제됐다. 5.4 사본 수렴 규율 대상 — 공용 유틸(`lib/` 또는 `components/`) 승격 후보. Epic 5 회고 액션 #3(부채 순증 대응 방식) 의 실제 사례로 함께 볼 것. [frontend/components/reschedule-dialog.tsx:48-53]
- **의사만 바꿔도 `reserved_at` 을 무조건 재작성** — `_UPDATE_APPOINTMENT_SCHEDULE` 이 항상 두 컬럼을 SET 하므로, 저장값이 30분 비정렬인 행이면 `to_slot()` floor 로 진료 시각이 최대 29분 앞당겨지고 006 인덱스 키까지 바뀐다(요청에 없던 변경). 006 헤더가 경고한 "앱 밖에서(SQL 에디터·데이터 보정·임포터) 비정시 오프셋 세션으로 넣은 행" 전제라 앱 경로로는 도달 불가. 근본 해결은 SET 을 조건부로 나누거나(문 2벌 = 게이트 사본) 비정렬 행을 마이그레이션으로 정규화하는 것. [backend/app/db/appointments.py:212-214]
- **변경 경로에 `ForeignKeyViolation` 핸들러 없음** — 생성 경로(`create_appointment`·`_create_appointment_auto`)는 없는 의사·환자를 400 한국어로 매핑하는데 `set_appointment_schedule` 은 없어 원시 500 이 새어 나간다. 소속 검증 통과 후 그 의사 행이 삭제되는 경합 전제이고 참조 데이터는 시드 전용이라 도달성이 낮다. [backend/app/services/appointments.py:327-340]

## Deferred from: code review of 2-3-직원-담당-의사-변경-재배정 (2026-07-23)

> ✅ **2026-07-29 재평가 완료 (Story 7.1 done — 스코프 커밋의 약속 이행).** 7.1 이 `[의사 변경]` 다이얼로그를 `[변경]` 으로, `PATCH …/doctor` 를 `PATCH …/reschedule` 로 대체하면서 이 절의 6건이 갈렸다. **라인 번호는 7.1 이전 기준이라 아래 살아남은 항목 외에는 무효다.**
>
> **소멸 4건**(코드가 사라져 부채도 함께 사라짐 — 재확인 완료):
> - `_UPDATE_APPOINTMENT_DOCTOR` 표시 조인 5번째 사본 → `_UPDATE_APPOINTMENT_SCHEDULE` 로 교체(사본 수는 그대로 5 — **소멸이 아니라 이월**. 아래 "살아남음" 참조)
> - `runDoctorChange` 골격 중복 → 함수 삭제, 다이얼로그가 자체 제출 경로를 가짐
> - `DoctorChangeDialog` 컴포넌트 추출 → **`components/reschedule-dialog.tsx` 신설로 이행 완료**
> - 인플라이트 중 닫기 비대칭 → 새 다이얼로그는 `handleOpenChange` 가 `submittingRef` 로 저장 중 닫기를 막는다(해소)
>
> **살아남음 3건**(대상만 이동 — 아래 목록에서 계속 유효):
> - 표시 조인 SQL 사본(개수 불변, 이름만 `_UPDATE_APPOINTMENT_SCHEDULE`)
> - `renderActions` 분기 버튼 중복 — 버튼이 `[의사 변경]`→`[변경]` 으로 바뀌었을 뿐 대기/확정 분기의 중복 구조는 그대로
> - 의사 목록 per-open 재요청 — 새 다이얼로그도 열 때마다 `getDoctors` 를 호출한다(remount 설계상 캐시하려면 부모 보유 필요)
>
> 나머지 항목(문구 dict · 404/409 블록 · 불변 단언 · 가드 pre-fetch)은 영향 없음. 7.1 코드리뷰가 새로 낸 defer 5건은 위 "code review of 7-1-예약-일정-변경" 절에 있다.

- **표시 조인 SQL 5번째 사본** — `_UPDATE_APPOINTMENT_DOCTOR`가 projection 사본을 4→5개로 늘림. 공유 fragment 상수 합성 시 파일 전체 약 -28줄, `AppointmentOut` 모양 변경이 1곳으로 수렴. 단 기존 4개는 2.1·2.2 의도적 컨벤션이라 일괄 정리 스토리에서. [backend/app/db/appointments.py:103-120]
- **프런트 뮤테이션 골격 중복** — `runDoctorChange`/`runStatusChange`가 재진입 가드→pendingId→행 교체→toast→실패 reloadNonce 골격 공유(~-14줄 여지). 로컬 `runMutation` 헬퍼 후보. [frontend/app/staff/appointments/page.tsx:179-221]
- **거부 문구 인라인 if/elif** — `_reject_message` 헬퍼 스타일 대신 인라인(도달 불가 else 포함). dict.get 한 줄로 8→3줄. [backend/app/services/appointments.py:148-155]
- **renderActions 분기 버튼 중복** — 대기/확정 분기가 취소+의사 변경 버튼을 중복(~27→16줄 여지). [frontend/app/staff/appointments/page.tsx:233-259]
- **DoctorChangeDialog 컴포넌트 추출** — Dialog 전용 상태 5종이 페이지 스코프에 산재(~430줄 페이지). 추출 시 페이지는 doctorTarget+성공 콜백만 유지. [frontend/app/staff/appointments/page.tsx:89-211]
- **의사 목록 per-open 재요청** — Dialog를 열 때마다 같은 과 GET /doctors 반복(준정적 참조 데이터, 매번 로딩 표시). `useRef<Map<hd_id, Doctor[]>>` 캐시 후보. [frontend/app/staff/appointments/page.tsx:128-149]
- **404/409 블록 중복** — `set_appointment_status`와 문구·구조 중복. `_fetch_appointment_or_404` + 공유 상수 후보(2.2 미러 컨벤션에 가까워 저우선). [backend/app/services/appointments.py:144-146·177-182]
- **인플라이트 중 닫기 비대칭** — 의사 변경 Dialog는 실행-후-닫기라 PATCH 진행 중 Esc/닫기가 살아있음(AlertDialog는 닫고-실행). 데이터 무결성 문제는 없고 UX 일관성만. [frontend/app/staff/appointments/page.tsx:423]
- **불변 단언의 동어반복** — "status·진료과 불변" 단위 테스트 단언이 monkeypatch fake의 에코 값 검증이라 SQL 회귀를 못 잡음(실 보증은 curl/브라우저 실측). 계약 테스트 아키텍처의 본질적 한계로 기록. [backend/tests/test_appointments.py:509-533]

## Deferred from: code review of 1-5-환자-신원-선택-역할-컨텍스트-바 (2026-07-17)

- **저장된 신원을 서버와 대조하지 않음** — `usePatientIdentity()` 가 localStorage 원문을 파싱해 그대로 돌려줄 뿐 `GET /patients` 로 재검증하지 않는다. DB 재시드(`db/seed/004_seed.sql` 의 truncate·restart identity)나 환자 삭제 후 `id=1` 이 다른 사람에게 재할당되면, 브라우저는 `{"id":1,"name":"이수민"}` 을 계속 들고 있어 **이름은 이수민, 데이터는 남의 것**인 무성 불일치가 된다(Epic 4 의 `?patient_id=1` 이 그 id 를 쓴다). 저장된 이름은 만료 없는 PII 사본이기도 하다. 하드닝: 선택 화면이 목록을 받은 뒤 `if (patient && !rows.some(r => r.id === patient.id)) clearPatient()` 로 정리(현재 미사용인 `clearPatient` 를 여기서 쓰면 됨). 단 `/patient` 직접 진입 경로는 여전히 남으므로 Epic 4 의 실데이터 조회에서 근본 처리. [frontend/lib/patient-identity.ts, frontend/app/patient/select/page.tsx]
- **`clearPatient` 소비처 0 · 신원을 지우는 UI 경로 없음** — '다른 환자'는 신원을 *교체*할 뿐 지우지 않고, '역할 바꾸기'도 지우지 않는다. 공용 단말에서 앞 사람 신원(이름=PII)이 남는다. 신원 삭제는 이 스토리 AC 밖이라 defer. 배선 시 저장소 예외 방향(위 패치의 `storageUsable` 플래그)을 함께 고려할 것. [frontend/lib/patient-identity.ts]
- **가드 대기 화면·스켈레톤의 스크린리더 침묵** — `/patient` 의 재수화 대기 셸이 내용 없는 `<main aria-busy="true" />` 라 비시각 사용자에겐 '로딩 중'인지 '빈 페이지'인지 단서가 없고, 선택 화면 스켈레톤은 `aria-hidden` + 목록 컨테이너에 `aria-live` 가 없어 목록 도착이 통지되지 않는다. 1.4 의 `ListSkeleton` 도 동일 패턴이라 두 화면을 함께 하드닝하는 게 일관적(visually-hidden 상태 텍스트 + `aria-live="polite"`). [frontend/app/patient/page.tsx, frontend/app/patient/select/page.tsx, frontend/app/staff/patients/page.tsx]
- **데모 고지가 `/patient` 에 없어 복귀 사용자는 다시 못 봄** — 1.5 가 고지를 `/patient` 에서 걷어내 `/patient/select` 배너로 옮겼다(UX 스파인의 State Patterns 가 고지를 신원 선택 화면에 배치하므로 AC3·스파인 준수). 다만 신원이 영속되므로 북마크·새로고침으로 `/patient` 에 직접 들어오는 정상 경로는 고지를 두 번 다시 만나지 않는다. **Story 4.1 이 이 화면에 실제 예약·진료 기록을 올릴 때** 한 줄 고지 상시 노출을 재검토할 것(AD-8 "UI에서 분명히 한다"). [frontend/app/patient/page.tsx]

## Deferred from: code review of 1-4-직원-환자-목록-이름-검색 (2026-07-16)

- **GET /patients 전체 PII 노출·이름 열거 가능** — `GET /patients`가 인증 없이 모든 환자의 이름·생년월일·연락처를 반환하고 `?search=`로 이름 열거가 가능하다. 무인증 데모 설계(역할 선택·API 필터, AD-7 deny-by-default RLS + AD-8 "앱 레벨 필터, 보안 아님")와 정합하며 1.4가 만든 회귀는 아니나, 1.4가 공개 URL에서 환자 명부 + 자유 텍스트 PII 검색을 처음 노출한다. 데모를 넘어 배포 시 실제 인증·권한(아키텍처 Deferred의 "실제 인증·DB 레벨 격리") 결정 필요. [backend/app/routers/patients.py]
- **검색어 LIKE 와일드카드 미이스케이프(코드 리뷰에서 패치 검토)** — `fetch_patients`가 `f"%{search}%"`로 패턴을 만들어 `%`/`_`/`\`가 그대로 LIKE 메타문자로 작동(파라미터화라 injection은 없음). 패치로 처리하지 않으면 남길 항목: `\ % _` 이스케이프 + `ESCAPE '\'`. [backend/app/db/patients.py]
- **한글 NFC/NFD 정규화 불일치** — ILIKE가 코드포인트 비교라, 분해형(NFD, 일부 macOS IME) 입력이 조합형(NFC) 저장 이름과 매칭되지 않아 "결과 없음"으로 보일 수 있다. 서버/클라에서 검색어·비교 대상을 `.normalize("NFC")`로 정규화하면 해소. 데모는 대개 NFC라 저위험. [backend/app/db/patients.py, frontend/lib/api.ts]
- **검색어 최대 길이 제한 없음** — 라우터 `search: str | None`(max_length 없음)·검색 `<Input>`(maxLength 없음)이라 초대형 문자열을 직접 API로 보내면 비싼 전체 스캔 LIKE가 될 수 있다(경미한 DoS 여지). 데모 저위험. param/input에 상한 부여로 하드닝. [backend/app/routers/patients.py, frontend/app/staff/patients/page.tsx]
- **계약 테스트가 실제 `date` 직렬화 미검증** — `test_patients.py`의 fake가 `birth_date`를 이미 문자열("YYYY-MM-DD")로 반환해, 운영에서 psycopg가 주는 `datetime.date`→ISO 직렬화(PatientOut)가 테스트로 커버되지 않는다. fake가 실제 `datetime.date`를 반환하는 케이스 1건 추가로 하드닝(POST 테스트도 동일 패턴이라 함께 고려). [backend/tests/test_patients.py]

## Deferred from: code review of 1-3-직원-신규-환자-등록 (2026-07-16)

- **birth_date 미래·비현실 날짜 허용** — `POST /patients`의 `birth_date`(Pydantic `date`)와 등록 폼(`<input type="date">`)이 `2999-01-01` 같은 미래/비현실 생년월일을 검증 없이 저장한다. 데모 범위상 경미하고 스펙 미요구. 향후 프런트 `max={오늘}` + 백엔드 범위 검증(예: 1900~오늘)으로 하드닝. [backend/app/schemas/patients.py, frontend/app/staff/patients/new/page.tsx]
- **환자 등록 폼 이중 제출 재진입 가드** — `handleSubmit`이 `disabled={submitting}`에만 의존해, 상태 커밋 전 빠른 더블클릭/더블-Enter 창에서 두 번 POST될 이론적 여지(중복 환자 행). 표준 disabled 패턴이 있어 데모엔 충분하나, 확실히 막으려면 `submittingRef`(useRef) 가드 추가. [frontend/app/staff/patients/new/page.tsx]

## Deferred from: code review of 1-2-배포-vercel-railway-rls-실증 (2026-07-14)

- **`railway.json` `$PORT` startCommand 하위경로 미적용** — Railway가 `backend/railway.json`을 Root Directory(`backend`) 밖에서 못 읽어, 커밋한 `uvicorn ... --port $PORT` 명령 대신 Railpack 기본 명령이 실행돼 앱이 포트 **8080** 고정 바인딩. 현재 Railway 도메인 타깃 포트를 **8080**에 수동 정렬해 동작 중. 재배포/포트 변경 시 이 정렬이 깨지면 502 발생 가능. 정리: 대시보드 **Custom Start Command**(`uvicorn app.main:app --host 0.0.0.0 --port $PORT`) 설정 + 도메인 자동 포트로 전환. [backend/railway.json]

## Deferred from: code review of 1-1-로컬-수직-슬라이스 (2026-07-14)

- **⚠️ 시드 재실행 데이터 유실 (Epic 2 착수 전 필수 처리)** — `db/seed/004_seed.sql`의 `truncate ... restart identity cascade`가 참조 테이블뿐 아니라 `appointment·medical_record·prescription`까지 비운다. 지금은 트랜잭션 데이터가 0행이라 무해하나, Epic 2부터 UI로 만든 예약·진료 데이터가 있는 상태에서 재시드하면 공유 DB에서 삭제된다. 예약 기능(Story 2.1) 착수 전에 결정: (a)데모 리셋 유지+경고 주석 (b)truncate 없이 idempotent upsert (c)비어있을 때만 시드. [db/seed/004_seed.sql]
- **to_slot() tz 전제** — `to_slot()`은 UTC로 floor하고 DB CHECK는 세션 tz의 `extract(minute)`를 쓴다. 정시 오프셋(KST/UTC)에선 동일하나 비정시 오프셋(예: +5:45)으로 배포하면 어긋난다. AD-3에 문서화됨. 배포 tz가 바뀌면 재검토. [backend/app/slots.py, db/migrations/003_reserved_at_check.sql]
- **인프라 오류 → 한국어 {detail} 전역 핸들러** — DB 다운/풀 타임아웃 시 FastAPI 기본 500(영문)이 나가고 클라이언트가 한국어 폴백을 보여준다. AD-10 계약을 인프라 오류까지 확장하는 전역 예외 핸들러는 배포 하드닝(Story 1.2)에서. [backend/app/routers, backend/app/db/pool.py]
- **fetch_departments hospital 필터** — 진료과 조회 SQL에 `where hd.hospital_id = ...`가 없어 다병원이 시드되면 진료과가 섞인다. 단일 병원 전제에선 정확. 다병원 도입 전 필터 추가. [backend/app/db/refdata.py]
- **RLS 비소유자 역할 시 빈 결과** — deny-by-default라 백엔드가 소유자(postgres) 역할이 아니면 조용히 `[]`를 반환한다. 현재 세션 풀러 소유자 역할로 실증됨. 향후 최소권한 역할로 바꾸면 명시적 정책/GRANT 필요. [db/migrations/001_rls.sql]

## Deferred from: code review of 2-1-환자-예약-생성 (2026-07-19)

- **진료과 0건 빈 상태 안내 없음** — 진료과 조회가 성공적으로 `[]`를 주면 안내 없이 빈 Select만 뜨고 제출이 영구 차단된다(에러 경로는 `deptLoadError` 표시). 시드에 3과가 있어 데모에선 미발생. 향후 빈 상태 UI 추가. [frontend/app/patient/book/page.tsx]
- **진료과에 의사 0명 안내 없음** — `getDoctors`가 `[]`면 의사 Select가 활성이지만 옵션·안내가 없다. 시드는 과당 2명이라 데모 미발생. "이 진료과에 담당 의사가 없어요" 안내 추가. [frontend/app/patient/book/page.tsx]
- **의사 로드 실패가 toast-only** — `getDoctors` 실패 시 `setDoctors([])` + 일시 toast뿐, 진료과처럼 지속 인라인 오류가 없다. 놓치면 빈 드롭다운만 남음. departments처럼 inline error+재시도 추가. [frontend/app/patient/book/page.tsx:157]
- **자정 넘긴 stale dayOptions** — 7일 날짜 목록이 마운트 1회 계산이라, 페이지를 자정 넘겨 열어두면 첫 옵션이 어제를 가리킨다. 타이머/포커스 재계산 필요. (2026-07-27 갱신: 5.1이 제출 직전 클라 재검증 + 서버 과거 시각 400 을 넣어 **과거 예약이 실제로 생성되는 위험은 해소** — 남은 것은 표시 신선도뿐이라 심각도 하향.) [frontend/app/patient/book/page.tsx]
- **`to_slot`(UTC) vs CHECK(세션 tz `extract`) 불일치** — 비-정시 오프셋 세션 tz(+5:45 등)에선 유효 슬롯이 CHECK에 걸려 500. Supabase 기본 UTC라 무해, `slots.py`·AD-3에 문서화됨. 배포 tz 변경 시 재검토. [backend/app/slots.py, db/migrations/003_reserved_at_check.sql]

## Deferred from: code review of 3-2-진료-기록에-처방-추가 (2026-07-25)

- **`drug_id` bigint overflow → 500** — 크래프트 API 입력(19+자리 `drug_id`)이 Pydantic 무제한 int 를 통과해 CTE 의 `drug_id bigint` 캐스트에서 overflow, FK 체크 전에 500. 드롭다운 UI 는 실제 시드 id 만 보내 도달 불가라 낮음. 전역 핸들러가 친절한 한국어 500 으로 감싸 raw 크래시는 없음. days 상한 가드(이 리뷰에서 수정)와 같은 뿌리 — 무제한 int → DB 타입 캐스트. 하드닝 시 drug_id 도 bigint 경계 방어하거나 FK 400 으로 매핑. [backend/app/db/medical_records.py:58]
- **`prescriptions` 배열·`dosage` 길이 상한 없음** — `prescriptions: list[PrescriptionCreate] = []` 에 `max_length` 없고 `dosage: str | None` 무제한. 한 요청이 임의 크기 배열을 한 문장에 확장·INSERT — 인증 전 P0 데모의 견고성/DoS 갭. 앱 내 어떤 배열도 상한이 없어 이 변경 고유 문제는 아니나 첫 배열 입력. 향후 `max_length` + dosage 길이 제한. [backend/app/schemas/medical_records.py:57]
- **약 목록 빈 배열(`[]`) 시 완료 불가 처방 행 추가 가능** — `+ 처방 추가` 가 `disabled={drugs === null}` 라 `[]`(시드 전무·전량 삭제)는 못 막아 옵션 0개 Select 행이 추가된다. 제출 시 영구 "약을 선택해 주세요", 삭제로만 복구. 약은 시드 전용(FR-13, 항상 4행)이라 실사용 미발생. 향후 빈 목록도 버튼 disabled + 안내(fetch 실패 재시도와 별개 경로). [frontend/app/staff/appointments/[id]/record/page.tsx:304]

## Deferred from: code review of 4-1-환자-자기-예약-진료-기록-조회 (2026-07-26)

- **환자 서브 페이지 신원 신선도(스테일 신원)** — AC5 의 "저장 신원 vs 서버" 대조(`getPatients()` 로 이름·id 불일치 시 clearPatient+리다이렉트)가 `/patient` 홈에만 있다. 재시드/삭제로 id 가 재할당된 뒤 `/patient/appointments`·`/patient/records` 를 **직접 URL·북마크로** 진입하면(홈 우회) 스테일 신원이 안 걸려 남의 진료 데이터가 저장된 이름 아래 렌더될 수 있다. 또한 탭 간 신원 교체(storage 이벤트) 시 리패치 전 1프레임 동안 이전 환자 목록이 새 이름 아래 잠깐 보일 수 있다(`items` 미초기화 + `setLoading` 이 `setTimeout(0)` 지연). AC5 가 "홈 진입 1회"로 의도 스코프했고 AD-8(앱 레벨 필터·보안 아님) 전제라 보류 — 근본 해결은 실인증(AD-7 deferred). 처리 시: 신원 서버 대조를 공용 훅으로 뽑아 환자 3페이지 공통 적용 + `patientId` 변경 시 목록 리셋(렌더 시점 가드). [frontend/app/patient/appointments/page.tsx, frontend/app/patient/records/page.tsx, frontend/app/patient/page.tsx:35-56]

## Deferred from: code review of 5-1-가용성-충돌-검사 (2026-07-27)

- **부분 유니크 인덱스 백스톱(TOCTOU 완화)** — 5.1 게이트는 단일 세션 전제(문서화된 경계)라 동시 요청 이중 예약을 못 막는다. `create unique index ... on appointment(doctor_id, reserved_at) where status in ('대기','확정')` 부분 유니크만으로 **주 경합(예약 vs 예약)은 DB 레벨 차단 가능**(walk-in `medical_record` arm 은 제외 — 완전 차단은 EXCLUDE/점유 테이블 단일화, 아키텍처 Deferred). 5.1 스토리의 "(doctor,slot) 유니크는 합집합이라 불가능" 서술은 과장이었음(리뷰 정정). 적용 시 서비스의 UniqueViolation → 409 매핑 추가 필요. 데모 단일 세션에선 비차단이라 보류. [db/migrations/, backend/app/db/appointments.py]

## Deferred from: 5-1-가용성-충돌-검사 구현 (2026-07-27)

- **`allowedDevOrigins` 의 LAN IP 하드코딩** — 브라우저 실측(Chrome 확장이 `localhost` 탐색을 막아 LAN IP 로 접속)을 위해 `next.config.ts` 에 `allowedDevOrigins: ["192.168.0.13"]` 을 추가했다(Next 16 은 미등록 교차 오리진의 dev 접근을 차단해 하이드레이션이 멈춘다 — 실측 중 실증). dev 전용·프로덕션 빌드 무영향이나 IP 가 DHCP 로 바뀌면 갱신 필요. 다른 환경에서 실측할 일이 생기면 환경셋업.md 에 절차(백엔드 `--host 0.0.0.0` + CORS 오리진 임시 추가 + `NEXT_PUBLIC_API_BASE_URL` 임시 지정 포함)로 승격. [frontend/next.config.ts]
- **가용성 사전 조회의 폴링 없음(의도)** — 환자 예약 화면은 라우트 상주형이라 taken 표시가 조회 시점 스냅샷이다(다이얼로그는 열 때 remount 라 신선). 주기적 폴링은 YAGNI 로 두지 않았고, 제출 시 서버 게이트(400/409)가 최종 방어 + 409 시 재조회로 동기화한다(스토리 mount lifetime 설계 결정). 실시간성 요구가 생기면 폴링/refetch-on-focus 검토. [frontend/app/patient/book/page.tsx]

## Deferred from: code review of chore/patient-slot-guard — FR-15b 환자 축 (2026-07-28)

- **`update_appointment_status` 에 `UniqueViolation` 핸들러 없음** — 006 부분 유니크 인덱스가 생기면서 status UPDATE 도 원리상 인덱스를 건드릴 수 있게 됐다. 지금은 도달 불가다: `_ALLOWED_SOURCE` 가 완료·취소를 ('대기','확정') 으로 되돌리지 않아 인덱스 술어에 재진입할 경로가 없다. 즉 안전성이 **전이표에 대한 암묵적 의존**으로만 성립하고, 전이표에도 마이그레이션에도 그 의존이 기록돼 있지 않다. "예약 되살리기"(취소→대기) 같은 기능이 생기는 순간, 그 사이 환자가 같은 슬롯을 재예약했다면 raw psycopg `UniqueViolation` 이 서비스를 뚫고 나가 영어 DB 문자열 500 이 된다(AD-10 위반). 처리 시: 전이표 주석에 인덱스 의존 명시 + 되살리기 도입 시 409 매핑 추가. [backend/app/services/appointments.py:227-233, db/migrations/006_uq_patient_slot.sql]
- **`완료` 전이가 환자 축 불변식을 새게 한다** — 006 은 술어가 `status in ('대기','확정')` 이라 완료된 예약은 키에서 빠진다. `medical_records` 의 기록 생성은 `reserved_at` 이 미래인지 보지 않으므로, 미래 예약을 미리 완료 처리하면 그 환자가 **같은 미래 슬롯을 다른 의사로 다시 예약**할 수 있다. 마이그레이션 헤더의 "사람은 같은 시각에 두 진료를 받을 수 없다"는 이 경로에서 성립하지 않는다. 데모에서 미래 예약을 앞당겨 완료할 이유가 없어 보류. 처리 시: 술어에 완료를 포함할지(과거 슬롯 재예약을 막게 됨 — 과거 시각 가드와 중복) 또는 기록 생성에 "예약 시각 도래" 가드를 넣을지 결정 필요. [db/migrations/006_uq_patient_slot.sql:26, backend/app/services/medical_records.py]
