"use client";

// 직원 예약 관리 (FR-7·FR-8, Story 2.2·2.3). GET /appointments 목록 + PATCH 확정/취소 +
// PATCH /doctor 담당 의사 변경(재배정 — 같은 진료과의 다른 의사, 대기·확정 예약만).
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1, AD-10). status 전이는 서버가 소유(AD-5).
// 반응형(UX-DR11): ≥md 밀도 있는 표, 모바일은 카드. 저장은 비관적(서버 확정 후 반영).
// 취소는 파괴적 액션이라 확인 Dialog 1단계(UX-DR6). 의사 변경은 비파괴적 Dialog(일반 dialog).
// 슬롯 충돌/점유·재배정 가용성 재검사는 Epic 5 — 여기선 status/doctor_id 만 바꾼다.

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { toast } from "sonner";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { CategoryBadge } from "@/components/category-badge";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Appointment, type AppointmentStatus, type Doctor } from "@/lib/api";
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
  // 의사 변경 Dialog 대상 예약(null = 닫힘, Story 2.3).
  const [doctorTarget, setDoctorTarget] = useState<Appointment | null>(null);
  // 의사 변경 Dialog 의 같은 과 의사 후보(null = 로딩 중). 실패는 별도 상태(인라인 오류 + 재시도).
  const [doctorOptions, setDoctorOptions] = useState<Doctor[] | null>(null);
  const [doctorLoadError, setDoctorLoadError] = useState<string | null>(null);
  // 의사 로드 실패 후 "다시 시도" 재조회 트리거(effect 의존성).
  const [doctorReloadNonce, setDoctorReloadNonce] = useState(0);
  // 새 담당 의사 선택값 — base-ui Select 계약대로 String(id) 로 다루고 제출 시 Number() 역변환.
  const [newDoctorId, setNewDoctorId] = useState<string | null>(null);
  // 동기 재진입 가드 — pendingId(state)는 같은 tick 연타 사이에 아직 갱신 전이라, ref 로 즉시 막는다(2.1 패턴).
  const submittingRef = useRef(false);

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

  // 의사 변경 Dialog 가 열리면 그 예약의 진료과 의사 후보를 로드한다(2.1 getDoctors 재사용).
  // setState 는 promise 콜백에서만(effect 내 동기 setState 린트 회피 — book 화면 패턴).
  useEffect(() => {
    if (!doctorTarget) return;
    let cancelled = false;
    api
      .getDoctors(doctorTarget.hospital_department_id)
      .then((rows) => {
        if (cancelled) return;
        setDoctorOptions(rows);
        setDoctorLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // toast-only 로 흘리지 않는다 — Dialog 안 인라인 오류 + 재시도(2.1 이월 교훈).
        // doctorOptions 는 null 로 둔다 — 오류 표현은 doctorLoadError 가 단일 진실(리뷰 반영).
        setDoctorLoadError(
          err instanceof Error ? err.message : "의사 목록을 불러오지 못했어요.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [doctorTarget, doctorReloadNonce]);

  // 현재 담당 의사를 제외한 같은 과 후보 — "다른 의사" 선택만 가능(에픽 AC).
  const doctorCandidates = useMemo(
    () => (doctorOptions ?? []).filter((d) => d.id !== (doctorTarget?.doctor_id ?? -1)),
    [doctorOptions, doctorTarget],
  );
  // base-ui Select 계약: Root 에 items 를 넘겨야 SelectValue 라벨이 렌더된다(book 화면 패턴).
  const doctorItems = useMemo(
    () => Object.fromEntries(doctorCandidates.map((d) => [String(d.id), `${d.name} 선생님`])),
    [doctorCandidates],
  );
  const doctorsLoading = doctorTarget !== null && doctorOptions === null && !doctorLoadError;
  // 바꿀 수 있는 다른 의사가 없는 상태(로드 완료·오류 없음·후보 0) — 안내 문구와 SR 연결에 공유.
  const doctorsEmpty = !doctorsLoading && !doctorLoadError && doctorCandidates.length === 0;

  // 의사 변경 Dialog 열기 — 이전 열림의 후보/선택/오류를 초기화하고 로드를 다시 시작한다.
  function openDoctorChange(appt: Appointment) {
    setDoctorOptions(null);
    setDoctorLoadError(null);
    setNewDoctorId(null);
    setDoctorTarget(appt);
  }

  function retryDoctorLoad() {
    setDoctorOptions(null);
    setDoctorLoadError(null);
    setDoctorReloadNonce((n) => n + 1);
  }

  // 담당 의사 변경 — 비관적 저장. 성공 시 PATCH 응답 행으로 그 항목만 교체하면
  // 의사 색 배지(2.4, doctor_id 결정적 매핑)의 이름·색이 함께 갱신된다.
  async function runDoctorChange() {
    const target = doctorTarget;
    if (!target || !newDoctorId) return;
    if (submittingRef.current) return; // 동기 재진입 가드(같은 tick 더블클릭·연타 차단)
    submittingRef.current = true;
    setPendingId(target.id);
    try {
      const updated = await api.updateAppointmentDoctor(target.id, Number(newDoctorId));
      setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success("담당 의사를 바꿨어요.");
    } catch (err) {
      // 같은 과 아님·완료/취소 예약·경합(409) 등은 request 가 4xx 한국어로 던진다(AD-10).
      const message = err instanceof Error ? err.message : "요청을 처리하지 못했어요.";
      toast.error(message);
      // 실패는 이 화면이 stale 일 수 있다는 신호 — 서버 진실로 재동기화한다(2.2 패턴).
      setReloadNonce((n) => n + 1);
    } finally {
      submittingRef.current = false;
      setPendingId(null);
      setDoctorTarget(null); // 성공/실패 모두 Dialog 닫기(실패 시 목록 재동기화가 이어짐)
    }
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

  // 상태별 행 액션: 대기 → 확정+취소+의사 변경, 확정 → 취소+의사 변경+기록 작성,
  // 완료 → 처방전(Story 3.3), 취소 → 액션 없음.
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
          <Button size="sm" variant="outline" onClick={() => openDoctorChange(appt)} disabled={busy}>
            의사 변경
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
          <Button size="sm" variant="outline" onClick={() => openDoctorChange(appt)} disabled={busy}>
            의사 변경
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

      {/* 의사 변경 Dialog (Story 2.3 — 비파괴적, 1단계만). 현재 담당 + 같은 과 다른 의사 후보. */}
      <Dialog
        open={doctorTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDoctorTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>담당 의사 변경</DialogTitle>
            <DialogDescription>
              {doctorTarget
                ? `${doctorTarget.patient_name}님 · ${formatReservedAt(doctorTarget.reserved_at)} · 현재 담당: ${doctorTarget.doctor_name ?? "—"}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-doctor">새 담당 의사</Label>
            <Select
              items={doctorItems}
              value={newDoctorId}
              onValueChange={(v) => setNewDoctorId(v as string)}
              disabled={doctorsLoading || doctorCandidates.length === 0}
            >
              <SelectTrigger
                id="new-doctor"
                className="w-full"
                aria-invalid={doctorLoadError ? true : undefined}
                aria-describedby={
                  doctorLoadError
                    ? "new-doctor-error"
                    : doctorsEmpty
                      ? "new-doctor-empty"
                      : undefined
                }
              >
                <SelectValue
                  placeholder={
                    doctorsLoading ? "의사를 불러오는 중…" : "새 담당 의사를 선택하세요"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {doctorCandidates.map((doc) => (
                  <SelectItem key={doc.id} value={String(doc.id)}>
                    {doc.name} 선생님
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {doctorLoadError && (
              <div className="flex items-center justify-between gap-2">
                <p id="new-doctor-error" className="text-sm text-destructive" role="alert">
                  {doctorLoadError}
                </p>
                <Button size="sm" variant="outline" onClick={retryDoctorLoad}>
                  다시 시도
                </Button>
              </div>
            )}
            {doctorsEmpty && (
              <p id="new-doctor-empty" role="status" className="text-sm text-muted-foreground">
                바꿀 수 있는 다른 의사가 없어요.
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose>닫기</DialogClose>
            <Button onClick={() => void runDoctorChange()} disabled={busy || !newDoctorId}>
              변경
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
