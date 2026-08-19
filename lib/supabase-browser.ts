import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 브라우저용 클라이언트. publishable 키만 쓴다 — RLS 정책이 0개라 이 키로는 어떤 테이블도 읽을 수 없고,
// 용도는 Realtime 브로드캐스트 구독 하나뿐이다.

let client: SupabaseClient | null = null;

export function getBrowserClient(): SupabaseClient | null {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // 환경변수가 없으면 null 을 준다 — 채팅은 폴백 폴링으로 계속 동작한다.
  if (!url || !key) return null;

  client = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}
