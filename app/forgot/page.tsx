import Link from "next/link";
import { redirect } from "next/navigation";
import { resetPassword } from "@/app/actions";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot">) {
  // 로그인한 사람은 현재 비밀번호를 아는 사람이다 — 마이페이지의 변경 폼으로 보낸다.
  const user = await getCurrentUser();
  if (user) redirect("/me/edit");

  const sp = await searchParams;
  const error = one(sp.error);
  const loginId = one(sp.login_id);
  const email = one(sp.email);

  const field =
    "w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400";
  const help = "mt-1 text-[12px] text-slate-400";
  const bad = "mt-1 text-sm text-red-600";

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="text-center">
        <span className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-blue-600 text-white text-xl font-bold">계</span>
        <h1 className="mt-3 text-2xl font-bold">비밀번호 찾기</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          가입할 때 적은 <b>아이디와 이메일</b>이 맞으면 새 비밀번호를 바로 정할 수 있어요.
        </p>
      </div>

      <form action={resetPassword} className="mt-7 space-y-3">
        <div>
          <label className="block text-[13px] font-semibold mb-1.5">아이디</label>
          <input
            name="login_id"
            defaultValue={loginId}
            required
            maxLength={20}
            autoComplete="username"
            placeholder="가입할 때 정한 아이디"
            className={field}
          />
          {error === "demo" && (
            <p className={bad}>
              임시계정(demo01~demo40)은 바꿀 수 없어요. 여러 사람이 나눠 쓰는 계정이라, 한 명이 바꾸면
              같은 계정으로 들어오려던 다른 분이 막혀요. 비밀번호는 그대로 <code>1234</code>입니다.
            </p>
          )}
        </div>

        <div>
          <label className="block text-[13px] font-semibold mb-1.5">이메일</label>
          <input
            name="email"
            type="email"
            defaultValue={email}
            required
            maxLength={100}
            autoComplete="email"
            placeholder="가입할 때 적은 이메일"
            className={field}
          />
          {error === "nomatch" ? (
            <p className={bad}>아이디와 이메일이 맞지 않아요.</p>
          ) : error === "input" ? (
            <p className={bad}>아이디와 이메일을 모두 제대로 적어주세요.</p>
          ) : (
            <p className={help}>메일을 보내지는 않아요. 적어둔 값과 같은지만 대조합니다.</p>
          )}
        </div>

        <div>
          <label className="block text-[13px] font-semibold mb-1.5">새 비밀번호</label>
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
          <label className="block text-[13px] font-semibold mb-1.5">새 비밀번호 확인</label>
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

        <button className="w-full h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
          비밀번호 바꾸기
        </button>
      </form>

      <p className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] text-amber-900 leading-relaxed">
        ⚠️ 데모용이라 <b>메일 발송·본인 인증이 없어요.</b> 아이디와 이메일을 아는 사람은 비밀번호를 바꿀 수 있으니,
        평소에 쓰는 비밀번호는 넣지 말아주세요.
      </p>

      <p className="mt-6 text-center text-xs text-slate-400">
        <Link href="/login" className="text-blue-600 hover:underline">로그인으로 돌아가기</Link>
        {" · "}
        <Link href="/signup" className="text-blue-600 hover:underline">회원가입</Link>
      </p>
    </div>
  );
}
