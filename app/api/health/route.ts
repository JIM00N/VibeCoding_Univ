import { getDb } from "@/lib/supabase";

// 배포 진단용. 값은 절대 내보내지 않고 "있다/없다"와 오류 메시지만 노출한다.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const report: Record<string, unknown> = {
    hasSupabaseUrl: !!url,
    hasServiceRoleKey: !!key,
    urlHost: url ? url.replace(/^https?:\/\//, "").split("/")[0] : null,
    keyLength: key ? key.length : 0,
    runtime: process.version,
    // 채팅 소켓용 공개 환경변수 (없으면 채팅이 폴링으로 강등된다)
    hasPublicSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasPublishableKey: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };

  if (url && key) {
    try {
      const { count, error } = await getDb()
        .from("groups")
        .select("id", { count: "exact", head: true });
      report.db = error ? "error" : "ok";
      report.groupCount = count ?? null;
      if (error) report.dbError = error.message;
    } catch (e) {
      report.db = "throw";
      report.dbError = e instanceof Error ? e.message : String(e);
    }
  } else {
    report.db = "skipped";
  }

  return Response.json(report);
}
