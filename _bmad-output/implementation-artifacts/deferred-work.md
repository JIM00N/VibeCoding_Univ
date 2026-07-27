# Deferred Work

> 2026-07-27 Story 5.4(중복 사본 정리)가 사본 수렴류 9건을 처리·삭제했다 — booking-slots 2-소스 ·
> orDash 4사본 · 짝 없는 slot-label · formatReservedAt 2-소스 · fetch-or-404 4사본 · CAS 409 문구
> 3사본 · naive→UTC 인라인 3곳 · \_blank_str_to_none 2사본 · 의사↔진료과 검증 블록 2-소스.
> 내역은 스토리 파일(5-4-중복-사본-정리.md)과 해당 커밋이 정본.

## Deferred from: 5-4-중복-사본-정리 구현 (2026-07-27)

- **`genderText`·`GENDER_LABEL` 3사본** — 성별 역매핑(M/F/null → 남/여/—)이 patient/select · staff/patients · staff/patients/[id] 에 동일 구현으로 존재. 5.4 스토리 대상 목록(회고 액션 #5 + deferred 라우팅 건) 밖이라 스코프 규율상 보류 — orDash 와 같은 방식으로 `lib/format.ts` 이관이 자연스럽다. 다음 정리 기회(또는 해당 화면을 만지는 스토리)에서 처리. [frontend/app/patient/select/page.tsx ↔ frontend/app/staff/patients/page.tsx ↔ frontend/app/staff/patients/[id]/page.tsx]
- **`ensure_utc` 의 datetime 경계 OverflowError** — 5.4 가 visited_at 인라인 정규화(naive 만 replace)를 공유 `ensure_utc`(항상 `astimezone(utc)`)로 바꾸며, 연도 1/9999 경계의 aware 비-UTC 입력(예: `0001-01-01T00:00:00+09:00`)이 기존 201(저장)에서 500(OverflowError→전역 핸들러)으로 바뀌는 병리 경로가 생겼다(5.4 드리프트 검증 발견, Low). 프런트는 이런 값을 만들 수 없고 크래프트 API 한정 — 필요해지면 ensure_utc 에 경계 가드 또는 400 매핑. [backend/app/slots.py, backend/app/services/medical_records.py]

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

## Deferred from: code review of 2-3-직원-담당-의사-변경-재배정 (2026-07-23)

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
