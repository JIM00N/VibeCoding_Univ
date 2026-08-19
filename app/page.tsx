import Link from "next/link";
import { CATEGORIES, REGIONS } from "@/lib/constants";
import { getDb } from "@/lib/supabase";
import { homeHref } from "@/lib/url";
import GroupCard, { type GroupCardData } from "@/components/group-card";

// 멤버 수가 새로고침마다 갱신돼야 한다 (데모 시나리오 6). 캐시하지 않는다.
export const dynamic = "force-dynamic";

type Row = {
  id: number;
  name: string;
  summary: string;
  category: string;
  region: string;
  memberships: { count: number }[] | null;
};

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const category = one(sp.category);
  const region = one(sp.region);
  const q = one(sp.q).trim();

  let query = getDb()
    .from("groups")
    .select("id, name, summary, category, region, memberships(count)")
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category", category);
  if (region) query = query.eq("region", region);
  if (q) {
    // PostgREST 의 or() 는 콤마·괄호로 조건을 구분한다 — 사용자 입력에서 구분자를 제거한다.
    const safe = q.replace(/[%,()*\\]/g, " ").trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,summary.ilike.%${safe}%`);
  }

  const { data, error } = await query;

  const groups: GroupCardData[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    summary: r.summary,
    category: r.category,
    region: r.region,
    memberCount: r.memberships?.[0]?.count ?? 0,
  }));

  const chip = (active: boolean) =>
    `shrink-0 h-8 px-3.5 rounded-full text-[13px] font-medium border transition ${
      active
        ? "bg-blue-600 border-blue-600 text-white"
        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
    }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      {/* 지역 — 모바일에선 가로 스크롤 */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <Link href={homeHref({ category, q })} className={chip(!region)}>모든 지역</Link>
        {REGIONS.map((r) => (
          <Link key={r} href={homeHref({ category, region: r, q })} className={chip(region === r)}>
            {r}
          </Link>
        ))}
      </div>

      {/* 카테고리 — 모바일 전용 가로 칩 */}
      <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar pb-1 lg:hidden">
        <Link href={homeHref({ region, q })} className={chip(!category)}>전체</Link>
        {CATEGORIES.map((c) => (
          <Link key={c.name} href={homeHref({ category: c.name, region, q })} className={chip(category === c.name)}>
            {c.emoji} {c.name}
          </Link>
        ))}
      </div>

      <div className="mt-5 flex gap-6">
        {/* 카테고리 — 데스크톱 사이드바 */}
        <aside className="hidden lg:block w-44 shrink-0">
          <p className="px-3 pb-2 text-xs font-semibold text-slate-400">카테고리</p>
          <nav className="space-y-0.5">
            <Link
              href={homeHref({ region, q })}
              className={`flex items-center gap-2 px-3 h-9 rounded-lg text-sm ${
                !category ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>📋</span> 전체
            </Link>
            {CATEGORIES.map((c) => (
              <Link
                key={c.name}
                href={homeHref({ category: c.name, region, q })}
                className={`flex items-center gap-2 px-3 h-9 rounded-lg text-sm ${
                  category === c.name ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>{c.emoji}</span> {c.name}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-xl font-bold">
              {q ? `"${q}" 검색 결과` : region ? `${region} 근처 모임` : "우리 동네 모임"}
            </h1>
            <span className="text-sm text-slate-400 shrink-0">{groups.length}개</span>
          </div>
          {(category || region || q) && (
            <p className="mt-1 text-[13px] text-slate-500">
              {[category, region, q && `검색: ${q}`].filter(Boolean).join(" · ")}
              <Link href="/" className="ml-2 text-blue-600 hover:underline">필터 해제</Link>
            </p>
          )}

          {error ? (
            <p className="mt-8 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              모임을 불러오지 못했어요. ({error.message})
            </p>
          ) : groups.length === 0 ? (
            <div className="mt-16 text-center">
              <p className="text-4xl">🫧</p>
              <p className="mt-3 text-slate-500 text-sm">조건에 맞는 모임이 아직 없어요.</p>
              <Link href="/groups/new" className="mt-4 inline-flex h-10 px-4 items-center rounded-lg bg-blue-600 text-white text-sm font-medium">
                첫 모임 만들기
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
