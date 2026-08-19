import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/session";
import { createEvent, deleteEvent, kickMember } from "@/app/actions";

export const dynamic = "force-dynamic";

type UserRef = { id: number; nickname: string };
type Embedded<T> = T | T[] | null;
function single<T>(v: Embedded<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type MemberRaw = { role: string; joined_at: string; users: Embedded<UserRef> };
type EventRaw = {
  id: number;
  title: string;
  starts_at: string;
  place: string;
  attendances: { user_id: number }[] | null;
};

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const joinFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
});

export default async function ManagePage({ params }: PageProps<"/groups/[id]/manage">) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId <= 0) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/groups/${groupId}/manage`)}`);

  const db = getDb();
  const { data: group } = await db
    .from("groups")
    .select("id, name, owner_id")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) notFound();

  // 모임장만 들어온다
  if (group.owner_id !== user.id) redirect(`/groups/${groupId}`);

  const [{ data: memberRows }, { data: eventRows }] = await Promise.all([
    db
      .from("memberships")
      .select("role, joined_at, users(id, nickname)")
      .eq("group_id", groupId)
      .order("role", { ascending: false })
      .order("joined_at", { ascending: true }),
    db
      .from("events")
      .select("id, title, starts_at, place, attendances(user_id)")
      .eq("group_id", groupId)
      .order("starts_at", { ascending: true }),
  ]);

  const members = ((memberRows ?? []) as unknown as MemberRaw[]).map((m) => ({
    role: m.role,
    joinedAt: m.joined_at,
    user: single(m.users),
  }));
  const events = ((eventRows ?? []) as unknown as EventRaw[]).map((e) => ({
    ...e,
    attendeeCount: (e.attendances ?? []).length,
  }));

  const field =
    "h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-400";

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <Link href={`/groups/${groupId}`} className="text-sm text-slate-400 hover:text-slate-700">
        ← {group.name}
      </Link>
      <h1 className="mt-3 text-2xl font-bold">모임 관리</h1>
      <p className="mt-1.5 text-sm text-slate-500">모임장만 볼 수 있는 화면이에요.</p>

      {/* 정모 관리 */}
      <section className="mt-5 rounded-2xl bg-white border border-slate-200 p-5">
        <h2 className="font-bold">정모 일정</h2>

        <form action={createEvent} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] items-end">
          <input type="hidden" name="group_id" value={groupId} />
          <div className="grid gap-2">
            <input name="title" placeholder="정모 제목" required maxLength={40} className={field} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="starts_at" type="datetime-local" required className={field} />
              <input name="place" placeholder="장소" required maxLength={40} className={field} />
            </div>
          </div>
          <button className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            정모 추가
          </button>
        </form>

        {events.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">아직 잡힌 정모가 없어요.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[15px] truncate">{e.title}</p>
                  <p className="mt-0.5 text-[13px] text-slate-500 truncate">
                    {dateFmt.format(new Date(e.starts_at))} · {e.place} · 참석 {e.attendeeCount}명
                  </p>
                </div>
                <form action={deleteEvent} className="shrink-0">
                  <input type="hidden" name="group_id" value={groupId} />
                  <input type="hidden" name="event_id" value={e.id} />
                  <button className="h-9 px-3 rounded-lg border border-slate-200 text-[13px] text-slate-500 hover:border-red-300 hover:text-red-600">
                    삭제
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 멤버 관리 */}
      <section className="mt-5 rounded-2xl bg-white border border-slate-200 p-5">
        <h2 className="font-bold">
          멤버 <span className="text-slate-400 font-normal">{members.length}</span>
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          내보낸 멤버는 정모 참석 기록도 함께 정리돼요. 다시 가입하는 건 막지 않아요.
        </p>

        <ul className="mt-3 divide-y divide-slate-100">
          {members.map((m, i) => (
            <li key={m.user?.id ?? i} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <span className="text-[15px]">{m.user?.nickname ?? "탈퇴한 회원"}</span>
                {m.role === "owner" && (
                  <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                    모임장
                  </span>
                )}
                <span className="ml-2 text-[12px] text-slate-400">
                  {joinFmt.format(new Date(m.joinedAt))} 가입
                </span>
              </div>
              {m.role === "owner" ? (
                <span className="text-[13px] text-slate-300 shrink-0">—</span>
              ) : (
                <form action={kickMember} className="shrink-0">
                  <input type="hidden" name="group_id" value={groupId} />
                  <input type="hidden" name="user_id" value={m.user?.id ?? 0} />
                  <button className="h-9 px-3 rounded-lg border border-slate-200 text-[13px] text-slate-500 hover:border-red-300 hover:text-red-600">
                    내보내기
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
