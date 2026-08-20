import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/session";
import GroupCard, { type GroupCardData } from "@/components/group-card";

export const dynamic = "force-dynamic";

type GroupRow = {
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

export default async function MyPage({ searchParams }: PageProps<"/me">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fme");

  const sp = await searchParams;
  const saved = one(sp.saved);

  const db = getDb();
  const { data: profile } = await db
    .from("users")
    .select("login_id, nickname, bio")
    .eq("id", user.id)
    .maybeSingle();

  const { data: memberRows } = await db
    .from("memberships")
    .select("group_id, role, joined_at")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const memberships = (memberRows ?? []) as { group_id: number; role: string }[];
  const groupIds = memberships.map((m) => m.group_id);
  const roleOf = new Map(memberships.map((m) => [m.group_id, m.role]));

  let groups: GroupCardData[] = [];
  if (groupIds.length > 0) {
    const { data } = await db
      .from("groups")
      .select("id, name, summary, category, region, memberships(count)")
      .in("id", groupIds);

    groups = ((data ?? []) as GroupRow[]).map((g) => ({
      id: g.id,
      name: g.name,
      summary: g.summary,
      category: g.category,
      region: g.region,
      memberCount: g.memberships?.[0]?.count ?? 0,
    }));
    // 내가 만든 모임을 먼저 (가입 순서는 memberships 조회 순서를 따른다)
    const order = new Map(groupIds.map((id, i) => [id, i]));
    groups.sort((a, b) => {
      const ao = roleOf.get(a.id) === "owner" ? 0 : 1;
      const bo = roleOf.get(b.id) === "owner" ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });
  }

  const ownedCount = memberships.filter((m) => m.role === "owner").length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {(saved === "1" || saved === "pw") && (
        <p className="mb-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-2.5 text-sm text-blue-800">
          {saved === "pw" ? "비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 써주세요." : "프로필을 저장했어요."}
        </p>
      )}

      {/* 프로필 */}
      <section className="rounded-2xl bg-white border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{profile?.nickname ?? user.nickname}</h1>
            <p className="mt-0.5 text-[13px] text-slate-400">{profile?.login_id ?? user.login_id}</p>
            <p className="mt-2 text-sm text-slate-600">
              {profile?.bio ? profile.bio : <span className="text-slate-300">한 줄 소개가 아직 없어요</span>}
            </p>
          </div>
          <Link
            href="/me/edit"
            className="shrink-0 inline-flex items-center h-9 px-3.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:border-slate-300"
          >
            프로필 수정
          </Link>
        </div>
        <p className="mt-4 text-[13px] text-slate-500">
          가입한 모임 <b className="text-slate-800">{groups.length}</b>개
          {ownedCount > 0 && <> · 내가 만든 모임 <b className="text-slate-800">{ownedCount}</b>개</>}
        </p>
      </section>

      {/* 가입한 모임 */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">내 모임</h2>
          <Link href="/" className="text-[13px] text-blue-600 hover:underline">모임 더 둘러보기</Link>
        </div>

        {groups.length === 0 ? (
          <div className="mt-8 text-center">
            <p className="text-4xl">🫧</p>
            <p className="mt-3 text-slate-500 text-sm">아직 가입한 모임이 없어요.</p>
            <Link
              href="/"
              className="mt-4 inline-flex h-10 px-4 items-center rounded-lg bg-blue-600 text-white text-sm font-medium"
            >
              모임 둘러보기
            </Link>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <div key={g.id} className="relative">
                {roleOf.get(g.id) === "owner" && (
                  <span className="absolute z-10 top-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-white/90 text-blue-700 font-semibold">
                    모임장
                  </span>
                )}
                <GroupCard group={g} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
