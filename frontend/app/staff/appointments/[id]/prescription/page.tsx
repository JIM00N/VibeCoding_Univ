"use client";

// 처방전 조회·출력 (FR-10 확장, Story 3.3). 직원 전용 문서 — 환자 경로 없음(병원 요청 모델, 4.1 이 내역 조회).
// 두 경로로 진입한다: ① 기록 저장 직후 직행(처방 ≥1건) ② 예약 관리의 완료 행 [처방전] Link.
// 마운트 시 예약(완료 배지용 실제 상태)과 진료 기록·처방(시트 데이터)을 병렬 로드한다.
// 출력은 "행위"가 이력을 만든다: [처방전 출력] → 서버가 now() 기록(POST …/print) → 갱신 반영 → window.print().
// 인쇄물엔 시트 Card 하나만 남는다(비시트 요소는 print:hidden). 서버는 lib/api.ts 만 통해 호출(AD-1).

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { ErrorState } from "@/components/error-state";
import { RoleContextBar } from "@/components/role-context-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Appointment, type MedicalRecord } from "@/lib/api";
import { formatReservedAt } from "@/lib/format";

export default function PrescriptionPage() {
  const router = useRouter();
  // 동적 라우트([id]) — 클라이언트 페이지는 useParams 로 세그먼트를 읽는다(기록 페이지 미러).
  const params = useParams<{ id: string }>();
  const appointmentId = Number(params.id);
  const validId = Number.isInteger(appointmentId) && appointmentId > 0;

  const [appt, setAppt] = useState<Appointment | null>(null);
  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  // 조회 실패를 "기록 없음"·"처방 없음" 안내와 구분한다 — 오류는 재시도 버튼을 제공(2.2 규율).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [printing, setPrinting] = useState(false);
  // 동기 재진입 가드 — printing(state)은 같은 tick 연타 사이에 아직 갱신 전이라 ref 로 즉시 막는다.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!validId) return;
    // setLoading 을 타이머 콜백 안에서 호출한다 — effect 본문의 동기 setState 는 React 19 린트가 막는다.
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // 예약(완료 배지용 실제 상태)과 기록·처방(시트)을 병렬 로드 — 어느 쪽이든 실패 시 ErrorState.
        const [apptRow, records] = await Promise.all([
          api.getAppointment(appointmentId),
          api.getMedicalRecords(appointmentId),
        ]);
        if (cancelled) return;
        setAppt(apptRow);
        setRecord(records[0] ?? null); // 예약당 기록 1건 — 0행이면 null(기록 없음 안내)
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "처방전을 불러오지 못했어요.";
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

  async function handlePrint() {
    if (!record) return;
    if (submittingRef.current) return; // 동기 재진입 가드(같은 tick 더블클릭·연타 차단)
    submittingRef.current = true;
    setPrinting(true);
    try {
      // 서버가 먼저 출력 시각을 기록한 뒤에만 인쇄한다(이력 없는 출력물 금지, AC3).
      const updated = await api.printPrescription(record.id);
      setRecord(updated); // 출력 상태 줄 갱신(마지막 출력 시각)
      // React 배칭이 갱신을 flush 한 뒤 인쇄 — 다이얼로그가 갱신된 DOM 을 보게(0ms 지연).
      // 실제 인쇄 여부는 브라우저가 알려주지 않는다 — "출력 = 버튼 클릭 시점 기록"이 정직한 계약.
      setTimeout(() => window.print(), 0);
    } catch (err) {
      // 없는 기록(404)·처방 0건(400)은 request 가 4xx 한국어로 던진다 — 실패 시 인쇄하지 않는다(AC3).
      const message = err instanceof Error ? err.message : "요청을 처리하지 못했어요.";
      toast.error(message);
    } finally {
      submittingRef.current = false;
      setPrinting(false);
    }
  }

  const backToList = () => router.push("/staff/appointments");
  const printedText = record?.prescription_printed_at
    ? `마지막 출력: ${formatReservedAt(record.prescription_printed_at)}`
    : "아직 출력하지 않았어요.";

  return (
    <>
      {/* 역할 바 — 인쇄엔 포함하지 않는다(래퍼 div 로 숨김, 하드닝 컴포넌트 무수정). */}
      <div className="print:hidden">
        <RoleContextBar role="직원" />
      </div>
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        {/* 페이지 제목 블록 — 시트 내부 문서 헤더와 중복 인쇄를 막기 위해 화면 전용. */}
        <div className="print:hidden">
          <h1 className="text-[28px] font-bold leading-tight">처방전</h1>
          <p className="mt-2 text-muted-foreground">진료에서 처방한 약을 확인하고 출력해요.</p>
        </div>

        <div className="mt-6">
          {!validId ? (
            <NoticeState message="예약을 찾을 수 없어요." onBack={backToList} />
          ) : loading ? (
            <SheetSkeleton />
          ) : loadError ? (
            <ErrorState
              message={loadError}
              onRetry={() => setReloadNonce((n) => n + 1)}
              onBack={backToList}
            />
          ) : record === null ? (
            <NoticeState message="이 예약의 진료 기록이 없어요." onBack={backToList} />
          ) : record.prescriptions.length === 0 ? (
            <NoticeState
              message="처방이 없는 진료예요. 처방전을 출력할 수 없어요."
              onBack={backToList}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {/* 상태 줄(화면 전용) — 완료 배지(실제 예약 상태) + 출력 상태. 색 의존 없이 텍스트로. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm print:hidden">
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">예약 상태</span>
                  {appt && <AppointmentStatusBadge status={appt.status} />}
                </span>
                <span className="text-muted-foreground">{printedText}</span>
              </div>

              {/* 처방전 시트 — 인쇄 대상은 이 Card 하나뿐이다(비시트 요소는 모두 print:hidden). */}
              <Card className="p-6">
                <div className="border-b pb-4">
                  <h2 className="text-xl font-bold">처방전</h2>
                  <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
                    <dt className="text-muted-foreground">환자</dt>
                    <dd className="font-medium">{record.patient_name}</dd>
                    <dt className="text-muted-foreground">진료과</dt>
                    <dd>{record.department_name}</dd>
                    <dt className="text-muted-foreground">담당 의사</dt>
                    <dd>{record.doctor_name}</dd>
                    <dt className="text-muted-foreground">진료 일시</dt>
                    <dd>{formatReservedAt(record.visited_at)}</dd>
                  </dl>
                </div>

                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-semibold">처방</h3>
                  {/* ≥md·인쇄: 표(약/용법·용량/일수). table-fixed + break-words 로 좁은 폭에서도 접힘. */}
                  <table className="hidden w-full table-fixed border-collapse text-sm md:table print:table">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="w-1/2 py-2 font-medium">약</th>
                        <th className="py-2 font-medium">용법·용량</th>
                        <th className="w-14 py-2 font-medium">일수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.prescriptions.map((rx) => (
                        <tr key={rx.id} className="border-b align-top last:border-0">
                          <td className="py-2 pr-2 break-words">{rx.drug_name}</td>
                          <td className="py-2 pr-2 break-words">{rx.dosage ?? "—"}</td>
                          <td className="py-2">{rx.days ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* 모바일(화면 전용): 카드 스택 — 390px 가로 오버플로 방지(UX-DR11). */}
                  <ul className="flex flex-col gap-2 md:hidden print:hidden">
                    {record.prescriptions.map((rx) => (
                      <li key={rx.id} className="rounded-lg border p-3">
                        <div className="font-medium break-words">{rx.drug_name}</div>
                        <dl className="mt-1 grid grid-cols-[4.5rem_1fr] gap-y-0.5 text-sm">
                          <dt className="text-muted-foreground">용법·용량</dt>
                          <dd className="break-words">{rx.dosage ?? "—"}</dd>
                          <dt className="text-muted-foreground">일수</dt>
                          <dd>{rx.days ?? "—"}</dd>
                        </dl>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>

              {/* 액션(화면 전용). 출력 성공 시에만 인쇄가 열린다(실패는 toast 만). */}
              <div className="flex gap-3 print:hidden">
                <Button onClick={handlePrint} disabled={printing}>
                  {printing ? "출력 준비 중…" : "처방전 출력"}
                </Button>
                <Button variant="ghost" onClick={backToList} disabled={printing}>
                  예약 목록으로
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// 로딩 중 Skeleton(UX-DR7). 상태 줄 + 시트 자리를 대신한다.
function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-5 w-56 rounded" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-10 w-40 rounded-lg" />
    </div>
  );
}

// 안내 상태 — 잘못된 주소·기록 없음·처방 없음. 목록 복귀만 제공(기록 페이지 NoticeState 미러).
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
