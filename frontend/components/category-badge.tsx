// 카테고리(진료과·담당 의사) 색 배지 (Story 2.4). AppointmentStatusBadge 패턴을 미러한다 —
// 연한 배경색 칩 + 이름 텍스트(색만으로 구분 금지, UX-DR9). 색은 category-color.ts 에서 오며
// 상태 4색·primary 와 겹치지 않는다. 상태 배지(rounded-full)와 형태를 살짝 달리해(rounded-md)
// 같은 표 안에서 상태색과 혼동을 줄인다.
import { cn } from "@/lib/utils";

export function CategoryBadge({
  name,
  colorClass,
  className,
}: {
  name: string;
  colorClass: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        colorClass,
        className,
      )}
    >
      {name}
    </span>
  );
}
