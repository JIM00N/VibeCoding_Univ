import Link from "next/link";
import { redirect } from "next/navigation";
import { createGroup } from "@/app/actions";
import { getCurrentUser } from "@/lib/session";
import { CATEGORIES, REGIONS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function NewGroupPage({ searchParams }: PageProps<"/groups/new">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fgroups%2Fnew");

  const sp = await searchParams;
  const failed = one(sp.error) === "1";

  const field = "w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400";

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link href="/" className="text-sm text-slate-400 hover:text-slate-700">← 목록으로</Link>
      <h1 className="mt-3 text-2xl font-bold">모임 만들기</h1>
      <p className="mt-1.5 text-sm text-slate-500">
        {user.nickname}님이 모임장이 돼요. 만들자마자 목록 맨 위에 올라갑니다.
      </p>

      <form action={createGroup} className="mt-6 space-y-3">
        <div>
          <label className="block text-[13px] font-semibold mb-1.5">모임 이름</label>
          <input name="name" required maxLength={40} placeholder="예) 계모임 클론 스터디" className={field} />
        </div>

        <div>
          <label className="block text-[13px] font-semibold mb-1.5">한 줄 소개</label>
          <input name="summary" required maxLength={60} placeholder="카드에 보이는 문장이에요" className={field} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-semibold mb-1.5">카테고리</label>
            <select name="category" required defaultValue="" className={field}>
              <option value="" disabled>선택해주세요</option>
              {CATEGORIES.map((c) => (
                <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-semibold mb-1.5">지역</label>
            <select name="region" required defaultValue="" className={field}>
              <option value="" disabled>선택해주세요</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-semibold mb-1.5">소개글 <span className="text-slate-400 font-normal">(선택)</span></label>
          <textarea
            name="description"
            rows={5}
            maxLength={500}
            placeholder="어떤 모임인지, 언제 어디서 모이는지 적어주세요."
            className="w-full p-3.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400 resize-none"
          />
        </div>

        {failed && (
          <p className="text-sm text-red-600">이름·한 줄 소개·카테고리·지역을 모두 채워주세요.</p>
        )}

        <button className="w-full h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
          모임 만들기
        </button>
      </form>
    </div>
  );
}
