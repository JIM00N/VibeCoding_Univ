"use client";

// 30분 슬롯 피커 (UX-DR3, UX-DR9) — 이 앱 첫 커스텀 컴포넌트.
// 단일 선택 격자라 ARIA radiogroup 패턴: 방향키로 포커스+선택 이동(roving tabindex),
// Space/Enter 로 선택, 포커스 링 항상 보임. div+onClick 이 아니라 button 이라야 키보드로 도달한다.
// P0는 available/selected 두 상태만 — taken(예약됨·비활성)·슬롯 충돌은 Epic 5(FR-15).

import { useRef } from "react";

import { cn } from "@/lib/utils";

export type Slot = { label: string; iso: string };

// "09:00" → "9시" / "10:30" → "10시 30분" (한국어 스크린리더 라벨용, UX-DR9).
function spokenTime(label: string): string {
  const [h, m] = label.split(":").map(Number);
  return m === 0 ? `${h}시` : `${h}시 ${m}분`;
}

export function SlotPicker({
  slots,
  value,
  onChange,
  ariaLabel = "예약 시간 선택 (30분 단위)",
}: {
  slots: Slot[];
  value: string | null;
  onChange: (iso: string) => void;
  ariaLabel?: string;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // roving tabindex 진입점: 선택된 셀, 없으면 첫 셀만 Tab 으로 도달(나머지는 방향키).
  const selectedIndex = slots.findIndex((s) => s.iso === value);
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0;

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % slots.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + slots.length) % slots.length;
    else return; // Space/Enter 는 button 기본 동작이 onClick 을 부른다.
    e.preventDefault();
    onChange(slots[next].iso);
    btnRefs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {slots.map((slot, i) => {
        const selected = slot.iso === value;
        return (
          <button
            key={slot.iso}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${spokenTime(slot.label)}, ${selected ? "선택됨" : "예약 가능"}`}
            tabIndex={i === tabbableIndex ? 0 : -1}
            onClick={() => onChange(slot.iso)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              "rounded-md border py-2.5 text-center text-sm tabular-nums outline-none transition-colors",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              selected
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "border-input bg-card hover:border-primary",
            )}
          >
            {slot.label}
          </button>
        );
      })}
    </div>
  );
}
