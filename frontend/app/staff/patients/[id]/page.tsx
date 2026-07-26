"use client";

// 직원 환자별 전체 진료 내역 조회 (FR-12, Story 4.2). 환자 목록(1.4)에서 환자를 클릭하면 진입한다.
// 그 환자의 예약(≥md 표 / 모바일 카드, 읽기 전용)과 진료 기록(카드·처방 중첩)을 한 화면에서 본다.
// 신규 백엔드 0 — 4.1 이 만든 GET /appointments?patient_id=·GET /medical-records?patient_id= 를
// 그대로 호출하고, 환자 인적사항은 기존 getPatients() 로 해소한다(4.1 AC5 방침 — 오류/부재 분리).
// ⚠️ 조회 전용 — 확정/취소·의사 변경(→/staff/appointments)·처방전 출력(→…/prescription, 3.3)은 없다.
// 브라우저는 lib/api.ts 만 통해 호출(AD-1). 렌더 우선순위: 로딩 > 오류 > 부재 > (섹션별)빈 상태 > 목록.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { CategoryBadge } from "@/components/category-badge";
import { ErrorState } from "@/components/error-state";
import { RoleContextBar } from "@/components/role-context-bar";
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
import { api, type Appointment, type MedicalRecord, type Patient } from "@/lib/api";
import { departmentColorClass, doctorColorClass } from "@/lib/category-color";
import { formatReservedAt } from "@/lib/format";

// 성별 역매핑·nullable 대시 — 목록 페이지의 표시 규약과 동일(작은 지역 헬퍼, 공유 추출은 정리 스토리 몫).
const GENDER_LABEL: Record<string, string> = { M: "남", F: "여" };
function genderText(gender: string | null): string {
  return gender ? (GENDER_LABEL[gender] ?? gender) : "—";
}
function orDash(value: string | null): string {
  return value && value.trim() ? value : "—";
}

// 진료과·담당 의사 색 배지(2.4) — 예약 섹션에서 재사용(staff/appointments 렌더 미러).
function renderDepartment(appt: Appointment) {
  return (
    <CategoryBadge
      name={appt.department_name}
      colorClass={departmentColorClass(appt.hospital_department_id)}
    />
  );
}
function renderDoctor(appt: Appointment) {
  if (!appt.doctor_name || !appt.doctor_name.trim()) return "—";
  return (
    <CategoryBadge name={appt.doctor_name} colorClass={doctorColorClass(appt.doctor_id ?? 0)} />
  );
}

export default function StaffPatientHistoryPage() {
  const router = useRouter();
  // 동적 라우트([id]) — 클라이언트 페이지는 useParams 로 세그먼트를 읽는다(3.3 처방전 페이지 미러).
  const params = useParams<{ id: string }>();
  const patientId = Number(params.id);
  const validId = Number.isInteger(patientId) && patientId > 0;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // 조회 실패(백엔드 다운)를 "환자 부재"·"내역 없음"과 구분한다 — 오류를 빈/부재로 렌더하지 않는다.
  const [error, setError] = useState<string | null>(null);
  // 환자 목록이 정상 로드됐는데 그 id 가 없으면 부재(삭제/오타) — 오류와 별개 상태(AC5).
  const [notFound, setNotFound] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!validId) return;
    // setLoading 을 타이머 콜백 안에서 호출한다 — effect 본문의 동기 setState 는 React 19 린트가 막는다.
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // 환자 인적사항(목록 재사용)·예약·진료 기록을 병렬 로드(3.3 패턴). 하나라도 throw 면 ErrorState.
        const [patients, appts, recs] = await Promise.all([
          api.getPatients(),
          api.getAppointmentsByPatient(patientId),
          api.getMedicalRecordsByPatient(patientId),
        ]);
        if (cancelled) return;
        const found = patients.find((p) => p.id === patientId) ?? null;
        // 목록이 정상 로드됐는데 id 가 없으면 부재(삭제/오타) — 백엔드 다운(throw)과 구분(AC5, 4.1 규율).
        setNotFound(found === null);
        setPatient(found);
        setAppointments(appts);
        setRecords(recs);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "환자 내역을 불러오지 못했어요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientId, validId, reloadNonce]);

  return (
    <>
      <RoleContextBar role="직원" />
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold leading-tight">환자 진료 내역</h1>
          <Button variant="ghost" onClick={() => router.push("/staff/patients")}>
            환자 목록으로
          </Button>
        </div>

        {/* 렌더 우선순위: 잘못된 id > 로딩 > 오류(백엔드 다운) > 부재(삭제/오타) > 내역 섹션. */}
        {!validId ? (
          <NotFoundState onBack={() => router.push("/staff/patients")} />
        ) : loading ? (
          <PageSkeleton />
        ) : error ? (
          <div className="mt-6">
            <ErrorState
              message={error}
              onRetry={() => setReloadNonce((n) => n + 1)}
              onBack={() => router.push("/staff/patients")}
              backLabel="환자 목록으로"
            />
          </div>
        ) : notFound || !patient ? (
          <NotFoundState onBack={() => router.push("/staff/patients")} />
        ) : (
          <>
            {/* 환자 식별 헤더 — 누구의 내역인지 확정(이름 + 생년월일·성별·연락처). */}
            <Card className="mt-6 gap-2 p-5">
              <div className="text-xl font-semibold break-words">{patient.name}</div>
              <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-sm sm:grid-cols-[5rem_1fr_5rem_1fr] sm:gap-x-4">
                <dt className="text-muted-foreground">생년월일</dt>
                <dd>{orDash(patient.birth_date)}</dd>
                <dt className="text-muted-foreground">성별</dt>
                <dd>{genderText(patient.gender)}</dd>
                <dt className="text-muted-foreground">연락처</dt>
                <dd className="break-words">{orDash(patient.phone)}</dd>
              </dl>
            </Card>

            {/* 예약 섹션 — 읽기 전용(액션 없음). ≥md 밀도 표 / 모바일 카드(staff/appointments 미러). */}
            <section className="mt-8">
              <h2 className="text-lg font-semibold">예약 ({appointments.length}건)</h2>
              {appointments.length === 0 ? (
                <SectionEmpty text="아직 예약이 없어요." />
              ) : (
                <div className="mt-3">
                  {/* 데스크톱(≥md): 밀도 있는 표 (환자 열 없음 — 이미 특정 환자) */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>진료과</TableHead>
                          <TableHead>담당 의사</TableHead>
                          <TableHead>예약 시각</TableHead>
                          <TableHead>상태</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {appointments.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>{renderDepartment(a)}</TableCell>
                            <TableCell>{renderDoctor(a)}</TableCell>
                            <TableCell>{formatReservedAt(a.reserved_at)}</TableCell>
                            <TableCell>
                              <AppointmentStatusBadge status={a.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* 모바일(<md): 카드 리스트 */}
                  <div className="grid gap-3 md:hidden">
                    {appointments.map((a) => (
                      <Card key={a.id} className="gap-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 break-words">{renderDepartment(a)}</span>
                          <AppointmentStatusBadge status={a.status} className="shrink-0" />
                        </div>
                        <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
                          <dt className="text-muted-foreground">담당 의사</dt>
                          <dd>{renderDoctor(a)}</dd>
                          <dt className="text-muted-foreground">예약 시각</dt>
                          <dd>{formatReservedAt(a.reserved_at)}</dd>
                        </dl>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* 진료 기록 섹션 — 카드(처방 중첩). ≥md 2열 그리드로 밀도↑. 인쇄/출력 없음(조회 전용). */}
            <section className="mt-8">
              <h2 className="text-lg font-semibold">진료 기록 ({records.length}건)</h2>
              {records.length === 0 ? (
                <SectionEmpty text="아직 진료 기록이 없어요." />
              ) : (
                <ul className="mt-3 grid gap-4 md:grid-cols-2">
                  {records.map((record) => (
                    <li key={record.id}>
                      <Card className="h-full gap-3 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                          <span className="min-w-0 text-base font-semibold break-words">
                            {record.department_name}
                          </span>
                          <span className="shrink-0 text-sm text-muted-foreground">
                            {formatReservedAt(record.visited_at)}
                          </span>
                        </div>
                        <dl className="grid grid-cols-[4.5rem_1fr] gap-y-1 text-sm">
                          <dt className="text-muted-foreground">담당 의사</dt>
                          <dd className="break-words">{record.doctor_name}</dd>
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
            </section>
          </>
        )}
      </main>
    </>
  );
}

// 로딩 중 Skeleton — 환자 헤더 + 첫 섹션 자리(UX-DR7). 데이터가 오면 대체된다.
function PageSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-8" aria-hidden>
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32 rounded-md" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}

// 섹션 빈 상태 — 직원 톤=간결(예약/기록 각각). 오류와 구분(오류는 ErrorState).
function SectionEmpty({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed py-10 text-center">
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
}

// 환자 부재/잘못된 주소 — 목록이 정상 로드됐는데 그 환자가 없을 때(삭제·오타). 오류(백엔드 다운)와 구분.
function NotFoundState({ onBack }: { onBack: () => void }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed py-16 text-center">
      <p className="text-lg font-medium">환자를 찾을 수 없어요.</p>
      <p className="mt-1 text-muted-foreground">
        삭제됐거나 잘못된 주소일 수 있어요. 목록에서 다시 선택해 주세요.
      </p>
      <div className="mt-4">
        <Button variant="outline" onClick={onBack}>
          환자 목록으로
        </Button>
      </div>
    </div>
  );
}
