import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// service_role 키는 RLS 를 우회한다. 서버에서만 임포트할 것 — 클라이언트 컴포넌트에서 쓰면 브라우저 번들에 박힌다.
// (NEXT_PUBLIC_ 접두사가 없으므로 실수로 참조하면 undefined 가 되어 바로 터진다.)

let client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // 모듈 로드 시점이 아니라 첫 호출 시점에 던진다 — 환경변수가 없어도 빌드는 통과해야 하기 때문.
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없어요.");
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
