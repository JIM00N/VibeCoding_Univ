"use client";

// 30분 슬롯 피커 (UX-DR3, UX-DR9) — 이 앱 첫 커스텀 컴포넌트.
// 단일 선택 격자라 ARIA radiogroup 패턴: 방향키로 포커스+선택 이동(roving tabindex),
// Space/Enter 로 선택, 포커스 링 항상 보임. div+onClick 이 아니라 button 이라야 키보드로 도달한다.
// Story 5.1(FR-15): 옵션 takenMs 로 taken(예약됨·비활성) 3번째 상태 지원 — 미지정이면
// 기존 2상태 렌더·동작과 완전히 동일하다(add-only, 회귀 0).

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
  ariaLabelledBy,
  takenMs,
}: {
  slots: Slot[];
  value: string | null;
  onChange: (iso: string) => void;
  ariaLabel?: string;
  /** 있으면 aria-labelledby 로 보이는 라벨과 연결(우선). 없으면 aria-label 사용. */
  ariaLabelledBy?: string;
  /** 점유된 슬롯의 epoch ms 집합(Story 5.1, UX-DR3 taken 상태). ISO 문자열 비교 금지 —
   *  서버 직렬화("+00:00")와 슬롯 iso("Z") 표기가 문자열로는 어긋난다(epoch ms 로 정규화 매칭). */
  takenMs?: ReadonlySet<number>;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // taken 판정은 렌더마다 슬롯 개수만큼만 계산(격자 최대 18셀 — 메모 불필요).
  const takenFlags = slots.map((s) => takenMs?.has(new Date(s.iso).getTime()) ?? false);

  // roving tabindex 진입점: 선택된 셀 → 없으면 첫 선택 가능(비 taken) 셀만 Tab 으로 도달.
  // 전부 taken 이면 -1(도달 셀 없음) — disabled 셀은 어차피 포커스 불가, 화면이 별도 안내를 띄운다.
  // 선택 셀이 taken 인 (모순) 조합도 firstSelectable 로 폴백한다(코드리뷰) — 안 그러면 어떤 셀도
  // tabIndex 0 을 못 받아 격자 전체가 Tab 진입 불가가 된다(현 사용처는 배칭으로 회피하나 재사용 계약 가드).
  const selectedIndex = slots.findIndex((s) => s.iso === value);
  const firstSelectable = takenFlags.findIndex((t) => !t);
  const tabbableIndex =
    selectedIndex >= 0 && !takenFlags[selectedIndex] ? selectedIndex : firstSelectable;

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    if (slots.length === 0) return; // 빈 목록 방어(modulo-by-zero). 현재 배선상 미발생이나 재사용 대비.
    let dir = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") dir = 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") dir = -1;
    else return; // Space/Enter 는 button 기본 동작이 onClick 을 부른다.
    e.preventDefault();
    // taken 셀은 건너뛴다(UX-DR9 키보드 조작 — 비활성 셀에 선택이 떨어지면 안 됨).
    // 최대 한 바퀴만 돌아 전부 taken 이면 이동하지 않는다(무한 루프 가드).
    let next = index;
    for (let step = 0; step < slots.length; step++) {
      next = (next + dir + slots.length) % slots.length;
      if (!takenFlags[next]) break;
    }
    if (takenFlags[next]) return;
    onChange(slots[next].iso);
    btnRefs.current[next]?.focus();
  }

  const grid = (
    <div
      role="radiogroup"
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className="grid grid-cols-3 gap-2 sm:grid-cols-4"
    >
      {slots.map((slot, i) => {
        const selected = slot.iso === value;
        const taken = takenFlags[i];
        return (
          <button
            key={slot.iso}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${spokenTime(slot.label)}, ${taken ? "예약됨" : selected ? "선택됨" : "예약 가능"}`}
            disabled={taken}
            tabIndex={!taken && i === tabbableIndex ? 0 : -1}
            onClick={() => onChange(slot.iso)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              "rounded-md border py-2.5 text-center text-sm tabular-nums outline-none transition-colors",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              taken
                ? "cursor-not-allowed border-input bg-muted text-muted-foreground"
                : selected
                  ? "border-primary bg-primary font-semibold text-primary-foreground"
                  : "border-input bg-card hover:border-primary",
            )}
          >
            {taken ? (
              // 목업(booking.html) 스펙: 시각만 취소선, "예약됨" 라벨엔 취소선 없음(색만으로 구분 금지).
              <>
                <span className="line-through">{slot.label}</span>
                <small className="mt-0.5 block text-[10px] leading-none no-underline">
                  예약됨
                </small>
              </>
            ) : (
              slot.label
            )}
          </button>
        );
      })}
    </div>
  );

  // takenMs 미지정(기존 2상태 사용처)은 루트 구조까지 기존과 동일하게 유지 — 회귀 0 보장.
  if (!takenMs) return grid;

  return (
    <div className="space-y-2">
      {grid}
      {/* 범례(목업 스펙, UX-DR9 보조) — 상태 자체는 셀 내 텍스트·SR 라벨이 전달하므로 장식 취급. */}
      <div
        aria-hidden="true"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground"
      >
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm border border-input bg-card" />
          예약 가능
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm bg-primary" />
          선택됨
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm border border-input bg-muted" />
          예약됨(비활성)
        </span>
      </div>
    </div>
  );
}
