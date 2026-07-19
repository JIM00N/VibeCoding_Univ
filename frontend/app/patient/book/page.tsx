"use client";

// 환자 예약 생성 (FR-6 P0, Story 2.1). 진료과·담당 의사·30분 슬롯을 직접 골라 POST /appointments.
// 신원(1.5)에서 patient_id 를 얻고, 슬롯은 30분 격자로 만들어 ISO-8601 UTC 로 보낸다(백엔드 to_slot() 재검증).
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1, AD-10). 저장은 비관적(서버 확정 후 반영).
// ⚠️ 슬롯 충돌 검사·taken 셀·예약 목록 조회는 이 스토리 범위 밖 — 각각 Epic 5·Epic 4.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { RoleContextBar } from "@/components/role-context-bar";
import { SlotPicker, type Slot } from "@/components/slot-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type Appointment, type Department, type Doctor } from "@/lib/api";
import { usePatientIdentity } from "@/lib/patient-identity";

// 하루치 30분 슬롯을 만든다. 로컬 시각으로 분 ∈ {0,30}·초 0 으로 맞춘 뒤 toISOString()(UTC Z).
// KST 는 정시(UTC+9) 오프셋이라 분·초가 UTC 변환에도 불변 → 백엔드 reserved_at CHECK 통과(AD-3).
function slotsForDay(day: Date, startHour = 9, endHour = 18): Slot[] {
  const out: Slot[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 30]) {
      const d = new Date(day);
      d.setHours(h, m, 0, 0);
      out.push({
        label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        iso: d.toISOString(),
      });
    }
  }
  return out;
}

function formatReservedAt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BookAppointmentPage() {
  const router = useRouter();
  const { ready, patient } = usePatientIdentity();

  // 데모: 오늘 하루의 30분 슬롯. new Date() 는 클라이언트에서만 도는 슬롯 분기에서만 쓰인다.
  const day = useMemo(() => new Date(), []);
  const slots = useMemo(() => slotsForDay(day), [day]);
  const dayLabel = day.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });

  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [deptLoadError, setDeptLoadError] = useState<string | null>(null);
  const [deptId, setDeptId] = useState<string | null>(null);

  const [doctors, setDoctors] = useState<Doctor[] | null>(null);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [doctorId, setDoctorId] = useState<string | null>(null);

  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  const [deptErr, setDeptErr] = useState<string | null>(null);
  const [doctorErr, setDoctorErr] = useState<string | null>(null);
  const [slotErr, setSlotErr] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Appointment | null>(null);

  // 신원 가드 — ready:false 는 "아직 못 읽음"이지 "신원 없음"이 아니다. 판정은 항상 ready && !patient.
  useEffect(() => {
    if (ready && !patient) router.replace("/patient/select");
  }, [ready, patient, router]);

  // 진료과 목록 로드(마운트 1회). setState 는 promise 콜백에서만(effect 내 동기 setState 린트 회피).
  useEffect(() => {
    api
      .getDepartments()
      .then(setDepartments)
      .catch((err: unknown) => {
        setDepartments([]);
        setDeptLoadError(err instanceof Error ? err.message : "진료과를 불러오지 못했어요.");
      });
  }, []);

  // 진료과가 바뀌면 그 과의 의사만 로드한다. 로딩 표시는 이벤트 핸들러에서 켜고 여기선 끈다.
  useEffect(() => {
    if (!deptId) return;
    let cancelled = false;
    api
      .getDoctors(Number(deptId))
      .then((rows) => {
        if (!cancelled) setDoctors(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDoctors([]);
        toast.error(err instanceof Error ? err.message : "의사 목록을 불러오지 못했어요.");
      })
      .finally(() => {
        if (!cancelled) setDoctorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deptId]);

  const deptItems = useMemo(
    () => Object.fromEntries((departments ?? []).map((d) => [String(d.id), d.name])),
    [departments],
  );
  const doctorItems = useMemo(
    () => Object.fromEntries((doctors ?? []).map((d) => [String(d.id), d.name])),
    [doctors],
  );

  function handleDeptChange(v: string) {
    setDeptId(v);
    // 진료과가 바뀌면 의사·슬롯 선택을 초기화하고 그 과 의사를 새로 로드한다.
    setDoctorId(null);
    setDoctors(null);
    setDoctorsLoading(true);
    setDeptErr(null);
    setDoctorErr(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // 인라인 필수 검증 — 서버 도달 전에 먼저 막는다(UX-DR9, AC3).
    let ok = true;
    if (!deptId) {
      setDeptErr("진료과를 선택해 주세요.");
      ok = false;
    }
    if (!doctorId) {
      setDoctorErr("담당 의사를 선택해 주세요.");
      ok = false;
    }
    if (!selectedIso) {
      setSlotErr("예약할 시간을 골라주세요.");
      ok = false;
    }
    if (!ok || !patient) return;

    setSubmitting(true);
    try {
      const appt = await api.createAppointment({
        patient_id: patient.id,
        hospital_department_id: Number(deptId),
        doctor_id: Number(doctorId),
        reserved_at: selectedIso as string,
      });
      setCreated(appt);
      // 성공 문구는 정직하게 — 생성 직후 status 는 대기라 "확정"이라 하지 않는다(UX-DR10).
      toast.success("예약을 접수했어요. 상태는 '대기'로 시작해요.");
      // 같은 슬롯 중복 제출 방지 — 다시 예약하려면 슬롯을 새로 고르게 한다.
      setSelectedIso(null);
    } catch (err) {
      // request 가 오류를 한국어 메시지로 던진다(AD-10). 환자 톤이라 안심되게.
      toast.error(err instanceof Error ? err.message : "예약하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  // 재수화 전(!ready)·리다이렉트 직전(!patient)엔 셸만 — "신원 없음" 깜빡임 방지.
  if (!ready || !patient) {
    return (
      <>
        <RoleContextBar role="환자" />
        <main className="mx-auto w-full max-w-2xl px-6 py-8" aria-busy="true" />
      </>
    );
  }

  const selectedSlotLabel = slots.find((s) => s.iso === selectedIso)?.label ?? null;
  const doctorName = doctors?.find((d) => String(d.id) === doctorId)?.name ?? null;
  const deptName = departments?.find((d) => String(d.id) === deptId)?.name ?? null;

  return (
    <>
      <RoleContextBar role="환자" patientName={patient.name} />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        {/* 무인증 데모 고지 (UX-DR8, AD-8) — 정보 배너라 destructive(red) 를 쓰지 않는다. */}
        <Card className="mb-6 gap-2 bg-muted/50 p-4">
          <p className="text-sm font-medium">잠깐, 알려드릴 게 있어요</p>
          <p className="text-sm text-muted-foreground">
            지금은 로그인이 없어 누구나 목록에서 환자를 고를 수 있어요(데모). 실제 보안 격리는
            아니라서, 실제 개인정보를 넣지 말아 주세요.
          </p>
        </Card>

        <h1 className="text-[28px] font-bold leading-tight">예약 잡기</h1>
        <p className="mt-2 text-muted-foreground">진료과와 담당 의사, 시간을 골라 예약해요.</p>

        {/* 방금 만든 예약 확인 (AC5) — POST 응답으로 표시한다. 예약 목록 조회(?patient_id=)는 Epic 4. */}
        {created && (
          <Card className="mt-6 gap-2 border-primary/30 bg-primary/5 p-5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">예약을 접수했어요</p>
              <AppointmentStatusBadge status={created.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {formatReservedAt(created.reserved_at)} · {created.department_name} ·{" "}
              {created.doctor_name ?? "담당 의사"} 선생님
            </p>
            <p className="text-xs text-muted-foreground">
              예약 직후 상태는 대기로 시작해요. 직원이 확정하면 확정으로 바뀝니다.
            </p>
          </Card>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5" noValidate>
          {/* 진료과 (필수) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="dept">
              진료과 <span className="text-destructive">*</span>
            </Label>
            <Select
              items={deptItems}
              value={deptId}
              onValueChange={(v) => handleDeptChange(v as string)}
            >
              <SelectTrigger
                id="dept"
                className="w-full"
                aria-invalid={deptErr ? true : undefined}
                aria-describedby={deptErr ? "dept-error" : undefined}
              >
                <SelectValue placeholder="진료과를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {(departments ?? []).map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {deptLoadError && (
              <p className="text-sm text-destructive" role="alert">
                {deptLoadError}
              </p>
            )}
            {deptErr && (
              <p id="dept-error" role="alert" className="text-sm text-destructive">
                {deptErr}
              </p>
            )}
          </div>

          {/* 담당 의사 (필수, 직접 선택 — P0) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="doctor">
              담당 의사 <span className="text-destructive">*</span>
            </Label>
            <Select
              items={doctorItems}
              value={doctorId}
              onValueChange={(v) => {
                setDoctorId(v as string);
                setDoctorErr(null);
              }}
              disabled={!deptId || doctorsLoading}
            >
              <SelectTrigger
                id="doctor"
                className="w-full"
                aria-invalid={doctorErr ? true : undefined}
                aria-describedby={doctorErr ? "doctor-error" : undefined}
              >
                <SelectValue
                  placeholder={
                    !deptId
                      ? "진료과를 먼저 선택하세요"
                      : doctorsLoading
                        ? "의사를 불러오는 중…"
                        : "담당 의사를 선택하세요"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(doctors ?? []).map((doc) => (
                  <SelectItem key={doc.id} value={String(doc.id)}>
                    {doc.name} 선생님
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {doctorErr && (
              <p id="doctor-error" role="alert" className="text-sm text-destructive">
                {doctorErr}
              </p>
            )}
          </div>

          {/* 30분 슬롯 피커 (필수) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="slot-picker">
                시간 선택 (30분 단위) <span className="text-destructive">*</span>
              </Label>
              <span className="truncate text-xs text-muted-foreground">
                {dayLabel}
                {doctorName ? ` · ${doctorName} 선생님` : ""}
              </span>
            </div>
            <SlotPicker
              slots={slots}
              value={selectedIso}
              onChange={(iso) => {
                setSelectedIso(iso);
                setSlotErr(null);
              }}
            />
            {slotErr && (
              <p role="alert" className="text-sm text-destructive">
                {slotErr}
              </p>
            )}
          </div>

          {/* 요약 — 모두 골랐을 때 확인용 */}
          {deptName && doctorName && selectedSlotLabel && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
              📅 <b>{dayLabel} {selectedSlotLabel}</b> · {deptName} · {doctorName} 선생님으로 예약해요.
            </div>
          )}

          <div className="mt-2 flex gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "예약 중…" : "예약하기"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push("/patient")}>
              환자 홈으로
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            예약 직후 상태는 대기로 시작해요. 직원이 확정하면 확정으로 바뀝니다.
          </p>
        </form>
      </main>
    </>
  );
}
