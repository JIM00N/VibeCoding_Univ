// 직원 홈 → 예약관리 기본 진입 (Story 6.2, 사용자 결정 2026-07-26).
// 홈 카드 3장의 내비 기능은 좌측 사이드바(components/staff-sidebar.tsx)로 재배치됐다 —
// user story "예약관리를 중심으로" 대로 진입 시 예약관리를 기본 활성으로 보여준다.
import { redirect } from "next/navigation";

export default function StaffHome() {
  redirect("/staff/appointments");
}
