import Link from "next/link";
import { redirect } from "next/navigation";
import { signup } from "@/app/actions";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  // 이미 로그인한 사람에게 가입 폼을 보여줄 이유가 없다.
  const user = await getCurrentUser();
  if (user) redirect("/me");

  const sp = await searchParams;
  const error = one(sp.error);
  const next = one(sp.next) || "/";
  const loginId = one(sp.login_id);
  const nickname = one(sp.nickname);

  const field =
    "w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400";
  const help = "mt-1 text-[12px] text-slate-400";
  const bad = "mt-1 text-sm text-red-600";

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="text-center">
        <span className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-blue-600 text-white text-xl font-bold">계</span>
        <h1 className="mt-3 text-2xl font-bold">계모임 회원가입</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          아이디·비밀번호·닉네임만 있으면 돼요. 가입하면 바로 로그인됩니다.
        </p>
      </div>

      <form action={signup} className="mt-7 space-y-3">
        <input type="hidden" name="next" value={next} />

        <div>
          <label className="block text-[13px] font-semibold mb-1.5">아이디</label>
          <input
            name="login_id"
            defaultValue={loginId}
            required
            minLength={4}
            maxLength={20}
            autoComplete="username"
            placeholder="영문 소문자·숫자·밑줄 4~20자"
            className={field}
          />
          {error === "id" ? (
            <p className={bad}>아이디는 영문 소문자·숫자·밑줄(_)로 4~20자예요.</p>
          ) : error === "taken" ? (
            <p className={bad}>이미 누군가 쓰고 있는 아이디예요. 다른 아이디로 해주세요.</p>
          ) : (
            <p className={help}>로그인할 때 쓰는 이름이에요. 나중에 바꿀 수 없어요.</p>
          )}
        </div>

        <div>
          <label className="block text-[13px] font-semibold mb-1.5">비밀번호</label>
          <input
            name="password"
            type="password"
            required
            minLength={4}
            maxLength={30}
            autoComplete="new-password"
            placeholder="4~30자"
            className={field}
          />
          {error === "pw" && <p className={bad}>비밀번호는 4~30자로 적어주세요.</p>}
        </div>

        <div>
          <label className="block text-[13px] font-semibold mb-1.5">비밀번호 확인</label>
          <input
            name="password_confirm"
            type="password"
            required
            minLength={4}
            maxLength={30}
            autoComplete="new-password"
            placeholder="한 번 더 입력해주세요"
            className={field}
          />
          {error === "pw2" && <p className={bad}>비밀번호 두 개가 서로 달라요.</p>}
        </div>

        <div>
          <label className="block text-[13px] font-semibold mb-1.5">닉네임</label>
          <input
            name="nickname"
            defaultValue={nickname}
            required
            maxLength={20}
            placeholder="모임에서 보일 이름"
            className={field}
          />
          {error === "nickname" ? (
            <p className={bad}>닉네임은 1~20자로 적어주세요.</p>
          ) : (
            <p className={help}>멤버 목록·채팅에 이 이름으로 보여요. 마이페이지에서 바꿀 수 있어요.</p>
          )}
        </div>

        {error === "db" && (
          <p className={bad}>가입에 실패했어요. 잠시 뒤에 다시 눌러주세요.</p>
        )}

        <button className="w-full h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
          가입하고 시작하기
        </button>
      </form>

      <p className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] text-amber-900 leading-relaxed">
        ⚠️ 데모용 서비스라 비밀번호를 <b>그대로 저장</b>해요. 평소에 쓰는 비밀번호는 넣지 말아주세요.
      </p>

      <p className="mt-6 text-center text-xs text-slate-400">
        이미 계정이 있나요?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-blue-600 hover:underline">
          로그인하기
        </Link>
        <br />
        구경만 하고 싶다면{" "}
        <Link href="/" className="text-blue-600 hover:underline">모임 둘러보기</Link>
      </p>
    </div>
  );
}
