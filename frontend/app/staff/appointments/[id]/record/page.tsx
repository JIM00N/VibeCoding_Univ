"use client";

// 진료 기록 작성 (FR-9·FR-8, Story 3.1). 예약 관리의 확정 예약 행에서 진입한다(EXPERIENCE IA).
// POST /medical-records 로 기록을 만들면 같은 트랜잭션에서 그 예약이 확정→완료로 전이된다(AD-5).
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1, AD-10). 저장은 비관적(서버 확정 후 반영).
// 대상 예약이 확정일 때만 폼을 보여준다 — URL 직접 진입 등 비확정이면 안내만(Component Patterns).
// 처방 행(0..N, FR-10 Story 3.2)은 같은 <form> 안 — 저장 시 기록·완료 전이와 한 트랜잭션으로 저장된다.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { RoleContextBar } from "@/components/role-context-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, type Appointment, type Drug } from "@/lib/api";
import { useDoctorIdentity } from "@/lib/doctor-identity";
import { formatReservedAt } from "@/lib/format";

// 처방 행 폼 상태. key 는 증가 카운터 — 배열 index 를 key 로 쓰면 중간 삭제 시 입력값이 밀린다.
type RxRow = {
  key: number;
  drugId: string | null;
  dosage: string;
  days: string;
  drugError: string | null;
  daysError: string | null;
};

function MedicalRecordNewInner() {
  const router = useRouter();
  // ?from=doctor 면 의사 대시보드에서 온 재사용 진입(Story 6.1, 채택안 B) — 폼·도메인 로직은 그대로,
  // 역할 바만 의사판으로·복귀 경로만 /doctor 로 돌린다. 무쿼리(직원 진입)는 기존 동작 그대로(회귀 0).
  const searchParams = useSearchParams();
  const fromDoctor = searchParams.get("from") === "doctor";
  const { doctor } = useDoctorIdentity();
  const listHref = fromDoctor ? "/doctor" : "/staff/appointments";
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

  // 약 목록(Story 3.2) — 예약 로드와 독립된 오류 상태 + 다시 시도(2.1 deferred 교훈: toast-only 금지).
  // 로드 실패해도 기록 저장은 가능하다(처방 없이) — 처방 섹션만 비활성.
  const [drugs, setDrugs] = useState<Drug[] | null>(null);
  const [drugsError, setDrugsError] = useState<string | null>(null);
  const [drugsNonce, setDrugsNonce] = useState(0);

  // 처방 행(0..N). key 는 증가 카운터(ref) — index-key 의 중간 삭제 밀림 버그 회피.
  const [rxRows, setRxRows] = useState<RxRow[]>([]);
  const rxKeyRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getDrugs()
      .then((rows) => {
        if (cancelled) return;
        setDrugs(rows);
        setDrugsError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setDrugs(null);
        setDrugsError("약 목록을 불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, [drugsNonce]);

  const drugItems = useMemo(
    () => Object.fromEntries((drugs ?? []).map((d) => [String(d.id), d.name])),
    [drugs],
  );

  function addRxRow() {
    rxKeyRef.current += 1;
    setRxRows((rows) => [
      ...rows,
      { key: rxKeyRef.current, drugId: null, dosage: "", days: "", drugError: null, daysError: null },
    ]);
  }

  function removeRxRow(key: number) {
    setRxRows((rows) => rows.filter((r) => r.key !== key));
  }

  function patchRxRow(key: number, patch: Partial<RxRow>) {
    setRxRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

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
    // 인라인 검증: 진단명 필수 + 처방 행별(약 선택·일수 ≥ 1). 서버 도달 전에 먼저 막는다(UX-DR9).
    const trimmed = diagnosis.trim();
    setDiagnosisError(trimmed ? null : "진단명을 입력해 주세요.");
    const checked = rxRows.map((r) => {
      const daysTrim = r.days.trim();
      return {
        ...r,
        drugError: r.drugId ? null : "약을 선택해 주세요.",
        // 정수 판정은 정규식으로 — Number() 단독은 16진수·지수 표기("0x3"·"3e1")도 통과시킨다.
        daysError:
          daysTrim && !(/^\d+$/.test(daysTrim) && Number(daysTrim) >= 1)
            ? "처방 일수는 1 이상의 숫자로 입력해 주세요."
            : null,
      };
    });
    setRxRows(checked);
    if (!trimmed || checked.some((r) => r.drugError || r.daysError)) return;

    if (submittingRef.current) return; // 동기 재진입 가드(같은 tick 더블클릭·연타 차단)
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await api.createMedicalRecord({
        appointment_id: appt.id,
        diagnosis: trimmed,
        notes: notes.trim() || null,
        visited_at: visitedAt.toISOString(),
        prescriptions: checked.map((r) => ({
          drug_id: Number(r.drugId),
          dosage: r.dosage.trim() || null,
          days: r.days.trim() ? Number(r.days.trim()) : null,
        })),
      });
      toast.success("진료 기록을 저장했어요.");
      // 처방 ≥1건이면 처방전 화면으로 직행(진료→즉시 출력→교부 흐름, Story 3.3 — 3.2 "목록 복귀"의
      // 의도적 개정). 완료 배지 확인은 처방전 화면의 상태 배지가 대신한다(목록을 안 거치므로).
      // 처방 0건이면 기존대로 목록 복귀 — 목록이 재조회되며 해당 예약 배지가 완료로 표시된다.
      // 두 경로 모두 성공 시 submitting 을 풀지 않는다 — 내비게이션까지 비활성 유지(이중 제출 창 제거).
      if (checked.length > 0) {
        // 의사 흐름이면 처방전 화면도 ?from=doctor 로 이어 복귀가 /doctor 로 유지되게 한다.
        router.push(
          `/staff/appointments/${appt.id}/prescription${fromDoctor ? "?from=doctor" : ""}`,
        );
      } else {
        router.push(listHref);
      }
    } catch (err) {
      // 확정 아님(400)·기록 중복(409)·경합(409)·없는 약(400) 등은 request 가 4xx 한국어로 던진다(AD-10).
      const message = err instanceof Error ? err.message : "요청을 처리하지 못했어요.";
      toast.error(message);
      // 실패는 대상 예약이 stale 일 수 있다는 신호 — 서버 진실로 재동기화한다(비확정이면 안내로 전환).
      setReloadNonce((n) => n + 1);
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const notConfirmed = !loading && !loadError && appt !== null && appt.status !== "확정";

  return (
    <>
      {/* ?from=doctor 면 역할 바를 의사판으로(Story 6.1) — 아니면 기존 직원 바(회귀 0).
          작성 중 폼이라 doctorAction="none": 바에 "다른 의사"(→/doctor/select) 링크를 두지 않는다
          (입력 중 신원 전환은 미저장 입력을 조용히 버리는 함정 — 이탈은 취소/역할 바꾸기로 충분). */}
      {fromDoctor ? (
        <RoleContextBar role="의사" doctorName={doctor?.name} doctorAction="none" />
      ) : (
        <RoleContextBar role="직원" />
      )}
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <h1 className="text-[28px] font-bold leading-tight">진료 기록 작성</h1>
        <p className="mt-2 text-muted-foreground">
          확정된 예약에 진단·소견·처방을 남겨요. 저장하면 이 예약은 완료로 바뀌어요.
        </p>

        <div className="mt-6">
          {!validId ? (
            <NoticeState message="예약을 찾을 수 없어요." onBack={() => router.push(listHref)} />
          ) : loading ? (
            <FormSkeleton />
          ) : loadError ? (
            <ErrorState
              message={loadError}
              onRetry={() => setReloadNonce((n) => n + 1)}
              onBack={() => router.push(listHref)}
            />
          ) : notConfirmed ? (
            <NoticeState
              message="확정된 예약에만 진료 기록을 작성할 수 있어요."
              onBack={() => router.push(listHref)}
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

                {/* 처방 (0..N, FR-10 Story 3.2 — 목업 record.html 처방 카드). 같은 폼 안 — 저장 시
                    기록·완료 전이와 한 트랜잭션. 약 목록이 없어도 기록 저장은 가능(섹션만 비활성). */}
                <section aria-label="처방" className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">
                      처방{" "}
                      <span className="text-[13px] font-normal text-muted-foreground">
                        (0개 이상)
                      </span>
                    </h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addRxRow}
                      disabled={drugs === null}
                    >
                      + 처방 추가
                    </Button>
                  </div>

                  {drugsError && (
                    <div className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2">
                      <p className="text-sm text-muted-foreground" role="alert">
                        {drugsError}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDrugsNonce((n) => n + 1)}
                      >
                        다시 시도
                      </Button>
                    </div>
                  )}

                  {rxRows.length === 0 ? (
                    !drugsError && (
                      <p className="py-1.5 text-sm text-muted-foreground">
                        추가된 처방이 없어요. 처방 없이 저장할 수 있어요.
                      </p>
                    )
                  ) : (
                    <div className="flex flex-col gap-2">
                      {/* 칼럼 라벨 행 — 시각용(모바일 2열 접힘에선 숨김). 각 입력엔 행 번호 포함 sr-only 라벨. */}
                      <div
                        aria-hidden
                        className="hidden gap-2 text-xs text-muted-foreground sm:grid sm:grid-cols-[2fr_1.6fr_0.9fr_auto]"
                      >
                        <span>약</span>
                        <span>용법·용량</span>
                        <span>일수</span>
                        <span className="w-8" />
                      </div>
                      {rxRows.map((r, idx) => (
                        <div
                          key={r.key}
                          className="grid grid-cols-2 items-start gap-2 sm:grid-cols-[2fr_1.6fr_0.9fr_auto]"
                        >
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`rx-${r.key}-drug`} className="sr-only">
                              처방 {idx + 1} 약
                            </Label>
                            <Select
                              items={drugItems}
                              value={r.drugId}
                              onValueChange={(v) =>
                                patchRxRow(r.key, { drugId: v as string, drugError: null })
                              }
                            >
                              <SelectTrigger
                                id={`rx-${r.key}-drug`}
                                className="w-full"
                                aria-invalid={r.drugError ? true : undefined}
                                aria-describedby={r.drugError ? `rx-${r.key}-drug-error` : undefined}
                              >
                                <SelectValue placeholder="약을 선택하세요" />
                              </SelectTrigger>
                              <SelectContent>
                                {(drugs ?? []).map((d) => (
                                  <SelectItem key={d.id} value={String(d.id)}>
                                    {d.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {r.drugError && (
                              <p
                                id={`rx-${r.key}-drug-error`}
                                role="alert"
                                className="text-sm text-destructive"
                              >
                                {r.drugError}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`rx-${r.key}-dosage`} className="sr-only">
                              처방 {idx + 1} 용법·용량
                            </Label>
                            <Input
                              id={`rx-${r.key}-dosage`}
                              value={r.dosage}
                              onChange={(e) => patchRxRow(r.key, { dosage: e.target.value })}
                              placeholder="예: 1일 3회 식후"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`rx-${r.key}-days`} className="sr-only">
                              처방 {idx + 1} 일수
                            </Label>
                            <Input
                              id={`rx-${r.key}-days`}
                              value={r.days}
                              onChange={(e) =>
                                patchRxRow(r.key, { days: e.target.value, daysError: null })
                              }
                              placeholder="예: 3"
                              inputMode="numeric"
                              aria-invalid={r.daysError ? true : undefined}
                              aria-describedby={r.daysError ? `rx-${r.key}-days-error` : undefined}
                            />
                            {r.daysError && (
                              <p
                                id={`rx-${r.key}-days-error`}
                                role="alert"
                                className="text-sm text-destructive"
                              >
                                {r.daysError}
                              </p>
                            )}
                          </div>
                          {/* 모바일 2열 접힘 — 삭제 버튼은 둘째 행 우측(목업 560px 분기 상당). */}
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`처방 ${idx + 1} 삭제`}
                            className="justify-self-end text-destructive sm:justify-self-auto"
                            onClick={() => removeRxRow(r.key)}
                          >
                            ✕
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

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
                    onClick={() => router.push(listHref)}
                    disabled={submitting}
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
// 목록 복귀 경로도 함께 — 404(삭제된 예약·오래된 링크)는 재시도가 영원히 실패하므로 탈출구 필수.
function ErrorState({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-muted-foreground">{message}</p>
      <div className="mt-4 flex justify-center gap-3">
        <Button variant="outline" onClick={onRetry}>
          다시 시도
        </Button>
        <Button variant="ghost" onClick={onBack}>
          예약 목록으로
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

// useSearchParams(?from=doctor)는 Suspense 경계가 필요하다(Next 16 — build 프리렌더 규칙).
// 폴백에도 역할 바를 둔다 — 하드 로드/새로고침 시 스티키 바가 사라지지 않게(이 페이지의 대다수
// 하드 로드는 직원이라 role="직원"이 정합; 의사 하드 진입은 Link 경유라 폴백이 거의 안 보인다).
export default function MedicalRecordNewPage() {
  return (
    <Suspense
      fallback={
        <>
          <RoleContextBar role="직원" />
          <main className="mx-auto w-full max-w-2xl px-6 py-8" aria-busy="true" />
        </>
      }
    >
      <MedicalRecordNewInner />
    </Suspense>
  );
}
