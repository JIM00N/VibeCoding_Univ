"use client";

// 의사 대시보드 (FR-1b·FR-17, Story 6.1). 신원이 선택돼 있어야 들어올 수 있고(없으면 /doctor/select),
// 선택 의사를 컨텍스트 바에 유지해 보여준다(UX-DR4, 새로고침해도 유지). GET /appointments?doctor_id= 로
// 그 의사에게 배정된 예약만 받아(AD-8 앱 레벨 필터·보안 아님), 활성(대기·확정)을 먼저, 완료를 "완료된
// 진료"로 분류해 보여준다(FR-17 — status 분류, 신규 스키마 없음). 확정 예약에서 진료 기록 작성은 Story 3.1
// 폼을 그대로 재사용한다(/staff/appointments/[id]/record?from=doctor — 역할-인지 재사용).
// 가드는 /patient 홈, 목록 렌더는 /staff/appointments 를 미러한다(담당 의사 열 제거·액션은 기록 작성만).
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1). status 전이(확정/취소/재배정)는 직원이 소유(AD-5).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { CategoryBadge } from "@/components/category-badge";
import { ErrorState } from "@/components/error-state";
import { RoleContextBar } from "@/components/role-context-bar";
import { buttonVariants } from "@/components/ui/button";
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
import { api, type Appointment } from "@/lib/api";
import { departmentColorClass } from "@/lib/category-color";
import { useDoctorIdentity } from "@/lib/doctor-identity";
import { formatReservedAt } from "@/lib/format";
import { cn } from "@/lib/utils";

// 진료과: 진료과별 색 배지(항상 존재). 색은 hospital_department_id 로 결정적 매핑(category-color, 2.4).
// 담당 의사 열은 없다 — 이 화면은 항상 본인 예약이라 의사 배지가 무의미하다(staff 목록과 의도적 차이).
function renderDepartment(appt: Appointment) {
  return (
    <CategoryBadge
      name={appt.department_name}
      colorClass={departmentColorClass(appt.hospital_department_id)}
    />
  );
}

// 확정 예약에만 [기록 작성] 진입점(Story 3.1 폼 재사용 — ?from=doctor 로 역할-인지). 대기·완료는 액션 없음.
// 대기 확정은 직원이 소유(AD-5·2.2)라 의사 화면엔 전이 버튼을 두지 않는다.
function renderActions(appt: Appointment) {
  if (appt.status === "확정") {
    return (
      // 내비게이션이라 Link(프리페치·SR 내비 시맨틱) — cn(tailwind-merge) 필수(staff record Link 관용).
      <Link
        href={`/staff/appointments/${appt.id}/record?from=doctor`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        기록 작성
      </Link>
    );
  }
  return <span className="text-sm text-muted-foreground">—</span>;
}

export default function DoctorDashboard() {
  const router = useRouter();
  const { ready, doctor, clearDoctor } = useDoctorIdentity();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  // 조회 실패를 빈 상태와 구분한다 — 오류를 빈 상태로 렌더하면 백엔드 다운을 "예약 없음"으로 오인한다(규율).
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // 가드 (patient/page 미러): ready 를 반드시 함께 본다 — ready:false 는 "신원 없음"이 아니라 "아직 못 읽음".
  // replace 는 뒤로가기가 이 가드로 되돌아와 튕김 루프가 되는 걸 막는다.
  useEffect(() => {
    if (ready && !doctor) {
      router.replace("/doctor/select");
    }
  }, [ready, doctor, router]);

  // 저장 신원 서버 대조 (patient/page 미러, 경량). 재시드·삭제로 id 가 남에게 재할당되면
  // "이름은 그대로, 데이터는 남의 것"이 되므로 목록으로 대조한다. ⚠️ 목록 호출 실패(백엔드 다운)면
  // 신원을 지우지 않는다 — 오류≠잘못된 신원. 목록이 정상 로드됐는데 id 가 없을 때만 "삭제됨"으로 판정.
  useEffect(() => {
    if (!ready || !doctor) return;
    let cancelled = false;
    void (async () => {
      let rows;
      try {
        rows = await api.getAllDoctors();
      } catch {
        return; // 백엔드 다운 등 — 조용히 통과(신원 보존)
      }
      if (cancelled) return;
      const found = rows.find((d) => d.id === doctor.id);
      if (!found || found.name !== doctor.name) {
        clearDoctor();
        toast("선택한 의사 정보를 다시 확인해 주세요.");
        router.replace("/doctor/select");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, doctor, clearDoctor, router]);

  // 배정 예약 로드. setLoading 을 타이머 콜백 안에서 호출한다 — effect 본문의 동기 setState 는
  // React 19 린트가 막는다(staff/appointments 패턴).
  useEffect(() => {
    if (!ready || !doctor) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await api.getAppointmentsByDoctor(doctor.id);
        if (cancelled) return;
        setAppointments(rows);
        setError(null);
      } catch (err) {
        if (cancelled) return;
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
  }, [ready, doctor, reloadNonce]);

  // 활성(대기·확정)/완료 분류(FR-17). 취소는 두 섹션 모두에서 제외한다(의사 worklist 노이즈, 전이는 직원 소유).
  const active = useMemo(
    () => appointments.filter((a) => a.status === "대기" || a.status === "확정"),
    [appointments],
  );
  const completed = useMemo(
    () => appointments.filter((a) => a.status === "완료"),
    [appointments],
  );

  // 재수화 전(!ready)이나 리다이렉트 직전(!doctor)엔 셸만 보여준다(깜빡임 방지, patient/page 미러).
  if (!ready || !doctor) {
    return (
      <>
        <RoleContextBar role="의사" />
        <main className="mx-auto w-full max-w-4xl px-6 py-8" aria-busy="true" />
      </>
    );
  }

  return (
    <>
      <RoleContextBar role="의사" doctorName={doctor.name} />
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <h1 className="text-[28px] font-bold leading-tight">{doctor.name} 선생님, 안녕하세요</h1>
        <p className="mt-2 text-muted-foreground">
          배정된 예약을 확인하고, 확정된 예약에 진료 기록을 남길 수 있어요.
        </p>

        {/* 무인증 데모 고지 (AC2, UX-DR8, AD-8) — 정보 배너라 destructive(red) 를 쓰지 않는다.
            복귀 의사도 다시 보도록 대시보드에 상시 노출한다(patient/page 미러). */}
        <Card className="mt-6 gap-2 bg-muted/50 p-4">
          <p className="text-sm font-medium">잠깐, 알려드릴 게 있어요</p>
          <p className="text-sm text-muted-foreground">
            지금은 로그인이 없어 누구나 의사를 고를 수 있어요(데모). 화면을 나눠 보여줄 뿐 진짜
            보안 격리는 아니라서, 실제 개인정보를 넣지 말아 주세요.
          </p>
        </Card>

        <div className="mt-6">
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={() => setReloadNonce((n) => n + 1)} />
          ) : (
            <div className="flex flex-col gap-8">
              <AppointmentSection
                title="배정된 예약"
                subtitle="대기·확정 상태의 진료 예약이에요."
                items={active}
                emptyText="배정된 활성 예약이 없어요."
              />
              <AppointmentSection
                title="완료된 진료"
                subtitle="진료 기록을 남겨 완료된 예약이에요."
                items={completed}
                emptyText="완료된 진료가 없어요."
              />
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// 한 섹션(활성/완료 공용) — ≥md 밀도 표, 모바일 카드. 담당 의사 열 없음(항상 본인). 읽기+기록작성만.
function AppointmentSection({
  title,
  subtitle,
  items,
  emptyText,
}: {
  title: string;
  subtitle: string;
  items: Appointment[];
  emptyText: string;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground">총 {items.length}건</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

      {items.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed py-10 text-center">
          <p className="text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <>
          {/* 데스크톱(≥md): 밀도 있는 표 */}
          <div className="mt-3 hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>환자</TableHead>
                  <TableHead>진료과</TableHead>
                  <TableHead>예약 시각</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.patient_name}</TableCell>
                    <TableCell>{renderDepartment(a)}</TableCell>
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
          <div className="mt-3 grid gap-3 md:hidden">
            {items.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base font-semibold">{a.patient_name}</div>
                  <AppointmentStatusBadge status={a.status} />
                </div>
                <dl className="mt-2 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
                  <dt className="text-muted-foreground">진료과</dt>
                  <dd>{renderDepartment(a)}</dd>
                  <dt className="text-muted-foreground">예약 시각</dt>
                  <dd>{formatReservedAt(a.reserved_at)}</dd>
                </dl>
                <div className="mt-3">{renderActions(a)}</div>
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// 로딩 중 Skeleton(UX-DR7). 데이터가 오면 대체된다.
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}
