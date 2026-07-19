// 예약 상태 배지 (UX-DR2) — 색 + 한국어 텍스트를 함께 보여준다(색만으로 구분 금지, UX-DR9).
// 4값을 모두 정의해 2.2·Epic 4 가 재사용한다. Story 2.1 은 "대기"만 노출한다.
import type { AppointmentStatus } from "@/lib/api";
import { APPOINTMENT_STATUS_STYLE } from "@/lib/appointment-status";
import { cn } from "@/lib/utils";

export function AppointmentStatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
  const style = APPOINTMENT_STATUS_STYLE[status] ?? APPOINTMENT_STATUS_STYLE["대기"];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
