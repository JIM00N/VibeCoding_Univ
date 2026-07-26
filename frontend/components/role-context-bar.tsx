// 역할 컨텍스트 바 (UX-DR4) — 상단 고정. 현재 역할 + (선택 환자) + 전환 액션.
// prop-driven 으로 유지한다 — 선택 환자는 환자 페이지가 usePatientIdentity() 로 읽어 내려준다.
// 바가 직접 신원 스토어를 읽으면 직원 화면까지 환자 개념을 알게 된다(직원 3화면이 이 바를 쓴다).
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export function RoleContextBar({
  role,
  patientName,
  patientAction = "switch",
  doctorName,
  doctorAction = "switch",
}: {
  role: "환자" | "직원" | "의사";
  patientName?: string;
  /**
   * 선택 환자가 있을 때 제공할 신원 액션. 이름 표시와 **분리**돼 있다 —
   * 묶어두면 신원 선택 화면에서 이름을 보여주려는 순간 자기 자신을 가리키는 링크가 따라온다.
   * - "switch": 다른 환자로 전환(→ /patient/select) — 환자 홈 기본값
   * - "back": 환자 홈으로 복귀(→ /patient) — 신원 선택 화면에서 되돌아갈 때
   * - "none": 액션 없음
   */
  patientAction?: "switch" | "back" | "none";
  /**
   * 선택 의사가 있을 때 제공할 신원 액션(Story 6.1 — patientAction 미러). 환자와 대칭 구조:
   * - "switch": 다른 의사로 전환(→ /doctor/select) — 의사 대시보드 기본값
   * - "back": 의사 대시보드로 복귀(→ /doctor) — 신원 선택 화면에서 되돌아갈 때
   * - "none": 액션 없음
   */
  doctorName?: string;
  doctorAction?: "switch" | "back" | "none";
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
        {doctorName ? (
          <span className="text-muted-foreground">· {doctorName} 선생님</span>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {/* 신원 액션은 이름 표시와 독립이다(직원 화면엔 신원 개념이 없어 기본적으로 안 뜬다). */}
        {patientName && patientAction === "switch" ? (
          <Link
            href="/patient/select"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            다른 환자
          </Link>
        ) : null}
        {patientName && patientAction === "back" ? (
          <Link href="/patient" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            돌아가기
          </Link>
        ) : null}
        {/* 의사 신원 액션 — 환자와 대칭(이름 표시와 독립). */}
        {doctorName && doctorAction === "switch" ? (
          <Link
            href="/doctor/select"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            다른 의사
          </Link>
        ) : null}
        {doctorName && doctorAction === "back" ? (
          <Link href="/doctor" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            돌아가기
          </Link>
        ) : null}
        <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          역할 바꾸기
        </Link>
      </div>
    </header>
  );
}
