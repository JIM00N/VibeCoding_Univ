"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 모바일 하단 탭 — 좁은 화면에선 헤더에 검색창까지밖에 못 넣는다.
 *  "모임 만들기"·"내 정보"가 헤더에서 사라져 아예 실행할 수 없던 걸 여기서 되살린다.
 *  sm(640px) 이상은 헤더가 같은 링크를 들고 있으니 숨긴다. */
export default function MobileNav({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();

  const items = [
    { href: "/", label: "홈", icon: <HomeIcon />, active: pathname === "/" },
    {
      href: "/groups/new",
      label: "모임 만들기",
      icon: <PlusIcon />,
      active: pathname === "/groups/new",
    },
    loggedIn
      ? { href: "/me", label: "내 정보", icon: <UserIcon />, active: pathname.startsWith("/me") }
      : { href: "/login", label: "로그인", icon: <UserIcon />, active: pathname === "/login" },
  ];

  return (
    <nav
      aria-label="주요 메뉴"
      className="sm:hidden fixed inset-x-0 bottom-0 z-30 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex">
        {items.map((it) => (
          <li key={it.href} className="flex-1">
            <Link
              href={it.href}
              aria-current={it.active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-medium ${
                it.active ? "text-blue-600" : "text-slate-400"
              }`}
            >
              {it.icon}
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const icon = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function HomeIcon() {
  return (
    <svg {...icon} aria-hidden>
      <path d="M3 10.5 12 3.5l9 7" />
      <path d="M5.5 9.8V20h13V9.8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg {...icon} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg {...icon} aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  );
}
