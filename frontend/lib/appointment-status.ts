import type { AppointmentStatus } from "@/lib/api";

// 예약 상태 배지 매핑 (UX-DR2) — 전 화면 동일한 데이터 계약. 색만으로 구분하지 않도록
// 한국어 라벨을 항상 병기한다(UX-DR9). status 전용 색을 쓴다 — 브랜드 emerald(primary)와
// 완료 green 은 서로 교차 사용하지 않는다(DESIGN.md green-adjacency 규칙).
// 대기=amber · 확정=blue · 완료=green · 취소=gray. Story 2.1 은 생성 직후 "대기"만 노출한다.
export const APPOINTMENT_STATUS_STYLE: Record<
  AppointmentStatus,
  { label: string; className: string }
> = {
  대기: { label: "대기", className: "bg-[#FEF3C7] text-[#92400E]" },
  확정: { label: "확정", className: "bg-[#DBEAFE] text-[#1E40AF]" },
  완료: { label: "완료", className: "bg-[#DCFCE7] text-[#166534]" },
  취소: { label: "취소", className: "bg-[#F1F5F9] text-[#475569]" },
};
