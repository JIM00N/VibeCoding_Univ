// 직원 화면 (FR-3). [직원] 선택 시 별도 신원 선택 없이 전체 데이터 접근으로 진입한다.
// Story 1.1 은 진입·앱 셸까지. 등록/검색/예약 관리는 후속 스토리에서 연결.
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
          <Card className="p-5">
            <h2 className="font-semibold">환자 등록·검색</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              다음 스토리에서 연결돼요. (Story 1.3 · 1.4)
            </p>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">예약 관리</h2>
            <p className="mt-1 text-sm text-muted-foreground">Epic 2 에서 연결돼요.</p>
          </Card>
        </div>
      </main>
    </>
  );
}
