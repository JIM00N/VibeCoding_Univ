import { CHAT_EVENT, chatTopic } from "./chat-channel";

// 서버 전용. Supabase Realtime 의 REST 브로드캐스트로 "새 메시지 왔다"는 신호만 쏜다.
//
// ⚠️ 페이로드에 메시지 본문을 담지 않는다. 채널은 공개(public)라 비멤버도 구독할 수 있지만,
//    내용은 인증된 GET /api/groups/[id]/messages 로만 나가므로 엿들어도 얻는 게 없다.
//    덕분에 RLS 정책을 0개로 유지할 수 있다 (D-10 유지).

export async function broadcastNewMessage(groupId: number): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    await fetch(`${url}/realtime/v1/api/broadcast/${chatTopic(groupId)}/events/${CHAT_EVENT}`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ groupId }),
    });
  } catch {
    // 브로드캐스트 실패는 치명적이 아니다 — 클라이언트의 폴백 폴링이 받아낸다.
  }
}
