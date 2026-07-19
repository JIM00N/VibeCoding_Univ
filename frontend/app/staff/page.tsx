// 직원 화면 (FR-3). [직원] 선택 시 별도 신원 선택 없이 전체 데이터 접근으로 진입한다.
// Story 1.1 은 진입·앱 셸까지. 등록/검색/예약 관리는 후속 스토리에서 연결.
import Link from "next/link";

import { RoleContextBar } from "@/components/role-context-bar";
import { Card } from "@/components/ui/card";

export default function StaffHome() {
  return (
    <>
      <RoleContextBar role="직원" />
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <h1 className="text-[28px] font-bold leading-tight">직원 화면</h1>
        <p className="mt-2 text-muted-foreground">
          전체 데이터에 접근할 수 있어요. 별도 신원 선택은 없어요.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link href="/staff/patients/new" className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Card className="p-5 transition-colors hover:bg-accent">
              <h2 className="font-semibold">신규 환자 등록</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                처음 온 환자를 이름·생년월일·성별·연락처로 등록해요.
              </p>
            </Card>
          </Link>
          <Link href="/staff/patients" className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Card className="p-5 transition-colors hover:bg-accent">
              <h2 className="font-semibold">환자 목록·검색</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                등록된 환자를 목록으로 보고 이름으로 찾아요.
              </p>
            </Card>
          </Link>
          <Link href="/staff/appointments" className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Card className="p-5 transition-colors hover:bg-accent">
              <h2 className="font-semibold">예약 관리</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                들어온 예약을 확정·취소하고 상태를 봐요.
              </p>
            </Card>
          </Link>
        </div>
      </main>
    </>
  );
}
