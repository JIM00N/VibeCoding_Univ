// 진료과·담당 의사 구분용 카테고리 색 (Story 2.4). 예약 목록에서 과·의사를 한눈에 구분한다.
//
// ⚠️ 상태 4색(대기 amber·확정 blue·완료 green·취소 gray)과 primary emerald(#047857)를
//    재사용하지 않는다 — 상태 시맨틱(데이터 계약)을 흐리지 않기 위해(DESIGN.md).
//    그래서 amber/blue/green/gray 계열을 피한 상호 구분되는 색만 담는다.
// - 연한 배경 + 진한 텍스트(상태 배지와 같은 밀도), 저채도 "차분한 임상" 톤.
// - 색만으로 구분하지 않도록 호출부(CategoryBadge)는 항상 이름 텍스트를 함께 보여준다(UX-DR9).
// - id 기반 결정적 매핑: 같은 진료과/의사는 항상 같은 색(재조회·리렌더에도 불변).

// blue/green/amber/gray 계열을 피한, 서로 구분되는 7색(연한 bg / 진한 fg).
// indigo(#E0E7FF)는 확정 상태색(#DBEAFE)과 너무 비슷해 제외했다 — 브라우저 검증에서 확인.
const CATEGORY_PALETTE = [
  "bg-[#FFE4E6] text-[#9F1239]", // rose
  "bg-[#FFEDD5] text-[#9A3412]", // orange
  "bg-[#EDE9FE] text-[#5B21B6]", // violet
  "bg-[#CFFAFE] text-[#0E7490]", // cyan (aqua — 확정 light-blue 와 명도·채도 차)
  "bg-[#FAE8FF] text-[#86198F]", // fuchsia
  "bg-[#FCE7F3] text-[#9D174F]", // pink
  "bg-[#F3E8FF] text-[#6B21A8]", // purple
] as const;

// 의사 색이 같은 행의 진료과 색과 겹치지 않도록 팔레트 절반만큼 오프셋한다
// (시드의 진료과·의사 쌍에서 항상 서로 다른 색이 나온다).
const DOCTOR_OFFSET = 4;

function paletteClass(index: number): string {
  const n = CATEGORY_PALETTE.length;
  const safe = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
  return CATEGORY_PALETTE[safe % n];
}

/** 진료과(hospital_department_id) → 결정적 색 className. 같은 진료과는 항상 같은 색. */
export function departmentColorClass(hospitalDepartmentId: number): string {
  const id =
    Number.isFinite(hospitalDepartmentId) && hospitalDepartmentId > 0 ? hospitalDepartmentId : 1;
  return paletteClass(id - 1);
}

/** 담당 의사(doctor_id) → 결정적 색 className. 같은 의사는 항상 같은 색. */
export function doctorColorClass(doctorId: number): string {
  const id = Number.isFinite(doctorId) && doctorId > 0 ? doctorId : 1;
  return paletteClass(id - 1 + DOCTOR_OFFSET);
}
