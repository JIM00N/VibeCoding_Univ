import { getDb } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/session";

// 채팅은 3초 폴링으로 갱신한다 (Supabase Realtime 미사용 — anon 키 노출과 RLS 개방을 피하려고. D-11)
export const dynamic = "force-dynamic";

const LIMIT = 200;
const MAX_BODY = 500;

type Ctx = RouteContext<"/api/groups/[id]/messages">;

/** 그 모임 멤버만 채팅을 읽고 쓸 수 있다. */
async function gate(ctx: Ctx) {
  const { id } = await ctx.params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return { error: Response.json({ error: "잘못된 모임이에요." }, { status: 400 }) };
  }

  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "로그인이 필요해요." }, { status: 401 }) };

  const db = getDb();
  const { data: membership } = await db
    .from("memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { error: Response.json({ error: "모임 멤버만 참여할 수 있어요." }, { status: 403 }) };
  }

  return { groupId, user, db };
}

export async function GET(_req: Request, ctx: Ctx) {
  const g = await gate(ctx);
  if (g.error) return g.error;

  const { data } = await g.db!
    .from("messages")
    .select("id, body, created_at, user_id, users(id, nickname)")
    .eq("group_id", g.groupId!)
    .order("created_at", { ascending: true })
    // 같은 초에 도착한 메시지의 순서가 폴링마다 바뀌지 않도록 id 로 tie-break
    .order("id", { ascending: true })
    .limit(LIMIT);

  type Row = {
    id: number;
    body: string;
    created_at: string;
    user_id: number;
    users: { nickname: string } | { nickname: string }[] | null;
  };

  const messages = ((data ?? []) as unknown as Row[]).map((m) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    return {
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      userId: m.user_id,
      nickname: u?.nickname ?? "알 수 없음",
    };
  });

  return Response.json({ messages });
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await gate(ctx);
  if (g.error) return g.error;

  let body = "";
  try {
    const json = (await req.json()) as { body?: unknown };
    body = String(json.body ?? "").trim();
  } catch {
    return Response.json({ error: "본문을 읽지 못했어요." }, { status: 400 });
  }

  if (!body) return Response.json({ error: "내용을 입력해주세요." }, { status: 400 });

  const { error } = await g.db!
    .from("messages")
    .insert({ group_id: g.groupId!, user_id: g.user!.id, body: body.slice(0, MAX_BODY) });

  if (error) return Response.json({ error: "전송에 실패했어요." }, { status: 500 });

  return Response.json({ ok: true });
}
