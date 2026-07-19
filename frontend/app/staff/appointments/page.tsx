"use client";

// 직원 예약 관리 (FR-7·FR-8, Story 2.2). GET /appointments 목록 + PATCH 확정/취소.
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1, AD-10). status 전이는 서버가 소유(AD-5).
// 반응형(UX-DR11): ≥md 밀도 있는 표, 모바일은 카드. 저장은 비관적(서버 확정 후 반영).
// 취소는 파괴적 액션이라 확인 Dialog 1단계(UX-DR6). 슬롯 충돌/점유는 Epic 5 — 여기선 status 만 바꾼다.

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { RoleContextBar } from "@/components/role-context-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Appointment, type AppointmentStatus } from "@/lib/api";
import { formatReservedAt } from "@/lib/format";

// nullable 표시 필드는 비어 있으면 —(2.1 스키마상 doctor_name 은 nullable, P0는 항상 채워짐).
function orDash(value: string | null): string {
  return value && value.trim() ? value : "—";
}

export default function StaffAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  // 조회 실패를 빈 상태와 구분한다 — 오류를 빈 상태로 렌더하면 백엔드 다운을 "예약 없음"으로 오인한다(1.4 규율).
  const [error, setError] = useState<string | null>(null);
  // 오류 후 "다시 시도" 재조회 트리거(effect 의존성).
  const [reloadNonce, setReloadNonce] = useState(0);
  // 진행 중인 액션의 예약 id — 그 사이 모든 액션 버튼을 비활성해 중복 전이를 막는다(재진입 가드).
  const [pendingId, setPendingId] = useState<number | null>(null);
  // 취소 확인 Dialog 대상 예약(null = 닫힘).
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);

  useEffect(() => {
    // setLoading 을 타이머 콜백 안에서 호출한다 — effect 본문의 동기 setState 는 React 19 린트가 막는다(1.4 패턴).
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await api.getAppointments();
        if (cancelled) return;
        setAppointments(rows);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // 오류를 별도 상태로 잡아 빈 상태와 구분한다. request 가 한국어 메시지로 던진다(AD-10).
        const message = err instanceof Error ? err.message : "예약 목록을 불러오지 못했어요.";
        setError(message);
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reloadNonce]);

  // 확정/취소 공통 전이 처리 — 비관적(서버 확정 후 반영). 성공 시 PATCH 응답 행으로 그 항목만 교체.
  async function runStatusChange(appt: Appointment, status: AppointmentStatus) {
    if (pendingId !== null) return; // 재진입 가드(더블클릭·연타 차단)
    setPendingId(appt.id);
    try {
      const updated = await api.updateAppointmentStatus(appt.id, status);
      setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success(status === "확정" ? "예약을 확정했어요." : "예약을 취소했어요.");
    } catch (err) {
      // 전이 규칙 위반·없는 예약 등은 request 가 4xx 한국어로 던진다(AD-10). 원래 상태 유지.
      const message = err instanceof Error ? err.message : "요청을 처리하지 못했어요.";
      toast.error(message);
    } finally {
      setPendingId(null);
    }
  }

  function handleCancelConfirmed() {
    const target = cancelTarget;
    if (!target) return;
    setCancelTarget(null); // 확인 Dialog 닫기(모달 1단계)
    void runStatusChange(target, "취소");
  }

  const busy = pendingId !== null;

  // 상태별 행 액션: 대기 → 확정+취소, 확정 → 취소만, 완료/취소 → 액션 없음.
  function renderActions(appt: Appointment) {
    if (appt.status === "대기") {
      return (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void runStatusChange(appt, "확정")} disabled={busy}>
            확정
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCancelTarget(appt)} disabled={busy}>
            취소
          </Button>
        </div>
      );
    }
    if (appt.status === "확정") {
      return (
        <Button size="sm" variant="outline" onClick={() => setCancelTarget(appt)} disabled={busy}>
          취소
        </Button>
      );
    }
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const isEmpty = !loading && !error && appointments.length === 0;

  return (
    <>
      <RoleContextBar role="직원" />
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold leading-tight">예약 관리</h1>
        </div>
        <p className="mt-2 text-muted-foreground">들어온 예약을 확정하거나 취소해요.</p>

        <div className="mt-6">
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={() => setReloadNonce((n) => n + 1)} />
          ) : isEmpty ? (
            <EmptyState />
          ) : (
            <>
              {/* 데스크톱(≥md): 밀도 있는 표 */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>환자</TableHead>
                      <TableHead>진료과</TableHead>
                      <TableHead>담당 의사</TableHead>
                      <TableHead>예약 시각</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead className="text-right">액션</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.patient_name}</TableCell>
                        <TableCell>{a.department_name}</TableCell>
                        <TableCell>{orDash(a.doctor_name)}</TableCell>
                        <TableCell>{formatReservedAt(a.reserved_at)}</TableCell>
                        <TableCell>
                          <AppointmentStatusBadge status={a.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">{renderActions(a)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 모바일(<md): 카드 리스트 */}
              <div className="grid gap-3 md:hidden">
                {appointments.map((a) => (
                  <Card key={a.id} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-base font-semibold">{a.patient_name}</div>
                      <AppointmentStatusBadge status={a.status} />
                    </div>
                    <dl className="mt-2 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
                      <dt className="text-muted-foreground">진료과</dt>
                      <dd>{a.department_name}</dd>
                      <dt className="text-muted-foreground">담당 의사</dt>
                      <dd>{orDash(a.doctor_name)}</dd>
                      <dt className="text-muted-foreground">예약 시각</dt>
                      <dd>{formatReservedAt(a.reserved_at)}</dd>
                    </dl>
                    <div className="mt-3">{renderActions(a)}</div>
                  </Card>
                ))}
              </div>

              <p className="mt-4 text-sm text-muted-foreground">총 {appointments.length}건</p>
            </>
          )}
        </div>
      </main>

      {/* 취소 확인 Dialog (UX-DR6 — 파괴적 액션, 되돌릴 수 없음 명시, 1단계만) */}
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>예약을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `${cancelTarget.patient_name}님 · ${formatReservedAt(cancelTarget.reserved_at)} 예약이에요. `
                : ""}
              취소하면 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirmed}>예약 취소</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// 로딩 중 Skeleton 행(UX-DR7). 데이터가 오면 대체된다.
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

// 조회 오류 상태 — 빈 상태와 구분해 "다시 시도"를 제공(백엔드 다운을 "예약 없음"으로 오인 방지).
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-muted-foreground">{message}</p>
      <div className="mt-4">
        <Button variant="outline" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    </div>
  );
}

// 빈 상태 — 아직 예약이 없음(환자가 예약을 잡으면 표시).
function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-lg font-medium">아직 예약이 없어요.</p>
      <p className="mt-1 text-muted-foreground">환자가 예약을 잡으면 여기에 표시돼요.</p>
    </div>
  );
}
