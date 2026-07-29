// 단일 API 클라이언트 (AD-10). 모든 화면은 백엔드를 오직 이 모듈을 통해서만 호출한다.
// 브라우저는 FastAPI 만 호출하고 DB/시크릿을 모른다 (AD-1). 백엔드 좌표는 NEXT_PUBLIC_API_BASE_URL 뿐.

const DEFAULT_API_BASE = "http://localhost:8000";
// 빈 문자열/공백도 "미설정"으로 취급하고(??는 빈 문자열을 못 걸러냄), 말단 슬래시는 모두 제거.
const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const API_BASE = (RAW_BASE && RAW_BASE.trim() ? RAW_BASE.trim() : DEFAULT_API_BASE).replace(
  /\/+$/,
  "",
);

// 리소스별 정규 응답 모델(FK 정수 id + 평평한 표시 필드, AD-10).
export type Department = { id: number; name: string };

// 환자 정규 응답 모델. birth_date 는 ISO 날짜 문자열("YYYY-MM-DD") 또는 null.
export type Patient = {
  id: number;
  name: string;
  birth_date: string | null;
  gender: string | null;
  phone: string | null;
};

// 환자 등록 요청. name 만 필수, 나머지는 선택(비우면 null 전송).
export type PatientCreate = {
  name: string;
  birth_date?: string | null;
  gender?: string | null;
  phone?: string | null;
};

// 의사 정규 응답 모델(AD-10). hospital_department 소속 의사. FK 정수 id + 평평한 표시 필드.
export type Doctor = {
  id: number;
  name: string;
  hospital_department_id: number;
  department_name: string;
};

// 예약 상태(스파인 Consistency) — 한국어 문자열 그대로. 배지·목록이 이 값으로 매핑.
export type AppointmentStatus = "대기" | "확정" | "완료" | "취소";

// 예약 정규 응답 모델(AD-10). 연관은 FK 정수 id + 평평한 표시 필드(nested 금지).
// reserved_at 은 ISO-8601 UTC 문자열. 생성 직후 status 는 "대기".
export type Appointment = {
  id: number;
  patient_id: number;
  hospital_department_id: number;
  doctor_id: number | null;
  reserved_at: string;
  status: AppointmentStatus;
  patient_name: string;
  doctor_name: string | null;
  department_name: string;
};

// 예약 생성 요청(FR-6). doctor_id 는 직접 선택한 의사 id, null 이면 서버가 그 진료과의
// 빈 의사를 자동 배정한다(P1, Story 5.2 — 전원 점유면 409). 응답에는 배정 의사가 채워진다.
// reserved_at 은 30분 격자 슬롯의 ISO-8601 UTC(백엔드 to_slot() 재검증).
export type AppointmentCreate = {
  patient_id: number;
  hospital_department_id: number;
  doctor_id: number | null;
  reserved_at: string;
};

// 가용성 정규 응답 모델(Story 5.1, FR-15). taken = 점유된 30분 슬롯 시작 시각(ISO UTC) 목록.
// patient_taken = 그 **환자**가 이미 잡은 활성 예약 슬롯(FR-15b, 2026-07-28 chore). 두 축은
// 섞지 않는다 — taken 은 의사별이라 자동 배정에서 교집합을 내지만, 환자 축은 의사와 무관해
// 교집합 대상이 아니라 합집합으로 얹는다.
export type Availability = { doctor_id: number; taken: string[]; patient_taken: string[] };

// 약 정규 응답 모델(Story 3.2). 시드 전용 참조 데이터(FR-13) — unit 은 표시에 쓰지 않는 선택 필드.
export type Drug = { id: number; name: string; unit: string | null };

// 처방 정규 응답 모델(Story 3.2). flat — drug 객체 중첩 금지(AD-10). drug_name 은 서버 조인 표시 필드.
export type Prescription = {
  id: number;
  drug_id: number;
  drug_name: string;
  dosage: string | null;
  days: number | null;
};

// 처방 행 요청(FR-10, Story 3.2). 약만 필수 — 용법·일수는 비우면 null 전송(days ≥ 1 은 서버 400).
export type PrescriptionCreate = {
  drug_id: number;
  dosage?: string | null;
  days?: number | null;
};

// 진료 기록 정규 응답 모델(AD-10, Story 3.1). patient_id·hospital_department_id·doctor_id 는
// 작성 시점 예약 값의 스냅샷 복사(AD-6, 이력 불변). appointment_id 는 walk-in(5.3)에서만 null.
// prescriptions 는 기록에 합성된 처방 0..N(Story 3.2) — 각 항목은 flat(위 Prescription).
export type MedicalRecord = {
  id: number;
  appointment_id: number | null;
  patient_id: number;
  hospital_department_id: number;
  doctor_id: number;
  visited_at: string;
  diagnosis: string | null;
  notes: string | null;
  patient_name: string;
  doctor_name: string;
  department_name: string;
  // 마지막 처방전 출력 시각(ISO UTC) 또는 null(미출력, Story 3.3). 서버 now() 가 소유 — 출력 여부 = not null.
  prescription_printed_at: string | null;
  prescriptions: Prescription[];
};

// 진료 기록 작성 요청(FR-9, Story 3.1). 스냅샷 3필드는 보내지 않는다 — 서버 SQL 이 예약 행에서
// 복사하고, 동봉하면 extra=forbid 로 422. visited_at 은 ISO-8601 UTC.
// prescriptions 는 처방 0..N(FR-10, Story 3.2) — 기록과 같은 트랜잭션에서 함께 저장된다.
export type MedicalRecordCreate = {
  appointment_id: number;
  diagnosis: string;
  notes?: string | null;
  visited_at: string;
  prescriptions: PrescriptionCreate[];
};

// 상태 코드를 실은 API 오류(Story 5.1). Error 서브클래스라 기존 `err instanceof Error` catch 는
// 전부 무수정 호환되고, 새 코드만 status 로 분기한다(예: 409 슬롯 충돌 → 그 셀 taken 갱신).
// 문구 정본은 서버 {detail}(AD-10) — message 는 서버 한국어를 그대로 담는다.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    // 네트워크/CORS/DNS 실패 — 브라우저 기본 영어 메시지 대신 한국어로.
    throw new Error("서버에 연결하지 못했어요. 백엔드가 실행 중인지 확인해 주세요.");
  }

  if (!res.ok) {
    // 오류 형태는 { detail } (AD-10). 도메인 거부는 4xx + 한국어 문자열.
    let detail = `요청을 처리하지 못했어요. (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail != null) {
        // 문자열이면 그대로, 리스트/객체(FastAPI 422 등)면 원시 JSON 대신 일반 메시지.
        detail =
          typeof body.detail === "string"
            ? body.detail
            : "요청 내용을 확인해 주세요.";
      }
    } catch {
      // 본문이 JSON 이 아니면 기본 메시지 유지.
    }
    throw new ApiError(detail, res.status);
  }

  // 성공 응답: 빈 본문·비-JSON 본문을 방어(성공 경로의 res.json() 미가드 예외 방지).
  const text = await res.text();
  if (!text) {
    return null as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("서버 응답을 이해하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export const api = {
  /** 단일 병원의 진료과 목록(=hospital_department 기준). 첫 화면 수직 슬라이스 관통에 사용. */
  getDepartments: async (): Promise<Department[]> => {
    const data = await request<Department[]>("/departments");
    // 서버가 배열이 아닌 값(null·객체)을 주더라도 화면이 무한 로딩/빈 카드에 빠지지 않게 정규화.
    return Array.isArray(data) ? data : [];
  },

  /** 신규 환자 등록(FR-4). 성공 시 생성된 환자(정규 모델)를 돌려준다. 오류는 request 가 한국어로 던진다. */
  createPatient: (payload: PatientCreate): Promise<Patient> =>
    request<Patient>("/patients", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** 환자 목록·이름 검색(FR-5). search 있으면 ?search= 로 서버측 부분 일치 필터(클라 필터 아님). */
  getPatients: async (search?: string): Promise<Patient[]> => {
    const term = search?.trim();
    const query = term ? `?search=${encodeURIComponent(term)}` : "";
    const data = await request<Patient[]>(`/patients${query}`);
    // getDepartments 와 동일하게 비배열 응답을 방어(화면이 무한 로딩/크래시에 빠지지 않게).
    return Array.isArray(data) ? data : [];
  },

  /** 진료과 소속 의사 목록(FR-6). 진료과 선택 후 담당 의사 드롭다운을 채운다. */
  getDoctors: async (hospitalDepartmentId: number): Promise<Doctor[]> => {
    const data = await request<Doctor[]>(
      `/doctors?hospital_department_id=${encodeURIComponent(String(hospitalDepartmentId))}`,
    );
    // 다른 조회와 동일하게 비배열 응답을 방어(화면이 무한 로딩/크래시에 빠지지 않게).
    return Array.isArray(data) ? data : [];
  },

  /** 전체 의사 목록(Story 6.1, FR-1b). 진료과 무관 — 의사 신원 선택 화면(/doctor/select)이 이 목록에서
   *  본인을 고른다. 백엔드 `/doctors`(무필터)가 전체를 반환한다(기존 계약 — getDoctors 시그니처는 동결). */
  getAllDoctors: async (): Promise<Doctor[]> => {
    const data = await request<Doctor[]>("/doctors");
    // 다른 조회와 동일하게 비배열 응답을 방어(화면이 무한 로딩/크래시에 빠지지 않게).
    return Array.isArray(data) ? data : [];
  },

  /** 약 목록(FR-10, Story 3.2). 진료 기록 폼의 처방 행 약 드롭다운을 채운다(시드 전용 참조 데이터). */
  getDrugs: async (): Promise<Drug[]> => {
    const data = await request<Drug[]>("/drugs");
    // 다른 조회와 동일하게 비배열 응답을 방어(화면이 무한 로딩/크래시에 빠지지 않게).
    return Array.isArray(data) ? data : [];
  },

  /** 의사의 점유 슬롯 조회(Story 5.1, FR-15). [start, end) ISO UTC 범위 — 슬롯 피커 taken 사전
   *  표시용. 매칭은 문자열 비교가 아니라 epoch ms 정규화로(서버 "+00:00" vs 프런트 "Z" 표기 차 방어).
   *  이 조회는 예방일 뿐 — 최종 차단은 제출 시 서버 409 가 담당한다(비관적 저장, UX-DR7). */
  getAvailability: async (
    doctorId: number,
    startIso: string,
    endIso: string,
    patientId?: number,
    excludeAppointmentId?: number,
  ): Promise<Availability> => {
    const query =
      `doctor_id=${encodeURIComponent(String(doctorId))}` +
      `&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}` +
      // 환자 축(FR-15b) — 주면 그 환자가 이미 잡은 슬롯이 patient_taken 으로 온다. 없으면 빈 배열.
      (patientId !== undefined ? `&patient_id=${encodeURIComponent(String(patientId))}` : "") +
      // 자기 행 제외(FR-19, Story 7.1) — 일정 변경 화면이 그 예약 자신의 슬롯을 taken 으로
      // 그리면 "시각 유지 + 의사만 변경"이 막힌다. 서버가 두 축 모두에서 제외한다.
      (excludeAppointmentId !== undefined
        ? `&exclude_appointment_id=${encodeURIComponent(String(excludeAppointmentId))}`
        : "");
    const data = await request<Availability>(`/availability?${query}`);
    // 다른 조회와 동일한 방어 — 배열이 아니면 빈 배열로 정규화(화면 크래시 방지).
    return {
      doctor_id: doctorId,
      taken: Array.isArray(data?.taken) ? data.taken : [],
      patient_taken: Array.isArray(data?.patient_taken) ? data.patient_taken : [],
    };
  },

  /** 예약 생성(FR-6). 성공 시 생성된 예약(정규 모델, status=대기)을 돌려준다 — doctor_id: null
   *  이면 서버가 빈 의사를 자동 배정해 응답에 채운다(P1, Story 5.2). 오류는 request 가 4xx
   *  {detail} 한국어로 던진다(AD-10). (의사, 슬롯) 충돌·과 전원 점유는 409(Story 5.1·5.2). */
  createAppointment: (payload: AppointmentCreate): Promise<Appointment> =>
    request<Appointment>("/appointments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** 직원 예약 목록(FR-7). 전체 예약을 정규 모델 리스트로 받는다(직원 전체 접근).
   *  환자용 스코핑 조회(?patient_id=)는 getAppointmentsByPatient(Story 4.1). */
  getAppointments: async (): Promise<Appointment[]> => {
    const data = await request<Appointment[]>("/appointments");
    // 다른 조회와 동일하게 비배열 응답을 방어(화면이 무한 로딩/크래시에 빠지지 않게).
    return Array.isArray(data) ? data : [];
  },

  /** 환자용 예약 목록(Story 4.1, FR-11·AD-8). ?patient_id= 로 그 환자의 예약만 받는다(최근순).
   *  앱 레벨 필터일 뿐 보안 격리가 아니다(AD-8). 없으면 빈 배열(404 아님 — 목록 계약). */
  getAppointmentsByPatient: async (patientId: number): Promise<Appointment[]> => {
    const data = await request<Appointment[]>(
      `/appointments?patient_id=${encodeURIComponent(String(patientId))}`,
    );
    return Array.isArray(data) ? data : [];
  },

  /** 의사 대시보드 예약 목록(Story 6.1, FR-17·AD-8). ?doctor_id= 로 그 의사에게 배정된 예약만 받는다
   *  (최근순). 활성(대기·확정)/완료 분류는 화면이 status 로 나눈다. 앱 레벨 필터일 뿐 보안 격리가 아니다
   *  (AD-8). 없으면 빈 배열(404 아님 — 목록 계약). getAppointmentsByPatient 미러. */
  getAppointmentsByDoctor: async (doctorId: number): Promise<Appointment[]> => {
    const data = await request<Appointment[]>(
      `/appointments?doctor_id=${encodeURIComponent(String(doctorId))}`,
    );
    return Array.isArray(data) ? data : [];
  },

  /** 예약 상태 전이(확정/취소, FR-7·FR-8). 성공 시 전이된 예약(정규 모델)을 돌려준다.
   *  전이 규칙 위반·없는 예약은 request 가 4xx {detail} 한국어로 던진다(AD-10). */
  updateAppointmentStatus: (
    id: number,
    status: AppointmentStatus,
  ): Promise<Appointment> =>
    request<Appointment>(`/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  /** 예약 일정 변경(FR-19, Story 7.1) — 담당 의사·진료 시각을 한 번에 바꾼다. Story 2.3 의
   *  updateAppointmentDoctor(`PATCH …/doctor`)를 **대체**한다(폐기).
   *  두 필드 모두 선택 — 의사만·시각만·둘 다 전부 가능하고, 미지정 필드는 서버가 현재 값으로
   *  채운다(doctor_id 생략은 "자동 배정"이 아니라 "현재 의사 유지"다).
   *  성공 시 갱신된 예약(정규 모델)을 돌려준다. 무변경·같은 과 아님·완료/취소·지난 시각은 400,
   *  (의사, 슬롯) 충돌·환자 축 중복·상태 경합은 409 — 전부 request 가 {detail} 한국어로 던진다. */
  rescheduleAppointment: (
    id: number,
    payload: { doctor_id?: number; reserved_at?: string },
  ): Promise<Appointment> =>
    request<Appointment>(`/appointments/${id}/reschedule`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  /** 예약 단건 조회(Story 3.1). 진료 기록 페이지가 대상 예약(상태·표시 필드)을 로드한다.
   *  목록·PATCH 와 같은 정규 모델. 없으면 request 가 404 {detail} 한국어로 던진다. */
  getAppointment: (id: number): Promise<Appointment> =>
    request<Appointment>(`/appointments/${id}`),

  /** 진료 기록 작성(FR-9, Story 3.1). 성공 시 생성된 기록(정규 모델)을 돌려주고, 같은 트랜잭션에서
   *  그 예약이 확정→완료로 전이되며 처방 0..N(FR-10, Story 3.2)도 함께 생성된다(all-or-nothing).
   *  확정 아님(400)·기록 중복(409)·경합(409)·없는 약(400)은 request 가 4xx {detail} 한국어로 던진다. */
  createMedicalRecord: (payload: MedicalRecordCreate): Promise<MedicalRecord> =>
    request<MedicalRecord>("/medical-records", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** 예약의 진료 기록·처방 조회(Story 3.3). 처방전 화면이 시트 데이터를 로드한다(0..1건, 예약당 1건).
   *  없으면 빈 배열(404 아님 — 목록 계약). 없는 appointment_id 는 422 를 request 가 일반 메시지로 던진다. */
  getMedicalRecords: async (appointmentId: number): Promise<MedicalRecord[]> => {
    const data = await request<MedicalRecord[]>(
      `/medical-records?appointment_id=${encodeURIComponent(String(appointmentId))}`,
    );
    // 다른 조회와 동일하게 비배열 응답을 방어(화면이 무한 로딩/크래시에 빠지지 않게).
    return Array.isArray(data) ? data : [];
  },

  /** 환자용 진료 기록 조회(Story 4.1, FR-11·AD-8). ?patient_id= 로 그 환자의 지난 기록·처방을
   *  정규 모델 리스트(처방 nested 포함)로 받는다(최근순). 없으면 빈 배열(404 아님 — 목록 계약). */
  getMedicalRecordsByPatient: async (patientId: number): Promise<MedicalRecord[]> => {
    const data = await request<MedicalRecord[]>(
      `/medical-records?patient_id=${encodeURIComponent(String(patientId))}`,
    );
    return Array.isArray(data) ? data : [];
  },

  /** 처방전 출력(Story 3.3). 서버가 출력 시각을 기록하고 갱신된 기록(정규 모델)을 돌려준다(body 없음).
   *  없는 기록(404)·처방 0건(400)은 request 가 4xx {detail} 한국어로 던진다 — 실패 시 인쇄하지 않는다. */
  printPrescription: (recordId: number): Promise<MedicalRecord> =>
    request<MedicalRecord>(`/medical-records/${recordId}/print`, {
      method: "POST",
    }),
};
