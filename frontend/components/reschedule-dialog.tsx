"use client";

// 예약 일정 변경 다이얼로그 (FR-19, Story 7.1). 직원이 대기·확정 예약의 담당 의사와 진료 시각을
// 한 번에 바꾼다. Story 2.3 의 "담당 의사 변경" 다이얼로그를 **대체**한다.
//
// 재사용만 한다 — 의사 목록은 2.1(`GET /doctors?hospital_department_id=`), 슬롯·날짜 계산은
// lib/booking-slots(5.4 정본), 격자는 components/slot-picker(동결), 가용성은 5.1 `GET /availability`.
// 신규 도메인 로직 0. 서버 계약은 `PATCH /appointments/{id}/reschedule` 하나다.
//
// 이 컴포넌트는 목록을 모른다 — 갱신된 예약을 onUpdated 로 올려보내고 목록 반영은 페이지가 소유한다.
// 부모는 열 때마다 `key` 를 바꿔 **새로 마운트**한다 — 날짜 선택지·지난 슬롯 필터가 "여는 시점"
// 기준이어야 하기 때문(Epic 6 회고 액션 #2, 6.3·5.3 선례). 닫을 때 별도 reset 이 필요 없다.
//
// ⚠️ 자기 행 제외(AC7): 가용성 조회에 `exclude_appointment_id` 를 넘긴다. 안 넘기면 **그 예약
//    자신이 점유한 슬롯**이 taken 으로 그려져 "시각은 그대로 두고 의사만 바꾸기"가 화면에서
//    막힌다(서버는 허용하는데 UI 만 좁아지는 어긋남). 서버가 의사 축·환자 축 둘 다에서 뺀다.
// ⚠️ 자동 배정("자동 배정" 옵션)은 여기 없다 — 5.2 자동 배정은 **생성 전용**이고, 변경에서
//    doctor_id 미지정은 "자동"이 아니라 "현재 의사 유지"를 뜻한다.

import { useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";

import { SlotPicker } from "@/components/slot-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import { api, ApiError, type Appointment, type Doctor } from "@/lib/api";
import { formatSeoulDayLabel, seoulDayOptions, slotsForSeoulDay } from "@/lib/booking-slots";
import { formatReservedAt } from "@/lib/format";

// 첫 오류 필드로 스크롤·포커스한다 — 390×844에서 아래까지 스크롤한 채 제출하면 인라인 오류가
// 화면 밖(위쪽)에 렌더돼 버튼이 먹통인 것처럼 보인다(proxy-booking-dialog 와 같은 이유·구현).
function revealField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.focus();
}

export function RescheduleDialog({
  appointment,
  open,
  onOpenChange,
  onUpdated,
}: {
  /** 변경 대상 예약(대기·확정). null 이면 렌더하지 않는다. */
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 갱신된 예약(정규 모델)을 목록 소유자에게 올려보낸다 — 반영 방식은 페이지가 정한다. */
  onUpdated: (appointment: Appointment) => void;
}) {
  const [doctors, setDoctors] = useState<Doctor[] | null>(null);
  const [doctorLoadError, setDoctorLoadError] = useState<string | null>(null);
  const [doctorNonce, setDoctorNonce] = useState(0);
  // 현재 담당 의사를 기본 선택으로 시작한다 — 직원이 "무엇을 바꾸는지" 보이는 상태에서 출발한다.
  // base-ui Select 계약대로 String(id) 로 다루고 제출 시 Number() 역변환.
  const [doctorId, setDoctorId] = useState<string | null>(
    appointment?.doctor_id != null ? String(appointment.doctor_id) : null,
  );

  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  // 사용자가 시간을 한 번이라도 건드렸는지 — 기본 선택(현재 시각)과 구분한다. 기본값을 그대로
  // 두면 "시각 미변경"이라 요청에서 reserved_at 을 빼야 하는데, 상태만으로는 둘이 같아 보인다.
  const [slotTouched, setSlotTouched] = useState(false);

  // 점유 슬롯(epoch ms) — null 이면 미조회/조회 실패(taken 없이 렌더). nonce 는 409 후 재조회.
  const [takenMs, setTakenMs] = useState<ReadonlySet<number> | null>(null);
  // 환자 축(FR-15b) — 이 환자가 이미 잡은 다른 활성 슬롯. 의사 축과 분리해 둔다(의사를 바꿔도
  // 이 축은 그대로이고, 섞으면 두 축의 의미가 무너진다 — 5.3 선례).
  const [patientBusyMs, setPatientBusyMs] = useState<ReadonlySet<number>>(new Set());
  const [availabilityNonce, setAvailabilityNonce] = useState(0);
  // 가용성 응답 시점의 최신 선택을 읽기 위한 미러 — effect 클로저의 selectedIso 는 stale 하다(5.3 리뷰 P8).
  const selectedIsoRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIsoRef.current = selectedIso;
  }, [selectedIso]);

  const [slotErr, setSlotErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 더블클릭 재진입 방지 — disabled 리렌더 커밋 전 두 번째 클릭이 중복 요청을 만든다(2.1·2.2 패턴).
  const submittingRef = useRef(false);

  // 오늘(서울)부터 7일 선택지 — 부모가 열 때마다 remount 하므로 이 마운트 = 이번 열림 시각이다.
  // (Date.now() 는 react-hooks/purity 린트가 막아 new Date() 를 쓴다.)
  const dayOptions = useMemo(() => seoulDayOptions(new Date(), 7), []);

  const currentMs = appointment ? new Date(appointment.reserved_at).getTime() : null;

  // 현재 예약 시각이 속한 날짜 — 7일 창 안에 있고 그 날 격자에 실제로 있을 때만 찾아진다.
  // lib/booking-slots 는 동결이라 "임의 시각의 서울 날짜" 헬퍼를 새로 만들지 않고, 이미 있는
  // 두 함수(seoulDayOptions·slotsForSeoulDay)의 조합으로 구한다(5.4 사본 금지 규율).
  // 과거 예약이나 7일 밖 예약은 undefined — 그때는 날짜/시간 미선택으로 시작하고, 의사만 바꾸는
  // 경로가 살아 있어야 한다(서버도 시각 미지정이면 과거 가드를 적용하지 않는다).
  const currentDayYmd = useMemo(() => {
    if (currentMs === null) return null;
    return (
      dayOptions.find((d) =>
        slotsForSeoulDay(d.ymd).some((s) => new Date(s.iso).getTime() === currentMs),
      )?.ymd ?? null
    );
  }, [dayOptions, currentMs]);

  // 기본 날짜 = 현재 예약일 → 없으면 남은 슬롯이 있는 첫 날(저녁에 열면 오늘은 0개라 막다른 길).
  const defaultYmd = useMemo(() => {
    if (currentDayYmd) return currentDayYmd;
    const nowMs = new Date().getTime();
    const firstOpen = dayOptions.find((d) =>
      slotsForSeoulDay(d.ymd).some((s) => new Date(s.iso).getTime() > nowMs),
    );
    return firstOpen?.ymd ?? dayOptions[0].ymd;
  }, [dayOptions, currentDayYmd]);
  const effectiveYmd = selectedYmd ?? defaultYmd;

  // 지난 시각 슬롯은 제거한다 — 오늘의 이미 지난 시간을 걸러 과거로의 변경을 막는다(서버 400 이 최종).
  const slots = useMemo(() => {
    const nowMs = new Date().getTime();
    return slotsForSeoulDay(effectiveYmd).filter((s) => new Date(s.iso).getTime() > nowMs);
  }, [effectiveYmd]);
  const dayLabel = useMemo(() => formatSeoulDayLabel(effectiveYmd), [effectiveYmd]);

  // 현재 예약 시각을 기본 선택으로 — 격자에 그 셀이 실제로 있을 때만(과거면 없다).
  // 서버 직렬화("+00:00")와 슬롯 iso("Z") 표기가 문자열로는 어긋나므로 epoch ms 로 찾아
  // **격자 쪽 iso** 를 값으로 쓴다(SlotPicker 는 iso 문자열 일치로 선택을 판정한다).
  const currentSlotIso = useMemo(() => {
    if (currentMs === null || effectiveYmd !== currentDayYmd) return null;
    return slots.find((s) => new Date(s.iso).getTime() === currentMs)?.iso ?? null;
  }, [slots, currentMs, effectiveYmd, currentDayYmd]);
  const effectiveIso = slotTouched ? selectedIso : (selectedIso ?? currentSlotIso);

  // 실제로 막아야 할 집합 = 의사 축 ∪ 환자 축(FR-15b). 상태는 분리, 합치기는 렌더 시점에만(5.3 규율).
  const unavailableMs = useMemo(() => {
    if (takenMs === null && patientBusyMs.size === 0) return undefined;
    return new Set([...(takenMs ?? []), ...patientBusyMs]);
  }, [takenMs, patientBusyMs]);

  const allSlotsTaken =
    slots.length > 0 &&
    unavailableMs !== undefined &&
    slots.every((s) => unavailableMs.has(new Date(s.iso).getTime()));

  // 그 예약의 진료과 의사 목록 — 과 이동은 스코프 밖이라 후보는 항상 이 과 안이다.
  // ⚠️ 현재 담당 의사를 **거르지 않는다**(2.3 과의 차이): 의사를 그대로 두고 시각만 바꾸는 것이
  //    정당한 요청이 됐다. 걸러 내면 그 조합이 UI 에서 불가능해진다(AC2).
  useEffect(() => {
    if (!open || !appointment) return;
    let cancelled = false;
    api
      .getDoctors(appointment.hospital_department_id)
      .then((rows) => {
        if (cancelled) return;
        setDoctors(rows);
        setDoctorLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // toast-only 로 흘리지 않는다 — 다이얼로그 안 인라인 오류 + 재시도(2.1 이월 교훈).
        setDoctorLoadError(err instanceof Error ? err.message : "의사 목록을 불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, appointment, doctorNonce]);

  // (의사, 날짜)로 그 날의 점유 슬롯을 미리 받아 taken 셀로 그린다(5.1, UX-DR3).
  // 조회 실패는 치명 아님 — taken 없이 렌더하고 제출 시 서버 409 가 최종 방어한다(조용한 강등).
  useEffect(() => {
    if (!open || !appointment || !doctorId) return;
    let cancelled = false;
    const daySlots = slotsForSeoulDay(effectiveYmd);
    const startIso = daySlots[0].iso;
    // 범위는 [첫 슬롯, 마지막 슬롯 + 30분) — 마지막 슬롯의 점유까지 포함한다.
    const endIso = new Date(
      new Date(daySlots[daySlots.length - 1].iso).getTime() + 1_800_000,
    ).toISOString();
    api
      .getAvailability(
        Number(doctorId),
        startIso,
        endIso,
        appointment.patient_id,
        appointment.id, // 자기 행 제외(AC7) — 두 축 모두에서 빠진다.
      )
      .then((av) => {
        if (cancelled) return;
        const toMsSet = (xs: string[]) => new Set(xs.map((t) => new Date(t).getTime()));
        setPatientBusyMs(toMsSet(av.patient_taken));
        const next = toMsSet(av.taken);
        setTakenMs(next);
        // 이미 고른 슬롯이 점유로 판명되면 해제하되 — 조용히 지우지 않고 — 인라인으로 알린다(5.3 리뷰 P8).
        const cur = selectedIsoRef.current;
        if (cur && next.has(new Date(cur).getTime())) {
          setSelectedIso(null);
          setSlotTouched(true);
          setSlotErr("고른 시간이 그새 예약됐어요. 다른 시간을 골라 주세요.");
        }
      })
      .catch(() => {
        // 조용한 강등 — 이전 스냅샷을 보존한다(409 후 재조회 경로에서 그 마킹이 살아 있다).
        // 의사·날짜 변경 경로는 핸들러가 먼저 setTakenMs(null) 하므로 여기선 항상 null 이고,
        // 실제 열화는 "taken 표시 없이 렌더". 어느 쪽이든 제출 시 서버가 최종 방어한다(5.3 규율).
      });
    return () => {
      cancelled = true;
    };
  }, [open, appointment, doctorId, effectiveYmd, availabilityNonce]);

  // base-ui Select 계약: Root 에 items 를 넘겨야 SelectValue 라벨이 렌더된다(2.1·2.3·6.3 함정).
  const doctorItems = useMemo(
    () => Object.fromEntries((doctors ?? []).map((d) => [String(d.id), `${d.name} 선생님`])),
    [doctors],
  );
  const dateItems = useMemo(
    () => Object.fromEntries(dayOptions.map((d) => [d.ymd, d.label])),
    [dayOptions],
  );
  const doctorsLoading = doctors === null && !doctorLoadError;

  // 바뀐 것이 있는지 — 요청 payload 와 버튼 활성이 같은 판정을 공유한다(두 벌이면 어긋난다).
  const doctorChanged =
    doctorId !== null && appointment !== null && Number(doctorId) !== appointment.doctor_id;
  const timeChanged =
    effectiveIso !== null && currentMs !== null && new Date(effectiveIso).getTime() !== currentMs;
  const hasChange = doctorChanged || timeChanged;

  function handleDoctorChange(v: string) {
    // base-ui Select 는 같은 값을 다시 골라도 onValueChange 를 발화한다 — 그대로 초기화를 태우면
    // 고른 시간·가용성이 이유 없이 날아간다(6.3 데드락과 같은 함정).
    if (v === doctorId) return;
    setDoctorId(v);
    // 이전 의사의 점유가 새 의사 그리드에 잔상으로 남지 않게(false-block 방향은 서버 백스톱이 없다).
    setTakenMs(null);
    // 이전 의사 기준의 슬롯 오류도 함께 지운다(5.3 코드리뷰 — 안 지우면 새 그리드 위에 red 가 남는다).
    setSlotErr(null);
  }

  function handleDateChange(v: string) {
    if (v === effectiveYmd) return; // 같은 날짜 재선택도 발화한다 — 고른 시간이 사라지지 않게.
    setSelectedYmd(v);
    setSelectedIso(null);
    setSlotTouched(true);
    setTakenMs(null); // 이전 날짜의 점유 표시가 새 날짜에 비치지 않게(effect 가 재조회).
    setSlotErr(null);
  }

  async function handleSubmit() {
    if (!appointment || !doctorId) return;
    if (effectiveIso && new Date(effectiveIso).getTime() <= new Date().getTime()) {
      // 다이얼로그를 오래 열어두면 고를 때 미래였던 슬롯이 지나간다 — 제출 직전 재검증(UX 층).
      // 서버에도 과거 시각 가드(400)가 있어 최종 방어는 서버가 담당한다.
      setSlotErr("고른 시간이 이미 지났어요. 다른 시간을 골라 주세요.");
      setSelectedIso(null);
      setSlotTouched(true);
      revealField("reschedule-slot-label");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // 바뀐 필드만 보낸다 — 서버는 미지정 필드를 현재 값으로 채운다. 시각을 안 보내면 서버의
      // 과거 시각 가드도 적용되지 않아, 지난 예약의 담당 의사만 바꾸는 경로가 살아 있다(AC6).
      const updated = await api.rescheduleAppointment(appointment.id, {
        ...(doctorChanged ? { doctor_id: Number(doctorId) } : {}),
        ...(timeChanged && effectiveIso ? { reserved_at: effectiveIso } : {}),
      });
      onUpdated(updated);
      toast.success("예약 일정을 바꿨어요.");
      submittingRef.current = false;
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // 도메인 거부(UX-DR7) — 서버 detail 그대로 red 인라인 + 그 셀 즉시 taken + 선택 해제,
        // 재조회로 다른 셀도 동기화한다. 다이얼로그는 닫지 않는다(입력 보존).
        // 마킹은 의사 축(takenMs)에 넣는다 — 렌더는 두 축 합집합이라 결과가 같고, 이어지는
        // 재조회가 두 축을 서버 진실로 덮는다(chore/patient-slot-guard 코드리뷰 결론).
        setSlotErr(err.message);
        if (effectiveIso) {
          const failedMs = new Date(effectiveIso).getTime();
          setTakenMs((prev) => new Set([...(prev ?? []), failedMs]));
        }
        setSelectedIso(null);
        setSlotTouched(true);
        setAvailabilityNonce((n) => n + 1);
        revealField("reschedule-slot-label");
      } else {
        // 4xx {detail} 한국어를 그대로 보여준다(AD-10). 실패해도 닫지 않아 입력이 남는다.
        toast.error(err instanceof Error ? err.message : "일정을 바꾸지 못했어요.");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    // 저장 중에는 닫히지 않게 막는다 — 닫는 순간 부모가 대상을 비우는데 그 뒤 응답이 도착하면
    // 엉뚱한 상태를 갱신한다(5.3 선례). 저장은 짧다.
    if (!next && submittingRef.current) return;
    onOpenChange(next);
  }

  if (!appointment) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal>
      {/* 슬롯 격자까지 들어가므로 폭을 넓히고 뷰포트 85%에서 내부 스크롤시킨다(대리 예약과 동일).
          disablePointerDismissal: 배경 오터치 한 번에 선택이 확인 없이 날아가는 걸 막는다. */}
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>예약 변경</DialogTitle>
          <DialogDescription>
            {`${appointment.patient_name}님 · ${appointment.department_name} · 현재 ${
              appointment.doctor_name ?? "—"
            } · ${formatReservedAt(appointment.reserved_at)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* 담당 의사 — 현재 의사가 기본 선택. 그대로 둬도 되고(시각만 변경) 바꿔도 된다. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="reschedule-doctor">담당 의사</Label>
            <Select
              items={doctorItems}
              value={doctorId}
              onValueChange={(v) => handleDoctorChange(v as string)}
              disabled={doctorsLoading}
            >
              <SelectTrigger
                id="reschedule-doctor"
                className="w-full"
                aria-invalid={doctorLoadError ? true : undefined}
                aria-describedby={doctorLoadError ? "reschedule-doctor-error" : undefined}
              >
                <SelectValue
                  placeholder={doctorsLoading ? "의사를 불러오는 중…" : "담당 의사를 선택하세요"}
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
            {doctorLoadError && (
              <div className="flex items-center justify-between gap-2">
                <p id="reschedule-doctor-error" role="alert" className="text-sm text-destructive">
                  {doctorLoadError}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDoctorLoadError(null);
                    setDoctors(null);
                    setDoctorNonce((n) => n + 1);
                  }}
                >
                  다시 시도
                </Button>
              </div>
            )}
          </div>

          {/* 날짜 — 오늘부터 7일. 현재 예약일이 그 안에 있으면 기본 선택된다. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="reschedule-date">진료 날짜</Label>
            <Select
              items={dateItems}
              value={effectiveYmd}
              onValueChange={(v) => handleDateChange(v as string)}
            >
              <SelectTrigger id="reschedule-date" className="w-full">
                <SelectValue placeholder="날짜를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {dayOptions.map((d) => (
                  <SelectItem key={d.ymd} value={d.ymd}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 30분 슬롯 피커 — 2.1·6.3 과 같은 동결 컴포넌트. taken 은 두 축 합집합. */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              {/* radiogroup 은 form control 이 아니라 htmlFor 대신 id + aria-labelledby 로 연결한다
                  (htmlFor 없는 <label> 은 Chrome a11y 이슈로 잡힌다 — 6.3 선례). */}
              <span id="reschedule-slot-label" className="text-sm leading-none font-medium">
                진료 시간 (30분 단위)
              </span>
              <span className="truncate text-xs text-muted-foreground">{dayLabel}</span>
            </div>
            {slots.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                이 날짜엔 고를 수 있는 시간이 없어요. 다른 날짜를 골라 주세요.
              </p>
            ) : (
              // SlotPicker 는 동결이라 aria-describedby 를 받지 않는다 — 오류가 있을 때 그룹 라벨
              // 체인(aria-labelledby)에 오류 문단 id 를 이어 붙여 SR 이 함께 읽게 한다(6.3 선례).
              <SlotPicker
                slots={slots}
                value={effectiveIso}
                ariaLabelledBy={
                  slotErr ? "reschedule-slot-label reschedule-slot-error" : "reschedule-slot-label"
                }
                takenMs={unavailableMs}
                onChange={(iso) => {
                  setSelectedIso(iso);
                  setSlotTouched(true);
                  setSlotErr(null);
                }}
              />
            )}
            {allSlotsTaken && (
              <p role="status" className="text-sm text-muted-foreground">
                이 날짜는 예약이 모두 찼어요. 다른 날짜를 골라 주세요.
              </p>
            )}
            {slotErr && (
              <p id="reschedule-slot-error" role="alert" className="text-sm text-destructive">
                {slotErr}
              </p>
            )}
            {/* 현재 시각이 격자에 없을 때(지난 예약·7일 밖) — 왜 아무것도 선택돼 있지 않은지 알린다.
                이 상태에서도 담당 의사만 바꾸는 경로는 살아 있다. */}
            {!currentDayYmd && (
              <p role="status" className="text-sm text-muted-foreground">
                현재 예약 시각({formatReservedAt(appointment.reserved_at)})은 고를 수 있는 범위
                밖이에요. 담당 의사만 바꾸거나, 새 시간을 골라 주세요.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          {/* DialogClose 대신 일반 Button — 저장 중 닫기를 막아야 해서 닫기 경로를 모은다. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            닫기
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !hasChange}
          >
            {submitting ? "변경 중…" : "변경"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
