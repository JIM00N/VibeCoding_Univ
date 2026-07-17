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
    throw new Error(detail);
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
};
