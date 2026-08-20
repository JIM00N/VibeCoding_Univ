import Link from "next/link";
import { login } from "@/app/actions";
import { getDb } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 로그인 화면에 버튼으로 노출할 계정 (PRD §2). 나머지 demo09~demo40 은 직접 입력.
const QUICK = ["demo01", "demo02", "demo03", "demo04", "demo05", "demo06", "demo07", "demo08"];

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const failed = one(sp.error) === "1";
  const reset = one(sp.reset) === "1";
  const next = one(sp.next) || "/";

  const { data } = await getDb()
    .from("users")
    .select("login_id, nickname")
    .in("login_id", QUICK)
    .order("login_id");

  const accounts = (data ?? []) as { login_id: string; nickname: string }[];

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="text-center">
        <span className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-blue-600 text-white text-xl font-bold">계</span>
        <h1 className="mt-3 text-2xl font-bold">계모임에 들어가기</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          임시계정으로 바로 들어오거나, 내 계정을 새로 만들 수 있어요.
        </p>
      </div>

      {reset && (
        <p className="mt-5 rounded-xl bg-blue-50 border border-blue-200 px-4 py-2.5 text-sm text-blue-800">
          비밀번호를 바꿨어요. 새 비밀번호로 로그인해주세요.
        </p>
      )}

      {accounts.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-slate-400 mb-2">임시계정 · 비밀번호는 전부 1234</p>
          <div className="grid grid-cols-2 gap-2">
            {accounts.map((a) => (
              <form key={a.login_id} action={login}>
                <input type="hidden" name="login_id" value={a.login_id} />
                <input type="hidden" name="password" value="1234" />
                <input type="hidden" name="next" value={next} />
                <button className="w-full h-11 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition text-left px-3">
                  <span className="block text-sm font-medium">{a.nickname}</span>
                  <span className="block text-[11px] text-slate-400">{a.login_id}</span>
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <div className="my-6 flex items-center gap-3 text-xs text-slate-300">
        <span className="flex-1 h-px bg-slate-200" />직접 입력<span className="flex-1 h-px bg-slate-200" />
      </div>

      <form action={login} className="space-y-2.5">
        <input type="hidden" name="next" value={next} />
        <input
          name="login_id"
          placeholder="아이디 (demo01 ~ demo40)"
          autoComplete="off"
          className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400"
        />
        <input
          name="password"
          type="password"
          placeholder="비밀번호 (1234)"
          className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400"
        />
        {failed && (
          <p className="text-sm text-red-600">
            아이디 또는 비밀번호가 달라요.{" "}
            <Link href="/forgot" className="underline">비밀번호 찾기</Link>
          </p>
        )}
        <button className="w-full h-11 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
          로그인
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        내 계정이 필요하다면{" "}
        <Link
          href={`/signup?next=${encodeURIComponent(next)}`}
          className="font-semibold text-blue-600 hover:underline"
        >
          회원가입
        </Link>
        {" · "}
        <Link href="/forgot" className="text-blue-600 hover:underline">비밀번호 찾기</Link>
      </p>

      <p className="mt-6 text-center text-xs text-slate-400">
        임시계정 40개(demo01~demo40)도 그대로 쓸 수 있어요.<br />
        <Link href="/" className="text-blue-600 hover:underline">로그인 없이 둘러보기</Link>
      </p>
    </div>
  );
}
