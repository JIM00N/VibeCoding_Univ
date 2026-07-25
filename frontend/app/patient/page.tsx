"use client";

// 환자 홈 = 허브 (FR-2·FR-11, Story 1.5·4.1). 신원이 선택돼 있어야 들어올 수 있고, 선택된 환자를
// 컨텍스트 바에 유지해 보여준다(UX-DR4, 새로고침해도 유지). 여기서 예약 잡기(2.1)·내 예약 조회(4.1)·
// 내 진료 기록 조회(4.1)로 갈라진다. 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { RoleContextBar } from "@/components/role-context-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { usePatientIdentity } from "@/lib/patient-identity";

export default function PatientHome() {
  const router = useRouter();
  const { ready, patient, clearPatient } = usePatientIdentity();

  useEffect(() => {
    // ⚠️ ready 를 반드시 함께 본다 — ready:false 는 "신원 없음"이 아니라 "아직 못 읽음"이다.
    // ready 를 빼면 신원이 있는 사용자도 첫 프레임에 선택 화면으로 튕긴다.
    // replace 는 뒤로가기가 이 가드로 되돌아와 튕김 루프가 되는 걸 막는다.
    if (ready && !patient) {
      router.replace("/patient/select");
    }
  }, [ready, patient, router]);

  // 저장된 신원 서버 대조 (AC5, 경량). 홈 진입 시 1회, 기존 getPatients() 목록을 재사용해
  // localStorage 의 {id, name} 이 서버와 여전히 일치하는지 확인한다 — 재시드·삭제로 id 가 남에게
  // 재할당되면 "이름은 그대로, 데이터는 남의 것" 이 되기 때문(deferred-work 1.5, Epic 4 처리 지점).
  // ⚠️ 목록 호출이 실패(백엔드 다운)하면 신원을 지우지 않는다 — 오류≠잘못된 신원(AC4 원칙).
  //    목록이 정상 로드됐는데 id 가 없을 때만 "확실히 삭제됨"으로 판정한다.
  useEffect(() => {
    if (!ready || !patient) return;
    let cancelled = false;
    void (async () => {
      let rows;
      try {
        rows = await api.getPatients();
      } catch {
        return; // 백엔드 다운 등 — 조용히 통과(신원 보존)
      }
      if (cancelled) return;
      const found = rows.find((p) => p.id === patient.id);
      if (!found || found.name !== patient.name) {
        clearPatient();
        toast("선택한 환자 정보를 다시 확인해 주세요.");
        router.replace("/patient/select");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, patient, clearPatient, router]);

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
          예약을 잡거나, 내 예약과 지난 진료 기록을 여기서 확인하실 수 있어요.
        </p>

        {/* 무인증 데모 고지 (AC3, UX-DR8, AD-8) — 정보 배너라 destructive(red) 를 쓰지 않는다.
            복귀 사용자도 다시 보도록 홈에 상시 노출한다(선택 화면에만 있던 고지의 사각지대 메움). */}
        <Card className="mt-6 gap-2 bg-muted/50 p-4">
          <p className="text-sm font-medium">잠깐, 알려드릴 게 있어요</p>
          <p className="text-sm text-muted-foreground">
            지금은 로그인이 없어 누구나 환자를 고를 수 있어요(데모). 화면을 나눠 보여줄 뿐 진짜
            보안 격리는 아니라서, 실제 개인정보를 넣지 말아 주세요.
          </p>
        </Card>

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

        <Card className="mt-4 gap-3 p-5">
          <div>
            <p className="font-semibold">내 예약</p>
            <p className="text-sm text-muted-foreground">
              잡아 두신 예약과 진행 상태를 확인하실 수 있어요.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => router.push("/patient/appointments")}
          >
            내 예약 보기
          </Button>
        </Card>

        <Card className="mt-4 gap-3 p-5">
          <div>
            <p className="font-semibold">내 진료 기록</p>
            <p className="text-sm text-muted-foreground">
              지난 진료의 진단·소견과 처방받은 약을 확인하실 수 있어요.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => router.push("/patient/records")}
          >
            진료 기록 보기
          </Button>
        </Card>
      </main>
    </>
  );
}
