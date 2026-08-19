import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/session";
import { categoryOf, coverStyle } from "@/lib/constants";
import { joinGroup, leaveGroup, createEvent, toggleAttend } from "@/app/actions";

export const dynamic = "force-dynamic";

type UserRef = { id: number; nickname: string };
/** supabase-js 는 생성된 타입이 없으면 many-to-one 임베드도 배열로 추론한다.
 *  PostgREST 의 실제 응답은 객체이므로 양쪽을 다 받아 정규화한다. */
type Embedded<T> = T | T[] | null;

function single<T>(v: Embedded<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type MemberRaw = { role: string; users: Embedded<UserRef> };
type AttendanceRaw = { user_id: number; users: Embedded<UserRef> };
type EventRaw = {
  id: number;
  title: string;
  starts_at: string;
  place: string;
  attendances: AttendanceRaw[] | null;
};

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId <= 0) notFound();

  const db = getDb();
  const user = await getCurrentUser();

  const { data: group } = await db
    .from("groups")
    .select("id, name, summary, description, category, region, owner_id, owner:users(id, nickname)")
    .eq("id", groupId)
    .maybeSingle();

  if (!group) notFound();

  const [{ data: memberRows }, { data: eventRows }] = await Promise.all([
    db
      .from("memberships")
      .select("role, users(id, nickname)")
      .eq("group_id", groupId)
      .order("role", { ascending: false })
      .order("joined_at", { ascending: true }),
    db
      .from("events")
      .select("id, title, starts_at, place, attendances(user_id, users(id, nickname))")
      .eq("group_id", groupId)
      .order("starts_at", { ascending: true }),
  ]);

  const members = ((memberRows ?? []) as unknown as MemberRaw[]).map((m) => ({
    role: m.role,
    user: single(m.users),
  }));

  const events = ((eventRows ?? []) as unknown as EventRaw[]).map((e) => ({
    id: e.id,
    title: e.title,
    starts_at: e.starts_at,
    place: e.place,
    attendees: (e.attendances ?? []).map((a) => ({ userId: a.user_id, user: single(a.users) })),
  }));

  const isOwner = !!user && user.id === group.owner_id;
  const isMember = !!user && members.some((m) => m.user?.id === user.id);
  const c = categoryOf(group.category);
  const ownerName = single(group.owner as Embedded<UserRef>)?.nickname ?? "알 수 없음";

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <Link href="/" className="text-sm text-slate-400 hover:text-slate-700">← 목록으로</Link>

      <div className="mt-3 rounded-2xl overflow-hidden bg-white border border-slate-200">
        <div className="aspect-[21/9] grid place-items-center text-6xl" style={coverStyle(group.category)}>
          <span className="drop-shadow-sm">{c.emoji}</span>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
            <span>{group.category}</span><span>·</span><span>{group.region}</span>
            <span>·</span><span>멤버 {members.length}</span>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold leading-tight">{group.name}</h1>
          <p className="mt-1.5 text-slate-600">{group.summary}</p>
          <p className="mt-1 text-[13px] text-slate-400">모임장 {ownerName}</p>

          {group.description && (
            <p className="mt-4 text-[15px] text-slate-700 whitespace-pre-line leading-relaxed">
              {group.description}
            </p>
          )}

          <div className="mt-5">
            {!user ? (
              <Link
                href={`/login?next=${encodeURIComponent(`/groups/${groupId}`)}`}
                className="inline-flex items-center justify-center w-full sm:w-auto h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              >
                로그인하고 가입하기
              </Link>
            ) : isOwner ? (
              <span className="inline-flex items-center h-11 px-4 rounded-xl bg-slate-100 text-slate-500 text-sm">
                내가 만든 모임이에요
              </span>
            ) : isMember ? (
              <form action={leaveGroup}>
                <input type="hidden" name="group_id" value={groupId} />
                <button className="w-full sm:w-auto h-11 px-6 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:border-red-300 hover:text-red-600">
                  탈퇴하기
                </button>
              </form>
            ) : (
              <form action={joinGroup}>
                <input type="hidden" name="group_id" value={groupId} />
                <button className="w-full sm:w-auto h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
                  가입하기
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* 정모 일정 (FR-11~13) */}
      <section className="mt-5 rounded-2xl bg-white border border-slate-200 p-5">
        <h2 className="font-bold">정모 일정</h2>

        {events.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">아직 잡힌 정모가 없어요.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {events.map((e) => {
              const attending = !!user && e.attendees.some((a) => a.userId === user.id);
              const names = e.attendees.map((a) => a.user?.nickname).filter(Boolean).join(", ");
              return (
                <li key={e.id} className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[15px]">{e.title}</p>
                      <p className="mt-0.5 text-[13px] text-slate-500">
                        {dateFmt.format(new Date(e.starts_at))} · {e.place}
                      </p>
                      <p className="mt-1 text-[12px] text-slate-400 line-clamp-1">
                        참석 {e.attendees.length}명{names && ` · ${names}`}
                      </p>
                    </div>
                    {isMember || isOwner ? (
                      <form action={toggleAttend} className="shrink-0">
                        <input type="hidden" name="event_id" value={e.id} />
                        <input type="hidden" name="group_id" value={groupId} />
                        <button
                          className={`h-9 px-3.5 rounded-lg text-[13px] font-semibold ${
                            attending
                              ? "border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600"
                              : "bg-blue-600 text-white hover:bg-blue-700"
                          }`}
                        >
                          {attending ? "참석 취소" : "참석 신청"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {isOwner && (
          <form action={createEvent} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input type="hidden" name="group_id" value={groupId} />
            <div className="grid gap-2">
              <input name="title" placeholder="정모 제목" required
                className="h-10 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400" />
              <div className="grid gap-2 sm:grid-cols-2">
                <input name="starts_at" type="datetime-local" required
                  className="h-10 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400" />
                <input name="place" placeholder="장소" required
                  className="h-10 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400" />
              </div>
            </div>
            <button className="h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold self-end">
              정모 추가
            </button>
          </form>
        )}
      </section>

      {/* 멤버 */}
      <section className="mt-5 rounded-2xl bg-white border border-slate-200 p-5">
        <h2 className="font-bold">멤버 <span className="text-slate-400 font-normal">{members.length}</span></h2>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {members.map((m, i) => (
            <li
              key={m.user?.id ?? i}
              className={`px-2.5 h-8 inline-flex items-center rounded-full text-[13px] ${
                m.role === "owner"
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : user && m.user?.id === user.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {m.user?.nickname ?? "탈퇴한 회원"}
              {m.role === "owner" && <span className="ml-1 text-[11px]">모임장</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
