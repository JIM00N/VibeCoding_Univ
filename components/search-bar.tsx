"use client";

import { useSearchParams } from "next/navigation";

/** 검색은 필터를 지우지 않는다 — 현재 카테고리·지역을 hidden 으로 실어 보낸다. */
export default function SearchBar() {
  const sp = useSearchParams();
  const category = sp.get("category") ?? "";
  const region = sp.get("region") ?? "";
  const q = sp.get("q") ?? "";

  return (
    <form action="/" method="get" className="flex-1 min-w-0">
      {category && <input type="hidden" name="category" value={category} />}
      {region && <input type="hidden" name="region" value={region} />}
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 h-10 focus-within:border-blue-400 focus-within:bg-white transition">
        <input
          name="q"
          defaultValue={q}
          placeholder="찾고 싶은 모임을 검색해보세요"
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
        <button type="submit" aria-label="검색" className="text-slate-400 hover:text-blue-600 shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </form>
  );
}
