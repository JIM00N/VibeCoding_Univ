"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/constants";
import { homeHref } from "@/lib/url";

/** 모바일 상단 메뉴 — 좁은 화면에선 헤더에 검색창까지밖에 안 들어간다.
 *  카테고리(사이드바가 lg 미만에서 사라진다)와 계정 동선을 여기 모아 편다.
 *  sm(640px) 이상은 헤더·사이드바가 같은 걸 들고 있으니 버튼째 숨긴다. */
export default function MobileMenu({
  loggedIn,
  nickname,
  logout,
}: {
  loggedIn: boolean;
  nickname: string | null;
  logout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const sp = useSearchParams();

  // 검색은 필터를 지우지 않는다(FR-9) — 카테고리를 바꿔도 지역·검색어는 들고 간다.
  const region = sp.get("region") ?? "";
  const q = sp.get("q") ?? "";
  const current = sp.get("category") ?? "";
  const onHome = pathname === "/";

  // 경로가 바뀌면 닫는다 — 링크마다 onClick 으로도 닫지만 뒤로가기는 그걸로 안 잡힌다.
  // sp 객체는 렌더마다 새로 올 수 있어 문자열로 비교한다. 렌더 중 조정이라 effect 를 안 쓴다.
  const routeKey = `${pathname}?${sp.toString()}`;
  const [seenRoute, setSeenRoute] = useState(routeKey);
  if (seenRoute !== routeKey) {
    setSeenRoute(routeKey);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 패널이 화면 밖으로 넘치면 아래쪽 항목(로그아웃)에 손이 닿지 않는다.
  // 헤더 위 안내 배너가 폭에 따라 한 줄/두 줄이라 높이를 상수로 못 뺀다 — 실측해서 맞춘다.
  useEffect(() => {
    if (!open) return;
    const fit = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const top = panel.getBoundingClientRect().top;
      const rest = Math.max(0, window.innerHeight - top);
      panel.style.maxHeight = `${rest}px`;
      if (backdropRef.current) backdropRef.current.style.height = `${rest}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, { passive: true });
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit);
    };
  }, [open]);

  const item = "flex items-center gap-2 h-11 px-3 rounded-lg text-sm";

  return (
    <div className="sm:hidden shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-menu-panel"
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        className="grid place-items-center w-10 h-10 -mr-1 rounded-lg text-slate-600 hover:bg-slate-100"
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      {open && (
        <>
          {/* 바깥을 누르면 닫힌다. 헤더 바로 아래부터 깔아야 ☰ 가 계속 눌린다 —
              헤더는 sticky 라 배너 때문에 y 가 변한다. top-full 로 따라붙인다. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            ref={backdropRef}
            onClick={() => setOpen(false)}
            className="absolute z-10 left-0 right-0 top-full h-[100dvh] bg-slate-900/20 cursor-default"
          />

          <div
            id="mobile-menu-panel"
            ref={panelRef}
            className="absolute z-20 left-0 right-0 top-full max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain bg-white border-b border-slate-200 shadow-lg"
          >
            <div className="px-4 py-3">
              <p className="px-3 pb-1.5 text-xs font-semibold text-slate-400">카테고리</p>
              <div className="grid grid-cols-2 gap-x-2">
                <Link
                  href={homeHref({ region, q })}
                  onClick={() => setOpen(false)}
                  className={`${item} ${
                    onHome && !current ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600"
                  }`}
                >
                  <span>📋</span> 전체
                </Link>
                {CATEGORIES.map((c) => (
                  <Link
                    key={c.name}
                    href={homeHref({ category: c.name, region, q })}
                    onClick={() => setOpen(false)}
                    className={`${item} ${
                      onHome && current === c.name
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-slate-600"
                    }`}
                  >
                    <span className="shrink-0">{c.emoji}</span>
                    <span className="truncate">{c.name}</span>
                  </Link>
                ))}
              </div>

              <div className="my-2 border-t border-slate-100" />

              {loggedIn ? (
                <div className="grid">
                  <Link
                    href="/groups/new"
                    onClick={() => setOpen(false)}
                    className={`${item} font-semibold text-blue-700`}
                  >
                    <span>＋</span> 모임 만들기
                  </Link>
                  <Link
                    href="/me"
                    onClick={() => setOpen(false)}
                    className={`${item} text-slate-600`}
                  >
                    <span>👤</span> 내 정보{nickname && ` · ${nickname}님`}
                  </Link>
                  <form action={logout}>
                    <button className={`${item} w-full text-slate-400`}>
                      <span>↪</span> 로그아웃
                    </button>
                  </form>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className={`${item} font-semibold text-blue-700`}
                >
                  <span>👤</span> 로그인
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const icon = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
} as const;

function MenuIcon() {
  return (
    <svg {...icon} aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...icon} aria-hidden>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
