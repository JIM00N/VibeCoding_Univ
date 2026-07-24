# Deferred Work

## Deferred from: code review of 3-1-확정-예약에-진료-기록-작성-완료-전이 (2026-07-24)

- **fetch-or-404 블록 4-소스** — `fetch_appointment` + 404 "예약을 찾을 수 없어요." 패턴이 4곳(services/appointments.py의 set_appointment_status·set_appointment_doctor·get_appointment, services/medical_records.py) — 3.1이 만든 `get_appointment`(또는 `_fetch_appointment_or_404` 헬퍼)로 3곳 수렴 가능. 문구가 계약 테스트로 고정돼 있어 일괄 정리 스토리에서. [backend/app/services/appointments.py:88-90·121·157, backend/app/services/medical_records.py:35]
- **CAS 409 문구 3-소스** — "예약 상태가 방금 바뀌었어요…" 60자 문구가 3개 raise 사이트에 중복. 모듈 상수(또는 공유 errors 모듈) 1줄로 수렴 가능. [backend/app/services/appointments.py:137·192, backend/app/services/medical_records.py:81]
- **`ErrorState` 4번째 사본 — components 승격 임계 도달** — 동일 shell+`다시 시도` 구현이 4페이지에 바이트 중복(신규 NoticeState 는 `role="status"` 가 있는데 기존 3사본은 live-region 부재 — 이미 드리프트 시작). Epic 4 조회 페이지가 5번째를 만들기 전 `components/error-state.tsx` 추출 권장. [frontend/app/staff/appointments/[id]/record/page.tsx:242 외 3곳]
- **naive→UTC 규약 인라인 2사본** — services/medical_records.py 인라인 정규화 ↔ slots.to_slot 내부(19-20)가 주석으로만 연결. Epic 4(날짜 필터)·5.3(walk-in visited_at) 전에 공유 `ensure_utc()` 또는 `UtcDatetime = Annotated[datetime, AfterValidator]` 로 경계 수렴 권장. [backend/app/services/medical_records.py:59, backend/app/slots.py:19-20]
- **`_blank_str_to_none` 검증자 2사본** — patients ↔ medical_records 스키마에 동일 검증자 중복(3.2 처방 dosage 가 3번째 후보). 공유 함수/Annotated 타입으로 수렴 가능. [backend/app/schemas/medical_records.py:29, backend/app/schemas/patients.py:23]
- **가드 pre-fetch 의 4-조인 폭** — `create_medical_record` 가드는 status·doctor_id 만 읽는데 표시용 4-조인 9컬럼 쿼리를 재사용(왕복 자체는 상태별 400 문구 계약상 필요). 최소 셀렉트 `fetch_appointment_status` 분리는 이 규모에선 저우선. [backend/app/services/medical_records.py:33]

## Deferred from: Codex 사전 리뷰 of 3-1-확정-예약에-진료-기록-작성-완료-전이 (2026-07-24)

- **`UniqueViolation` catch가 위반 제약 이름 미확인** — `create_medical_record`의 except 블록이 모든 유니크 위반을 "이미 진료 기록이 있는 예약"(409)으로 매핑. 현재 `medical_record`의 유니크 제약은 부분 유니크 `uq_medical_record_appointment` 하나뿐(PK 는 identity)이라 실질 오분류 경로 없음. 유니크 제약이 추가되거나 OVERRIDING 삽입으로 시퀀스가 뒤처질 수 있게 되면 `exc.diag.constraint_name` 확인으로 정밀화(단, 손제작 예외의 diag 는 None 이라 테스트 페이크 방식 함께 조정 필요). [backend/app/services/medical_records.py:62-68]
- **계약 테스트가 실 CTE/제약/timestamptz 미실행** — `test_medical_records.py`가 db 계층을 monkeypatch 해 SQL 회귀를 못 잡는 것은 2-3 리뷰에서 기록된 계약 테스트 아키텍처의 본질적 한계와 동일. 3.1의 실 보증은 라이브 Supabase curl 실증(원자성·중복 409 롤백 포함, dev-story Debug Log)으로 수행됨. [backend/tests/test_medical_records.py]

## Deferred from: code review of 2-3-직원-담당-의사-변경-재배정 (2026-07-23)

- **의사↔진료과 검증 블록 2-소스** — `set_appointment_doctor`가 `create_appointment`(51-58)의 의사 존재·같은 과 검증(400 문구 2종 포함)을 바이트 중복. `_require_doctor_in_department(doctor_id, hd_id)` 추출로 해소. [backend/app/services/appointments.py:158-165]
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
- **자정 넘긴 stale dayOptions** — 7일 날짜 목록이 마운트 1회 계산이라, 페이지를 자정 넘겨 열어두면 첫 옵션이 어제를 가리킨다. 타이머/포커스 재계산 필요. [frontend/app/patient/book/page.tsx:106]
- **`to_slot`(UTC) vs CHECK(세션 tz `extract`) 불일치** — 비-정시 오프셋 세션 tz(+5:45 등)에선 유효 슬롯이 CHECK에 걸려 500. Supabase 기본 UTC라 무해, `slots.py`·AD-3에 문서화됨. 배포 tz 변경 시 재검토. [backend/app/slots.py, db/migrations/003_reserved_at_check.sql]

## Deferred from: code review of 2-2-직원-예약-확정-취소-상태-흐름 (2026-07-22)

- **`formatReservedAt` 중복(2-소스)** — 2.2가 공유 헬퍼 `frontend/lib/format.ts`를 새로 만들었으나 2.1의 로컬 복사본 `frontend/app/patient/book/page.tsx:61`을 import로 이관하지 않았다. 두 정의는 바이트 동일(같은 옵션·`Asia/Seoul`)이라 출력 정합 문제는 없고, 스펙 Project Structure Notes가 "미러"를 명시 허용한다. 정리하려면 book 화면이 `@/lib/format`을 import하도록 교체하면 되나 2.1 파일을 손대므로 add-only 규율상 보류. 향후 book 화면을 만질 때 함께 이관. [frontend/lib/format.ts:6 ↔ frontend/app/patient/book/page.tsx:61]
