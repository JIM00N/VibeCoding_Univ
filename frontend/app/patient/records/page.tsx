"use client";

// 내 진료 기록 조회 (FR-11, Story 4.1). 신원이 선택된 환자가 지난 진료의 진단·소견·발생 진료과와
// 처방받은 약(내역)을 본다. GET /medical-records?patient_id= (앱 레벨 필터·보안 아님, AD-8).
// ⚠️ 처방전 출력/인쇄 경로는 없다 — 처방전은 직원 전용 통제 문서다(Story 3.3 결정, epics.md 경계).
//    환자는 "무슨 약을 받았는지" 내역만 읽는다. prescription_printed_at·window.print() 미사용.
// 환자 톤 — 단일 컬럼·여유 카드(UX-DR11), 안심 해요체(UX-DR10). 서버는 lib/api.ts 만 통해 호출(AD-1).
// 렌더 우선순위: 로딩 > 오류(별도 상태) > 빈 상태 > 목록 — 오류를 빈 상태로 렌더하지 않는다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/error-state";
import { RoleContextBar } from "@/components/role-context-bar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type MedicalRecord } from "@/lib/api";
import { formatReservedAt } from "@/lib/format";
import { usePatientIdentity } from "@/lib/patient-identity";

export default function PatientRecordsPage() {
  const router = useRouter();
  const { ready, patient } = usePatientIdentity();
  const patientId = patient?.id;

  const [items, setItems] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // 조회 실패를 빈 상태와 구분한다 — 오류를 빈 상태로 렌더하면 백엔드 다운을 "기록 없음"으로 오인한다.
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
        const rows = await api.getMedicalRecordsByPatient(patientId);
        if (cancelled) return;
        setItems(rows);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "진료 기록을 불러오지 못했어요.");
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
        <h1 className="text-[28px] font-bold leading-tight">내 진료 기록</h1>
        <p className="mt-2 text-muted-foreground">
          지난 진료의 진단·소견과 처방받은 약을 확인하실 수 있어요.
        </p>

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
            <EmptyState />
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map((record) => (
                <li key={record.id}>
                  <Card className="gap-3 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="text-base font-semibold">{record.department_name}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatReservedAt(record.visited_at)}
                      </span>
                    </div>
                    <dl className="grid grid-cols-[4.5rem_1fr] gap-y-1 text-sm">
                      <dt className="text-muted-foreground">담당 의사</dt>
                      <dd>{record.doctor_name}</dd>
                      <dt className="text-muted-foreground">진단</dt>
                      <dd className="break-words">{record.diagnosis ?? "—"}</dd>
                      <dt className="text-muted-foreground">소견</dt>
                      <dd className="break-words">{record.notes ?? "—"}</dd>
                    </dl>

                    <div>
                      <p className="mb-2 text-sm font-semibold">처방</p>
                      {record.prescriptions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">처방 없음</p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {record.prescriptions.map((rx) => (
                            <li key={rx.id} className="rounded-lg border p-3">
                              <div className="font-medium break-words">{rx.drug_name}</div>
                              <dl className="mt-1 grid grid-cols-[4.5rem_1fr] gap-y-0.5 text-sm">
                                <dt className="text-muted-foreground">용법·용량</dt>
                                <dd className="break-words">{rx.dosage ?? "—"}</dd>
                                <dt className="text-muted-foreground">처방일수</dt>
                                <dd>{rx.days ?? "—"}</dd>
                              </dl>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
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
    <div className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  );
}

// 빈 상태 — 안심 톤. 진료 기록은 진료를 받아야 생긴다(환자가 스스로 만들 수 없음).
function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-lg font-medium">아직 진료 기록이 없어요.</p>
      <p className="mt-1 text-muted-foreground">
        진료를 받으시면 진단·소견과 처방 내역이 여기에 쌓여요.
      </p>
    </div>
  );
}
