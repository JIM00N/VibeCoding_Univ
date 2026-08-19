import Link from "next/link";
import { categoryOf, coverStyle } from "@/lib/constants";

export type GroupCardData = {
  id: number;
  name: string;
  summary: string;
  category: string;
  region: string;
  memberCount: number;
};

export default function GroupCard({ group }: { group: GroupCardData }) {
  const c = categoryOf(group.category);

  return (
    <Link
      href={`/groups/${group.id}`}
      className="group block rounded-xl overflow-hidden bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md transition"
    >
      <div
        className="aspect-[16/9] grid place-items-center text-5xl select-none"
        style={coverStyle(group.category)}
      >
        <span className="drop-shadow-sm">{c.emoji}</span>
      </div>
      <div className="p-3.5">
        <h3 className="font-semibold text-[15px] leading-snug line-clamp-1 group-hover:text-blue-700">
          {group.name}
        </h3>
        <p className="mt-1 text-[13px] text-slate-500 leading-snug line-clamp-2 min-h-[2.5em]">
          {group.summary}
        </p>
        <div className="mt-2.5 flex items-center gap-1.5 text-[12px] text-slate-400">
          <span>{c.emoji}</span>
          <span>{group.category}</span>
          <span>·</span>
          <span>{group.region}</span>
          <span>·</span>
          <span>멤버 {group.memberCount}</span>
        </div>
      </div>
    </Link>
  );
}
