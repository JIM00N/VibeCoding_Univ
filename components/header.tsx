import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { logout } from "@/app/actions";
import SearchBar from "./search-bar";
import MobileMenu from "./mobile-menu";

export default async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-3 sm:gap-5">
        <Link href="/" className="flex items-center gap-1.5 shrink-0">
          <span className="grid place-items-center w-7 h-7 rounded-lg bg-blue-600 text-white text-sm font-bold">계</span>
          <span className="text-lg font-bold tracking-tight hidden sm:inline">계모임</span>
        </Link>

        <Suspense fallback={<div className="flex-1" />}>
          <SearchBar />
        </Suspense>

        {/* 계정 동선 — 모바일에선 자리가 없어 ☰ 메뉴가 대신한다 */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {user ? (
            <>
              <Link
                href="/groups/new"
                className="inline-flex items-center h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                모임 만들기
              </Link>
              <Link href="/me" className="text-sm text-slate-600 hover:text-blue-700">
                {user.nickname}님
              </Link>
              <form action={logout}>
                <button className="h-9 px-3 rounded-lg text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              로그인
            </Link>
          )}
        </div>

        <Suspense fallback={<div className="w-10 sm:hidden" />}>
          <MobileMenu loggedIn={!!user} nickname={user?.nickname ?? null} logout={logout} />
        </Suspense>
      </div>
    </header>
  );
}
