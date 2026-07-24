"use client";

// 진료 기록 작성 (FR-9·FR-8, Story 3.1). 예약 관리의 확정 예약 행에서 진입한다(EXPERIENCE IA).
// POST /medical-records 로 기록을 만들면 같은 트랜잭션에서 그 예약이 확정→완료로 전이된다(AD-5).
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1, AD-10). 저장은 비관적(서버 확정 후 반영).
// 대상 예약이 확정일 때만 폼을 보여준다 — URL 직접 진입 등 비확정이면 안내만(Component Patterns).
// 처방(0..N 행)은 Story 3.2 가 이 페이지에 얹는다(진료 내용 카드와 액션 사이).

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { RoleContextBar } from "@/components/role-context-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, type Appointment } from "@/lib/api";
import { formatReservedAt } from "@/lib/format";

export default function MedicalRecordNewPage() {
  const router = useRouter();
  // 첫 동적 라우트([id]) — 클라이언트 페이지는 useParams 로 세그먼트를 읽는다(로컬 Next docs).
  const params = useParams<{ id: string }>();
  const appointmentId = Number(params.id);
  const validId = Number.isInteger(appointmentId) && appointmentId > 0;

  const [appt, setAppt] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  // 조회 실패를 "확정 아님" 안내와 구분한다 — 오류는 재시도 버튼을 제공(2.2 규율).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 진료 일시 — 폼을 연 시각을 캡처해 읽기전용으로 표시하고, 제출 시 ISO UTC 로 보낸다(목업 준수).
  const [visitedAt] = useState(() => new Date());
  // 동기 재진입 가드 — submitting(state)은 같은 tick 연타 사이에 아직 갱신 전이라 ref 로 즉시 막는다.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!validId) return;
    // setLoading 을 타이머 콜백 안에서 호출한다 — effect 본문의 동기 setState 는 React 19 린트가 막는다.
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const row = await api.getAppointment(appointmentId);
        if (cancelled) return;
        setAppt(row);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "예약 정보를 불러오지 못했어요.";
        setLoadError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [appointmentId, validId, reloadNonce]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appt) return;
    // 인라인 검증: 진단명 필수(공백만도 불가). 서버 도달 전에 먼저 막는다(UX-DR9).
    const trimmed = diagnosis.trim();
    if (!trimmed) {
      setDiagnosisError("진단명을 입력해 주세요.");
      return;
    }
    setDiagnosisError(null);

    if (submittingRef.current) return; // 동기 재진입 가드(같은 tick 더블클릭·연타 차단)
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await api.createMedicalRecord({
        appointment_id: appt.id,
        diagnosis: trimmed,
        notes: notes.trim() || null,
        visited_at: visitedAt.toISOString(),
      });
      toast.success("진료 기록을 저장했어요.");
      // 목록으로 복귀 — 목록이 서버에서 재조회되며 해당 예약 배지가 완료(green)로 표시된다.
      router.push("/staff/appointments");
    } catch (err) {
      // 확정 아님(400)·기록 중복(409)·경합(409) 등은 request 가 4xx 한국어로 던진다(AD-10).
      const message = err instanceof Error ? err.message : "요청을 처리하지 못했어요.";
      toast.error(message);
      // 실패는 대상 예약이 stale 일 수 있다는 신호 — 서버 진실로 재동기화한다(비확정이면 안내로 전환).
      setReloadNonce((n) => n + 1);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const notConfirmed = !loading && !loadError && appt !== null && appt.status !== "확정";

  return (
    <>
      <RoleContextBar role="직원" />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <h1 className="text-[28px] font-bold leading-tight">진료 기록 작성</h1>
        <p className="mt-2 text-muted-foreground">
          확정된 예약에 진단과 소견을 남겨요. 저장하면 이 예약은 완료로 바뀌어요.
        </p>

        <div className="mt-6">
          {!validId ? (
            <NoticeState message="예약을 찾을 수 없어요." onBack={() => router.push("/staff/appointments")} />
          ) : loading ? (
            <FormSkeleton />
          ) : loadError ? (
            <ErrorState message={loadError} onRetry={() => setReloadNonce((n) => n + 1)} />
          ) : notConfirmed ? (
            <NoticeState
              message="확정된 예약에만 진료 기록을 작성할 수 있어요."
              onBack={() => router.push("/staff/appointments")}
            />
          ) : appt ? (
            <>
              {/* 대상 예약 카드 — 저장 시 확정→완료 전이를 미리 보여준다(목업 record.html) */}
              <Card className="p-4">
                <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
                  <dt className="text-muted-foreground">환자</dt>
                  <dd className="font-medium">{appt.patient_name}</dd>
                  <dt className="text-muted-foreground">예약</dt>
                  <dd>
                    {formatReservedAt(appt.reserved_at)} · {appt.department_name}
                  </dd>
                  <dt className="text-muted-foreground">담당</dt>
                  <dd>{appt.doctor_name ?? "—"}</dd>
                  <dt className="text-muted-foreground">상태</dt>
                  <dd className="flex items-center gap-1.5">
                    <AppointmentStatusBadge status="확정" />
                    <span aria-hidden className="text-muted-foreground">
                      →
                    </span>
                    <AppointmentStatusBadge status="완료" />
                  </dd>
                </dl>
              </Card>

              <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-5" noValidate>
                {/* 진단명 (필수) */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="diagnosis">
                    진단명 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="diagnosis"
                    value={diagnosis}
                    onChange={(e) => {
                      setDiagnosis(e.target.value);
                      if (diagnosisError) setDiagnosisError(null);
                    }}
                    placeholder="예: 급성 인두염"
                    aria-invalid={diagnosisError ? true : undefined}
                    aria-describedby={diagnosisError ? "diagnosis-error" : undefined}
                    autoFocus
                  />
                  {diagnosisError && (
                    <p id="diagnosis-error" role="alert" className="text-sm text-destructive">
                      {diagnosisError}
                    </p>
                  )}
                </div>

                {/* 소견 (선택) */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="notes">소견</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="진료 소견을 입력해 주세요"
                    rows={4}
                  />
                </div>

                {/* 진료 일시 (읽기전용 — 폼을 연 시각) */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="visited-at">진료 일시</Label>
                  <Input
                    id="visited-at"
                    value={formatReservedAt(visitedAt.toISOString())}
                    readOnly
                    className="bg-muted/50"
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  저장 순간, 이 예약은 확정 → 완료로 자동 전이돼요. 한 예약엔 진료 기록 1건만
                  저장돼요.
                </p>

                <div className="mt-1 flex gap-3">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "저장 중…" : "기록 저장"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.push("/staff/appointments")}
                  >
                    취소
                  </Button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}

// 로딩 중 Skeleton(UX-DR7). 대상 카드 + 폼 자리를 대신한다.
function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-10 w-40 rounded-lg" />
    </div>
  );
}

// 조회 오류 상태 — "다시 시도" 제공(백엔드 다운을 "작성 불가"로 오인하지 않게 안내와 구분).
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

// 작성 불가 안내 — 확정이 아닌 예약(URL 직접 진입 포함)·잘못된 주소. 목록 복귀만 제공.
function NoticeState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center" role="status">
      <p className="text-lg font-medium">{message}</p>
      <div className="mt-4">
        <Button variant="outline" onClick={onBack}>
          예약 목록으로
        </Button>
      </div>
    </div>
  );
}
