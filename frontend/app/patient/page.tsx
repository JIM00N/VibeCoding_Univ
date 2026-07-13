// 환자 화면 뼈대 (FR-2). Story 1.1 은 라우트·앱 셸 위치만 확정.
// 등록 환자 목록에서 본인 신원 선택 + 데모 고지 배너는 Story 1.5 범위.
import { RoleContextBar } from "@/components/role-context-bar";
import { Card } from "@/components/ui/card";

export default function PatientHome() {
  return (
    <>
      <RoleContextBar role="환자" />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <h1 className="text-[28px] font-bold leading-tight">환자 화면</h1>
        <p className="mt-2 text-muted-foreground">
          본인 신원 선택은 다음 단계에서 준비돼요. (Story 1.5)
        </p>
        <Card className="mt-6 p-5">
          <p className="text-sm text-muted-foreground">
            지금은 로그인이 없어 누구나 목록에서 환자를 고를 수 있어요(데모). 이 안내는 신원
            선택 화면에서 배너로 확장돼요.
          </p>
        </Card>
      </main>
    </>
  );
}
