"use client";

// 환자 홈 (FR-2, Story 1.5). 신원이 선택돼 있어야 들어올 수 있고, 선택된 환자를
// 컨텍스트 바에 유지해 보여준다(UX-DR4) — 새로고침해도 유지된다.
// 내 예약 목록·지난 진료 기록 본문은 Story 4.1 범위라 여기선 자리표시까지.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { RoleContextBar } from "@/components/role-context-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePatientIdentity } from "@/lib/patient-identity";

export default function PatientHome() {
  const router = useRouter();
  const { ready, patient } = usePatientIdentity();

  useEffect(() => {
    // ⚠️ ready 를 반드시 함께 본다 — ready:false 는 "신원 없음"이 아니라 "아직 못 읽음"이다.
    // ready 를 빼면 신원이 있는 사용자도 첫 프레임에 선택 화면으로 튕긴다.
    // replace 는 뒤로가기가 이 가드로 되돌아와 튕김 루프가 되는 걸 막는다.
    if (ready && !patient) {
      router.replace("/patient/select");
    }
  }, [ready, patient, router]);

  // 재수화 전(!ready)이나 리다이렉트 직전(!patient)엔 셸만 보여준다 —
  // "신원 없음" 문구가 깜빡였다 사라지지 않게 한다.
  if (!ready || !patient) {
    return (
      <>
        <RoleContextBar role="환자" />
        <main className="mx-auto w-full max-w-2xl px-6 py-8" aria-busy="true" />
      </>
    );
  }

  return (
    <>
      <RoleContextBar role="환자" patientName={patient.name} />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <h1 className="text-[28px] font-bold leading-tight">{patient.name}님, 안녕하세요</h1>
        <p className="mt-2 text-muted-foreground">
          앞으로 예약과 진료 기록을 여기서 확인하시게 될 거예요.
        </p>
        <Card className="mt-6 gap-3 p-5">
          <div>
            <p className="font-semibold">진료 예약</p>
            <p className="text-sm text-muted-foreground">
              진료과와 담당 의사, 시간을 골라 예약하실 수 있어요.
            </p>
          </div>
          <Button className="w-fit" onClick={() => router.push("/patient/book")}>
            예약 잡기
          </Button>
        </Card>
        <Card className="mt-4 p-5">
          <p className="text-sm text-muted-foreground">
            내 예약 목록과 지난 진료 기록은 다음 단계에서 준비돼요. (Story 4.1)
          </p>
        </Card>
      </main>
    </>
  );
}
