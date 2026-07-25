"use client";

// 내 예약 조회 (FR-11, Story 4.1). 신원이 선택된 환자가 자기 예약만 상태 배지와 함께 본다.
// GET /appointments?patient_id= (앱 레벨 필터·보안 아님, AD-8). 환자 톤 — 단일 컬럼·여유 카드
// (UX-DR11), 안심되는 해요체(UX-DR10). 브라우저는 lib/api.ts 만 통해 호출한다(AD-1).
// 렌더 우선순위: 로딩(Skeleton) > 오류(별도 상태+다시 시도) > 빈 상태 > 목록 — 오류를 빈 상태로
// 렌더하지 않는다(백엔드 다운을 "예약 없음"으로 오인 금지, 1.4/1.5/2.2 규율).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { ErrorState } from "@/components/error-state";
import { RoleContextBar } from "@/components/role-context-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Appointment } from "@/lib/api";
import { formatReservedAt } from "@/lib/format";
import { usePatientIdentity } from "@/lib/patient-identity";

export default function PatientAppointmentsPage() {
  const router = useRouter();
  const { ready, patient } = usePatientIdentity();
  const patientId = patient?.id;

  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  // 조회 실패를 빈 상태와 구분한다 — 오류를 빈 상태로 렌더하면 백엔드 다운을 "예약 없음"으로 오인한다.
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (ready && !patient) router.replace("/patient/select");
  }, [ready, patient, router]);

  useEffect(() => {
    if (patientId === undefined) return;
    // setLoading 을 타이머 콜백 안에서 호출한다 — effect 본문의 동기 setState 는 React 19 린트가 막는다.
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await api.getAppointmentsByPatient(patientId);
        if (cancelled) return;
        setItems(rows);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "예약을 불러오지 못했어요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientId, reloadNonce]);

  // 재수화 전(!ready)이나 리다이렉트 직전(!patient)엔 셸만 — "신원 없음" 깜빡임 방지.
  if (!ready || !patient) {
    return (
      <>
        <RoleContextBar role="환자" />
        <main className="mx-auto w-full max-w-2xl px-6 py-8" aria-busy="true" />
      </>
    );
  }

  // 렌더 우선순위: 로딩 > 오류 > 빈 상태 > 목록.
  const isEmpty = !loading && !error && items.length === 0;

  return (
    <>
      <RoleContextBar role="환자" patientName={patient.name} />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <h1 className="text-[28px] font-bold leading-tight">내 예약</h1>
        <p className="mt-2 text-muted-foreground">잡아 두신 예약과 진행 상태예요.</p>

        {/* 무인증 데모 고지 (AC3, UX-DR8, AD-8) — 정보 배너라 destructive(red) 를 쓰지 않는다. */}
        <Card className="mt-6 gap-2 bg-muted/50 p-4">
          <p className="text-sm font-medium">잠깐, 알려드릴 게 있어요</p>
          <p className="text-sm text-muted-foreground">
            지금은 로그인이 없어 누구나 환자를 고를 수 있어요(데모). 화면을 나눠 보여줄 뿐 진짜
            보안 격리는 아니에요.
          </p>
        </Card>

        <div className="mt-6">
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorState
              message={error}
              onRetry={() => setReloadNonce((n) => n + 1)}
              onBack={() => router.push("/patient")}
              backLabel="홈으로"
            />
          ) : isEmpty ? (
            <EmptyState onBook={() => router.push("/patient/book")} />
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((a) => (
                <li key={a.id}>
                  <Card className="gap-2 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-semibold">{a.department_name}</span>
                      <AppointmentStatusBadge status={a.status} />
                    </div>
                    <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
                      <dt className="text-muted-foreground">예약 시각</dt>
                      <dd>{formatReservedAt(a.reserved_at)}</dd>
                      <dt className="text-muted-foreground">담당 의사</dt>
                      <dd>{a.doctor_name ?? "—"}</dd>
                    </dl>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}

// 로딩 중 Skeleton(UX-DR7). 데이터가 오면 대체된다.
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

// 빈 상태 — 안심 톤 + 예약 잡기 유도(환자는 스스로 예약할 수 있다, 2.1).
function EmptyState({ onBook }: { onBook: () => void }) {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-lg font-medium">아직 예약이 없어요.</p>
      <p className="mt-1 text-muted-foreground">진료가 필요하시면 예약을 잡아 주세요.</p>
      <div className="mt-4">
        <Button variant="outline" onClick={onBook}>
          예약 잡기
        </Button>
      </div>
    </div>
  );
}
