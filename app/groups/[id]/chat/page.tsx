import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/session";
import { categoryOf } from "@/lib/constants";
import ChatRoom, { type ChatMessage } from "@/components/chat-room";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  body: string;
  created_at: string;
  user_id: number;
  users: { nickname: string } | { nickname: string }[] | null;
};

export default async function ChatPage({ params }: PageProps<"/groups/[id]/chat">) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId <= 0) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/groups/${groupId}/chat`)}`);

  const db = getDb();
  const { data: group } = await db
    .from("groups")
    .select("id, name, category")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) notFound();

  const { data: membership } = await db
    .from("memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  // 멤버가 아니면 채팅에 못 들어온다 — 상세로 돌려보내 가입을 유도한다
  if (!membership) redirect(`/groups/${groupId}`);

  const { data } = await db
    .from("messages")
    .select("id, body, created_at, user_id, users(id, nickname)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    // 같은 초에 도착한 메시지의 순서가 폴링마다 바뀌지 않도록 id 로 tie-break
    .order("id", { ascending: true })
    .limit(200);

  const initial: ChatMessage[] = ((data ?? []) as unknown as Row[]).map((m) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    return {
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      userId: m.user_id,
      nickname: u?.nickname ?? "알 수 없음",
    };
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/groups/${groupId}`} className="text-sm text-slate-400 hover:text-slate-700">
          ← {group.name}
        </Link>
        <span className="text-[13px] text-slate-400">
          {categoryOf(group.category).emoji} 채팅방
        </span>
      </div>

      <div className="mt-3">
        <ChatRoom groupId={groupId} meId={user.id} initial={initial} />
      </div>
    </div>
  );
}
