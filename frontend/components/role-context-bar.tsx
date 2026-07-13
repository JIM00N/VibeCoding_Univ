// 역할 컨텍스트 바 (UX-DR4) — 상단 고정. 현재 역할 + (선택 환자) + 전환 액션.
// Story 1.1 은 위치·전환만 확정. 선택 환자 유지/전환은 Story 1.5 에서 확장.
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export function RoleContextBar({
  role,
  patientName,
}: {
  role: "환자" | "직원";
  patientName?: string;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">서울중앙병원</span>
        <span className="text-muted-foreground">·</span>
        <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
          {role}
        </span>
        {patientName ? (
          <span className="text-muted-foreground">· {patientName}님</span>
        ) : null}
      </div>
      <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        역할 바꾸기
      </Link>
    </header>
  );
}
