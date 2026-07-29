"use client";

// 직원 예약 관리 (FR-7·FR-8·FR-19, Story 2.2·7.1). GET /appointments 목록 + PATCH 확정/취소 +
// PATCH /reschedule 일정 변경(담당 의사 + 진료 시각, 대기·확정 예약만 — Story 7.1 이 2.3 의
// PATCH /doctor 를 대체했다).
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1, AD-10). status 전이는 서버가 소유(AD-5).
// 반응형(UX-DR11): ≥md 밀도 있는 표, 모바일은 카드. 저장은 비관적(서버 확정 후 반영).
// 취소는 파괴적 액션이라 확인 Dialog 1단계(UX-DR6). 일정 변경은 비파괴적 Dialog.
// 폼 상태를 지닌 다이얼로그 둘(대리 예약·일정 변경)은 별도 컴포넌트가 소유하고, 이 페이지는
// 목록과 대상만 다룬다 — 열 때 key 를 바꿔 remount 시켜 시각 계산을 신선하게 유지한다.

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { toast } from "sonner";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { CategoryBadge } from "@/components/category-badge";
import { ErrorState } from "@/components/error-state";
import { ProxyBookingDialog } from "@/components/proxy-booking-dialog";
import { RescheduleDialog } from "@/components/reschedule-dialog";
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
import { Button, buttonVariants } from "@/components/ui/button";
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
import { departmentColorClass, doctorColorClass } from "@/lib/category-color";
import { formatReservedAt } from "@/lib/format";
import { cn } from "@/lib/utils";

// 진료과: 진료과별 색 배지(항상 존재). 색은 hospital_department_id 로 결정적 매핑(category-color).
function renderDepartment(appt: Appointment) {
  return (
    <CategoryBadge
      name={appt.department_name}
      colorClass={departmentColorClass(appt.hospital_department_id)}
    />
  );
}

// 담당 의사: 이름이 있으면 의사별 색 배지, 없으면 —(doctor_name 은 nullable, P0는 항상 채워짐).
function renderDoctor(appt: Appointment) {
  if (!appt.doctor_name || !appt.doctor_name.trim()) return "—";
  return (
    <CategoryBadge name={appt.doctor_name} colorClass={doctorColorClass(appt.doctor_id ?? 0)} />
  );
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
  // 일정 변경 Dialog 대상 예약(null = 닫힘, Story 7.1). 폼 상태는 다이얼로그가 소유하고,
  // 이 페이지는 대상과 결과만 다룬다(대리 예약 다이얼로그와 같은 소유권 분리).
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  // 열 때마다 증가시켜 다이얼로그의 key 로 쓴다 → 열 때마다 새로 마운트된다. 날짜 선택지·지난
  // 슬롯 필터가 "여는 시점" 기준이어야 하기 때문(Epic 6 회고 액션 #2 — 대리 예약과 같은 이유).
  const [rescheduleSession, setRescheduleSession] = useState(0);
  // 동기 재진입 가드 — pendingId(state)는 같은 tick 연타 사이에 아직 갱신 전이라, ref 로 즉시 막는다(2.1 패턴).
  const submittingRef = useRef(false);
  // 대리 예약 다이얼로그 열림 여부(Story 6.3). 폼 상태는 다이얼로그가 소유하고, 이 페이지는 결과만 받는다.
  const [bookingOpen, setBookingOpen] = useState(false);
  // 열 때마다 증가시켜 다이얼로그의 key 로 쓴다 → 열 때마다 새로 마운트된다. 슬롯·날짜 계산이
  // "여는 시점"의 현재 시각을 기준으로 다시 이뤄져야 지난 시간이 예약 가능하게 남지 않는다(코드리뷰).
  const [bookingSession, setBookingSession] = useState(0);

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

  // 일정 변경 Dialog 열기 — 세션을 올려 다이얼로그를 새로 마운트한 뒤 연다(시각 재계산).
  function openReschedule(appt: Appointment) {
    setRescheduleSession((n) => n + 1);
    setRescheduleTarget(appt);
  }

  // 확정/취소 공통 전이 처리 — 비관적(서버 확정 후 반영). 성공 시 PATCH 응답 행으로 그 항목만 교체.
  async function runStatusChange(appt: Appointment, status: AppointmentStatus) {
    if (submittingRef.current) return; // 동기 재진입 가드(같은 tick 더블클릭·연타 차단)
    submittingRef.current = true;
    setPendingId(appt.id);
    try {
      const updated = await api.updateAppointmentStatus(appt.id, status);
      setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success(status === "확정" ? "예약을 확정했어요." : "예약을 취소했어요.");
    } catch (err) {
      // 전이 규칙 위반·경합(409)·없는 예약 등은 request 가 4xx 한국어로 던진다(AD-10).
      const message = err instanceof Error ? err.message : "요청을 처리하지 못했어요.";
      toast.error(message);
      // 실패는 이 화면이 stale 일 수 있다는 신호(다른 직원이 이미 바꿈 등) — 서버 진실로 재동기화한다.
      setReloadNonce((n) => n + 1);
    } finally {
      submittingRef.current = false;
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

  // 대리 예약 열기 — 세션을 올려 다이얼로그를 새로 마운트한 뒤 연다(시각 재계산).
  function openProxyBooking() {
    setBookingSession((n) => n + 1);
    setBookingOpen(true);
  }

  // 상태별 행 액션: 대기 → 확정+취소+변경, 확정 → 취소+변경+기록 작성,
  // 완료 → 처방전(Story 3.3), 취소 → 액션 없음.
  // [변경](Story 7.1)은 2.3 의 [의사 변경]을 대체한다 — 담당 의사와 진료 시각을 한 다이얼로그에서
  // 함께 바꾼다. 버튼을 늘리지 않은 이유: 390px 카드에서 4개는 넘치고, 둘을 따로 바꾸면
  // PATCH 2번이라 부분 실패(의사는 성공·시각은 409) 상태가 생긴다.
  function renderActions(appt: Appointment) {
    if (appt.status === "대기") {
      return (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void runStatusChange(appt, "확정")} disabled={busy}>
            확정
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCancelTarget(appt)} disabled={busy}>
            취소
          </Button>
          <Button size="sm" variant="outline" onClick={() => openReschedule(appt)} disabled={busy}>
            변경
          </Button>
        </div>
      );
    }
    if (appt.status === "확정") {
      return (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setCancelTarget(appt)} disabled={busy}>
            취소
          </Button>
          <Button size="sm" variant="outline" onClick={() => openReschedule(appt)} disabled={busy}>
            변경
          </Button>
          {/* 진료 기록 작성(Story 3.1) — 확정 예약에만 진입(EXPERIENCE IA). 저장 시 완료 전이.
              내비게이션이라 Link(새 탭·프리페치·SR 내비 시맨틱) — 버튼 스타일만 빌린다. */}
          <Link
            href={`/staff/appointments/${appt.id}/record`}
            // cn(tailwind-merge) 필수 — base 의 border-transparent 가 outline 의 border-border 를 덮는 충돌 정리
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            기록 작성
          </Link>
        </div>
      );
    }
    if (appt.status === "완료") {
      // 처방전 조회·출력(Story 3.3) — 완료 예약(기록·처방 보유)에만 노출. 내비게이션이라 Link
      // (프리페치·SR 내비 시맨틱) — cn(tailwind-merge) 필수([기록 작성] Link 와 동일 함정).
      return (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/staff/appointments/${appt.id}/prescription`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            처방전
          </Link>
        </div>
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
          {/* 대리 예약(Story 6.3) — 이동이 아니라 모달 트리거라 Link 가 아닌 Button. */}
          <Button onClick={openProxyBooking}>대리 예약</Button>
        </div>
        <p className="mt-2 text-muted-foreground">들어온 예약을 확정하거나 취소해요.</p>

        <div className="mt-6">
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={() => setReloadNonce((n) => n + 1)} />
          ) : isEmpty ? (
            <EmptyState onProxyBook={openProxyBooking} />
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
                        <TableCell>{renderDepartment(a)}</TableCell>
                        <TableCell>{renderDoctor(a)}</TableCell>
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
                      <dd>{renderDepartment(a)}</dd>
                      <dt className="text-muted-foreground">담당 의사</dt>
                      <dd>{renderDoctor(a)}</dd>
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
            <AlertDialogAction onClick={handleCancelConfirmed} disabled={busy}>
              예약 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 일정 변경 Dialog (Story 7.1, FR-19 — 비파괴적, 1단계만). 폼은 컴포넌트가 소유하고
          갱신 결과만 받아 그 행을 교체한다. 열 때마다 key 를 바꿔 새로 마운트한다(시각 재계산). */}
      <RescheduleDialog
        key={rescheduleSession}
        appointment={rescheduleTarget}
        open={rescheduleTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRescheduleTarget(null);
        }}
        onUpdated={(updated) => {
          // 응답 행으로 그 항목만 교체하면 의사 색 배지(2.4, doctor_id 결정적 매핑)의 이름·색과
          // 예약 시각이 함께 갱신된다. 정렬은 목록 SQL 이 id desc 라 시각이 바뀌어도 유지된다.
          setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        }}
        onStaleList={() => {
          // 상태 경합(CAS 409)·비 슬롯 실패는 이 화면이 stale 하다는 신호 — 서버 진실로
          // 재동기화한다(2.2 패턴). 다른 직원이 완료 처리한 예약이 목록에 대기로 남아 재시도가
          // 반복되던 것을 막는다.
          setReloadNonce((n) => n + 1);
        }}
      />

      {/* 대리 예약 다이얼로그 (Story 6.3, FR-18) — 폼은 컴포넌트가 소유하고, 생성 결과만 받아 목록에
          prepend 한다. 목록 SQL 이 id desc(최신 위)라 재조회 없이도 정렬이 맞는다. */}
      <ProxyBookingDialog
        key={bookingSession}
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        onCreated={(appt) => {
          setAppointments((prev) => [appt, ...prev]);
          // 목록이 오류/로딩 상태면 방금 만든 예약이 화면에 못 나타난다(ErrorState·Skeleton 이 렌더됨)
          // — 성공 toast 만 뜨고 목록엔 없어서 직원이 중복 예약을 만들 수 있다. 서버 진실로 재동기화한다.
          if (error || loading) setReloadNonce((n) => n + 1);
        }}
      />
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

// 빈 상태 — 아직 예약이 없음(환자가 예약을 잡거나 직원이 대리 예약을 만들면 표시).
function EmptyState({ onProxyBook }: { onProxyBook: () => void }) {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-lg font-medium">아직 예약이 없어요.</p>
      <p className="mt-1 text-muted-foreground">환자가 예약을 잡으면 여기에 표시돼요.</p>
      <div className="mt-4">
        <Button onClick={onProxyBook}>대리 예약</Button>
      </div>
    </div>
  );
}
