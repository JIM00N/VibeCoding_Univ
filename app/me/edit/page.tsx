import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/session";
import { updateProfile, changePassword, deleteAccount } from "@/app/actions";
import { isSeedAccount } from "@/lib/constants";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function EditProfilePage({ searchParams }: PageProps<"/me/edit">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fme%2Fedit");

  const sp = await searchParams;
  const error = one(sp.error);

  const db = getDb();
  const { data: profile } = await db
    .from("users")
    .select("login_id, nickname, bio, email")
    .eq("id", user.id)
    .maybeSingle();

  const { data: memberRows } = await db
    .from("memberships")
    .select("role")
    .eq("user_id", user.id);

  const joined = (memberRows ?? []) as { role: string }[];
  const ownedCount = joined.filter((m) => m.role === "owner").length;

  const loginId = profile?.login_id ?? user.login_id;
  const seedAccount = isSeedAccount(loginId);
  const email = (profile?.email as string | null) ?? "";

  const field =
    "w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400";

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link href="/me" className="text-sm text-slate-400 hover:text-slate-700">← 마이페이지</Link>
      <h1 className="mt-3 text-2xl font-bold">프로필 수정</h1>

      <form action={updateProfile} className="mt-6 space-y-3">
        <div>
          <label className="block text-[13px] font-semibold mb-1.5">아이디</label>
          <input
            value={loginId}
            disabled
            className={`${field} bg-slate-50 text-slate-400`}
          />
          <p className="mt-1 text-[12px] text-slate-400">아이디는 바꿀 수 없어요.</p>
        </div>

        <div>
          <label className="block text-[13px] font-semibold mb-1.5">닉네임</label>
          <input
            name="nickname"
            defaultValue={profile?.nickname ?? user.nickname}
            required
            maxLength={20}
            className={field}
          />
          {error === "nickname" && (
            <p className="mt-1 text-sm text-red-600">닉네임은 1~20자로 적어주세요.</p>
          )}
        </div>

        <div>
          <label className="block text-[13px] font-semibold mb-1.5">
            한 줄 소개 <span className="text-slate-400 font-normal">(선택)</span>
          </label>
          <input
            name="bio"
            defaultValue={profile?.bio ?? ""}
            maxLength={100}
            placeholder="어떤 사람인지 짧게 적어주세요"
            className={field}
          />
        </div>

        {!seedAccount && (
          <div>
            <label className="block text-[13px] font-semibold mb-1.5">이메일</label>
            <input
              name="email"
              type="email"
              defaultValue={email}
              required
              maxLength={100}
              autoComplete="email"
              placeholder="you@example.com"
              className={field}
            />
            {error === "email" ? (
              <p className="mt-1 text-sm text-red-600">이메일 형식이 아니에요. `이름@도메인` 꼴로 적어주세요.</p>
            ) : email ? (
              <p className="mt-1 text-[12px] text-slate-400">
                비밀번호를 잊었을 때 <Link href="/forgot" className="text-blue-600 hover:underline">찾기</Link>에 쓰는 값이에요. 메일은 보내지 않아요.
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-amber-700">
                아직 이메일이 없어요. <b>지금 등록하지 않으면 비밀번호를 잊었을 때 찾을 수 없어요.</b>
              </p>
            )}
          </div>
        )}

        <button className="w-full h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
          저장하기
        </button>
      </form>

      {/* 비밀번호 변경 — 임시계정은 막는다(D-12) */}
      <section className="mt-10">
        <h2 className="font-bold">비밀번호 변경</h2>

        {seedAccount ? (
          <p className="mt-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-[13px] text-slate-500 leading-relaxed">
            임시계정(<code className="px-1 bg-slate-100 rounded">{loginId}</code>)은 비밀번호를 바꿀 수 없어요.
            여러 사람이 나눠 쓰는 계정이라, 한 명이 바꾸면 같은 계정으로 들어오려던 다른 분이 막히거든요.{" "}
            <Link href="/signup" className="text-blue-600 hover:underline">내 계정을 만들면</Link> 바꿀 수 있어요.
          </p>
        ) : (
          <form action={changePassword} className="mt-3 space-y-3">
            <div>
              <label className="block text-[13px] font-semibold mb-1.5">현재 비밀번호</label>
              <input
                name="current_password"
                type="password"
                required
                maxLength={30}
                autoComplete="current-password"
                className={field}
              />
              {error === "pw-current" && (
                <p className="mt-1 text-sm text-red-600">현재 비밀번호가 달라요.</p>
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
              {error === "pw" && <p className="mt-1 text-sm text-red-600">비밀번호는 4~30자로 적어주세요.</p>}
              {error === "pw-same" && (
                <p className="mt-1 text-sm text-red-600">지금 쓰는 비밀번호와 같아요.</p>
              )}
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
                className={field}
              />
              {error === "pw2" && <p className="mt-1 text-sm text-red-600">비밀번호 두 개가 서로 달라요.</p>}
            </div>

            <button className="w-full h-11 rounded-xl border border-slate-300 bg-white text-sm font-semibold hover:border-blue-400 hover:bg-blue-50">
              비밀번호 바꾸기
            </button>
          </form>
        )}
      </section>

      {/* 회원 탈퇴 */}
      <section className="mt-10 rounded-2xl border border-red-200 bg-red-50/50 p-5">
        <h2 className="font-bold text-red-700">회원 탈퇴</h2>
        <p className="mt-2 text-[13px] text-red-800/80 leading-relaxed">
          탈퇴하면 되돌릴 수 없어요. 다음이 함께 사라집니다.
        </p>
        <ul className="mt-2 text-[13px] text-red-800/80 list-disc pl-5 space-y-0.5">
          <li>가입한 모임 {joined.length}개에서의 멤버십과 정모 참석 기록</li>
          {ownedCount > 0 && (
            <li>
              <b>내가 만든 모임 {ownedCount}개 — 그 모임의 멤버·정모·채팅까지 통째로</b>
            </li>
          )}
          <li>모든 채팅 메시지</li>
        </ul>

        <form action={deleteAccount} className="mt-4 space-y-2">
          <label className="block text-[13px] font-semibold text-red-800">
            확인을 위해 <code className="px-1 bg-red-100 rounded">{loginId}</code> 를 입력해주세요
          </label>
          <input
            name="confirm"
            autoComplete="off"
            placeholder={loginId}
            className="w-full h-11 px-3.5 rounded-xl border border-red-200 bg-white text-sm outline-none focus:border-red-400"
          />
          {error === "confirm" && (
            <p className="text-sm text-red-600">아이디가 정확히 일치해야 탈퇴돼요.</p>
          )}
          <button className="w-full h-11 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
            탈퇴하기
          </button>
        </form>
      </section>
    </div>
  );
}
