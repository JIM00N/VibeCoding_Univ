"use client";

// 직원 좌측 사이드바 셸 (Story 6.2, UX-DR12). 홈 카드 3장을 내비로 재배치(add-only, 신규 기능 0).
// 활성 판정은 usePathname()(useSearchParams 아님 — Suspense·프리렌더 이슈 없음).
// ≥md 세로 고정 레일 · 모바일은 항상 보이는 하단 가로 탭 바(코드리뷰+실측 피드백: 드로어는 발견성 나빠 폐기).
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// 3 내비 대상 = 기존 직원 라우트. 예약관리 강조는 "진입 시 기본 활성"으로(/staff→예약관리 리다이렉트).
const NAV_ITEMS = [
  { href: "/staff/appointments", label: "예약 관리" },
  { href: "/staff/patients/new", label: "신규 환자 등록" },
  { href: "/staff/patients", label: "환자 목록·검색" },
] as const;

// 현재 경로가 어느 항목에 속하는지 — 상호배타. 예약관리=startsWith, 신규 등록=정확 일치,
// 환자 목록=patients 하위(목록·[id] 상세) 중 /new 제외.
function isActive(href: string, pathname: string): boolean {
  if (href === "/staff/appointments") return pathname.startsWith("/staff/appointments");
  if (href === "/staff/patients/new") return pathname === "/staff/patients/new";
  if (href === "/staff/patients") {
    return pathname.startsWith("/staff/patients") && pathname !== "/staff/patients/new";
  }
  return false;
}

export function StaffSidebar() {
  const pathname = usePathname();

  // 직원·의사 공유 폼(기록/처방전 — 6.1 ?from=doctor)에는 셸을 걸지 않는다(AC5). null이면 콘텐츠 풀폭.
  if (/\/(record|prescription)$/.test(pathname)) return null;

  // 항목은 레일·하단 바 두 곳에서 렌더. 활성=emerald 알약, 비활성=검은 글씨(선택 안 된 메뉴엔 강조색 안 씀).
  const renderLinks = (extra = "") =>
    NAV_ITEMS.map((item) => {
      const active = isActive(item.href, pathname);
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            active
              ? "bg-primary text-primary-foreground" // 활성 = Primary Emerald(#047857)
              : "text-foreground hover:bg-accent", // 비활성 = 검은 글씨
            extra,
          )}
        >
          {item.label}
        </Link>
      );
    });

  return (
    <>
      {/* ≥md: 세로 고정 좌측 레일 */}
      <aside className="hidden w-56 shrink-0 border-r bg-sidebar md:sticky md:top-0 md:flex md:h-screen md:flex-col md:gap-4 md:p-4">
        <div className="px-3 text-xs font-semibold text-muted-foreground">직원 메뉴</div>
        <nav className="flex flex-col gap-1" aria-label="직원 메뉴">
          {renderLinks()}
        </nav>
      </aside>

      {/* <md: 하단 고정 가로 탭 바 — 좁은 화면에서도 항상 보인다. print 제외. */}
      <nav
        aria-label="직원 메뉴"
        className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t bg-background px-2 py-1.5 md:hidden print:hidden"
      >
        {renderLinks("flex-1 text-center text-xs")}
      </nav>
    </>
  );
}
