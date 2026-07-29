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

// 상태 경합 409 문구 — 서버 `services/appointments.py` 의 CAS_CONFLICT_DETAIL 정본과 바이트 동일.
// 세 종류 409(의사 축·환자 축·CAS)를 status 코드만으로는 못 가르는데, CAS 는 "이 화면이 stale"이라
// 대응이 정반대다(셀 마킹이 아니라 목록 재동기화). 계약 테스트가 서버 쪽 문자열을 고정하고 있다.
const CAS_CONFLICT_DETAIL = "예약 상태가 방금 바뀌었어요. 목록을 새로고침한 뒤 다시 확인해 주세요.";

// 첫 오류 필드로 스크롤·포커스한다 — 390×844에서 아래까지 스크롤한 채 제출하면 인라인 오류가
// 화면 밖(위쪽)에 렌더돼 버튼이 먹통인 것처럼 보인다(proxy-booking-dialog 와 같은 이유·구현).
// ⚠️ 대상이 포커스 불가 요소(라벨용 <span> 등)면 scrollIntoView 만 되고 .focus() 는 조용히
// 실패한다 — 임시로 tabIndex=-1 을 붙여 프로그램적 포커스를 가능하게 하고, blur 시 되돌린다
// (탭 순서엔 넣지 않는다). 코드리뷰: SR 사용자가 오류로 이동하지 못하던 문제.
function revealField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  if (!el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "-1");
    el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true });
  }
  el.focus();
}

export function RescheduleDialog({
  appointment,
  open,
  onOpenChange,
  onUpdated,
  onStaleList,
}: {
  /** 변경 대상 예약(대기·확정). null 이면 렌더하지 않는다. */
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 갱신된 예약(정규 모델)을 목록 소유자에게 올려보낸다 — 반영 방식은 페이지가 정한다. */
  onUpdated: (appointment: Appointment) => void;
  /** 이 화면이 stale 하다는 신호(상태 경합·비 슬롯 실패) — 목록 소유자가 서버 진실로 재동기화한다.
   *  2.2 패턴: 삭제된 runDoctorChange 의 catch 가 setReloadNonce 로 하던 일(코드리뷰 회귀 복구). */
  onStaleList: () => void;
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
  // 가용성 응답 시점의 **화면에 실제로 선택돼 보이는 값**을 읽기 위한 미러 — effect 클로저의
  // 상태값은 stale 하다(5.3 리뷰 P8).
  // ⚠️ `selectedIso` 가 아니라 `effectiveIso` 를 미러한다(코드리뷰 High): 손대지 않은 기본 선택은
  // `selectedIso === null` 이라, selectedIso 를 미러하면 그 선택은 P8 복구 분기를 **한 번도 안 탄다**.
  // 의사를 바꿔 그 슬롯이 taken 이 되면 셀은 회색인데 선택은 남고 버튼도 활성이라, 화면이 이미
  // 아는 충돌을 사용자만 모른 채 제출해 409 를 맞는다. 아래 effect 로 effectiveIso 를 따라간다.
  const selectedIsoRef = useRef<string | null>(null);

  const [slotErr, setSlotErr] = useState<string | null>(null);
  const [doctorErr, setDoctorErr] = useState<string | null>(null);
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
  // ⚠️ **지난 슬롯을 거른 뒤** 찾는다(코드리뷰): 격자에 실제로 고를 수 있는 셀이 있을 때만
  // "현재 예약일" 로 인정해야 아래 안내 조건(`!currentDayYmd`)과 기본 선택(`currentSlotIso`)이
  // 같은 기준을 본다. 필터 전 격자로 찾으면 "오늘 09:00 예약을 오후에 열기" 에서 안내는 안 뜨는데
  // 선택은 비어 직원이 이유를 알 수 없다.
  const currentDayYmd = useMemo(() => {
    if (currentMs === null) return null;
    const nowMs = new Date().getTime();
    if (currentMs <= nowMs) return null; // 이미 지난 예약 — 격자에서 고를 수 없다.
    return (
      dayOptions.find((d) =>
        slotsForSeoulDay(d.ymd).some((s) => new Date(s.iso).getTime() === currentMs),
      )?.ymd ?? null
    );
  }, [dayOptions, currentMs]);

  // 기본 날짜 = 현재 예약일 → 없으면 남은 슬롯이 있는 첫 날. 위 가드 덕분에 "오늘 09:00 예약을
  // 진료 종료 후 열기" 가 빈 격자 막다른 길로 떨어지지 않고 폴백을 탄다(proxy-booking-dialog:138
  // 이 같은 이유로 두는 폴백 — 이식 때 조건부로 무력화됐던 것을 복구).
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
  // 위 ref 를 화면 표시값으로 동기화한다(선언 위치상 effectiveIso 계산 뒤여야 한다).
  useEffect(() => {
    selectedIsoRef.current = effectiveIso;
  }, [effectiveIso]);

  // 실제로 막아야 할 집합 = 의사 축 ∪ 환자 축(FR-15b). 상태는 분리, 합치기는 렌더 시점에만(5.3 규율).
  const unavailableMs = useMemo(() => {
    if (takenMs === null && patientBusyMs.size === 0) return undefined;
    return new Set([...(takenMs ?? []), ...patientBusyMs]);
  }, [takenMs, patientBusyMs]);

  const allSlotsTaken =
    slots.length > 0 &&
    unavailableMs !== undefined &&
    slots.every((s) => unavailableMs.has(new Date(s.iso).getTime()));

  // 환자 축으로 막힌 슬롯의 **라벨** — 셀은 두 축을 구분 없이 `예약됨` 으로만 그린다(slot-picker 는
  // 동결이라 축을 알리는 라벨을 넣을 수 없다). 그러면 "이 의사는 비었는데 왜 안 되지?" 가 된다 —
  // 실제로 직원이 곧바로 걸린 혼란이다(2026-07-29 실측). 격자 아래 한 줄로 사유를 밝힌다.
  // 이 날짜에 보이는 슬롯만 대상이다(범위 밖 예약까지 나열하면 소음).
  const patientBusyLabels = useMemo(
    () =>
      slots
        .filter((s) => patientBusyMs.has(new Date(s.iso).getTime()))
        .map((s) => s.label),
    [slots, patientBusyMs],
  );

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
        const patientBusy = toMsSet(av.patient_taken);
        const next = toMsSet(av.taken);
        setPatientBusyMs(patientBusy);
        setTakenMs(next);
        // 이미 고른 슬롯이 점유로 판명되면 해제하되 — 조용히 지우지 않고 — 인라인으로 알린다(5.3 리뷰 P8).
        // ⚠️ 판정은 **두 축 합집합**이다(코드리뷰): 렌더는 union 을 쓰는데 해제만 의사 축을 보면,
        // 그 환자가 다른 예약을 잡아 막힌 슬롯에서 셀은 비활성인데 선택이 남아 제출 시 409 가 난다.
        const blocked = new Set([...next, ...patientBusy]);
        const cur = selectedIsoRef.current;
        if (cur && blocked.has(new Date(cur).getTime())) {
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
    setDoctorErr(null);
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
    if (!appointment) return;
    if (!doctorId) {
      // doctor_id 가 null 인 예약(스키마상 허용)에서는 hasChange 가 timeChanged 만으로 true 가 돼
      // 버튼이 활성인데, 여기서 조용히 return 하면 요청도 오류도 없이 아무 일이 안 일어난다
      // (코드리뷰). 서버도 NULL doctor_id 로는 충돌 게이트가 성립하지 않아 거부한다.
      setDoctorErr("담당 의사를 선택해 주세요.");
      revealField("reschedule-doctor");
      return;
    }
    if (timeChanged && effectiveIso && new Date(effectiveIso).getTime() <= new Date().getTime()) {
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
    // 요청 시점의 선택을 고정한다 — catch 는 이 값으로만 마킹·해제를 판단한다(stale 클로저 가드).
    const submittedIso = timeChanged ? effectiveIso : null;
    try {
      // 바뀐 필드만 보낸다 — 서버는 미지정 필드를 현재 값으로 채운다. 시각을 안 보내면 서버의
      // 과거 시각 가드도 적용되지 않아, 지난 예약의 담당 의사만 바꾸는 경로가 살아 있다(AC6).
      const updated = await api.rescheduleAppointment(appointment.id, {
        ...(doctorChanged ? { doctor_id: Number(doctorId) } : {}),
        ...(submittedIso ? { reserved_at: submittedIso } : {}),
      });
      onUpdated(updated);
      toast.success("예약 일정을 바꿨어요.");
      submittingRef.current = false;
      onOpenChange(false);
    } catch (err) {
      const isSlotConflict =
        err instanceof ApiError && err.status === 409 && err.message !== CAS_CONFLICT_DETAIL;
      if (isSlotConflict) {
        // 슬롯 도메인 거부(UX-DR7) — 의사 축·환자 축 409. 서버 detail 그대로 red 인라인 + 그 셀
        // 즉시 taken + 선택 해제, 재조회로 다른 셀도 동기화한다. 다이얼로그는 닫지 않는다(입력 보존).
        // 마킹은 의사 축(takenMs)에 넣는다 — 렌더는 두 축 합집합이라 결과가 같고, 이어지는
        // 재조회가 두 축을 서버 진실로 덮는다(chore/patient-slot-guard 코드리뷰 결론).
        setSlotErr(err.message);
        if (submittedIso) {
          setTakenMs((prev) => new Set([...(prev ?? []), new Date(submittedIso).getTime()]));
        }
        // ⚠️ 요청 당시 값이 여전히 최신일 때만 선택을 지운다(코드리뷰): 응답 대기 중 사용자가 다른
        // 슬롯을 골랐다면 stale 클로저가 그 새 선택까지 날린다. 컨트롤을 잠가도 두 겹으로 막는다.
        if (selectedIsoRef.current === submittedIso) {
          setSelectedIso(null);
          setSlotTouched(true);
        }
        setAvailabilityNonce((n) => n + 1);
        revealField("reschedule-slot-label");
      } else {
        // CAS 409(상태 경합)와 그 외 실패 — 이 화면이 stale 하다는 신호다. 셀을 taken 으로 찍으면
        // 안 된다(시간 문제가 아니다). "목록을 새로고침해 주세요"는 다이얼로그 안에서 따를 수
        // 없으므로, 목록을 서버 진실로 재동기화하고 다이얼로그를 닫는다(2.2 패턴 복구 — 코드리뷰
        // High: 삭제된 runDoctorChange 의 catch 가 하던 일이다).
        toast.error(err instanceof Error ? err.message : "일정을 바꾸지 못했어요.");
        onStaleList();
        submittingRef.current = false;
        onOpenChange(false);
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
              disabled={doctorsLoading || submitting}
            >
              <SelectTrigger
                id="reschedule-doctor"
                className="w-full"
                aria-invalid={doctorLoadError || doctorErr ? true : undefined}
                aria-describedby={
                  doctorErr
                    ? "reschedule-doctor-required"
                    : doctorLoadError
                      ? "reschedule-doctor-error"
                      : undefined
                }
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
            {doctorErr && (
              <p id="reschedule-doctor-required" role="alert" className="text-sm text-destructive">
                {doctorErr}
              </p>
            )}
          </div>

          {/* 날짜 — 오늘부터 7일. 현재 예약일이 그 안에 있으면 기본 선택된다. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="reschedule-date">진료 날짜</Label>
            <Select
              items={dateItems}
              value={effectiveYmd}
              onValueChange={(v) => handleDateChange(v as string)}
              disabled={submitting}
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
              // SlotPicker 는 동결 컴포넌트라 disabled prop 이 없다 — 저장 중 잠금은 네이티브
              // <fieldset disabled> 로 건다(안의 button 이 전부 비활성). display:contents 라
              // 레이아웃엔 영향이 없다. 잠그는 이유: 응답 대기 중 다른 셀을 고르면 in-flight
              // 요청의 catch 가 그 새 선택을 지운다(proxy-booking-dialog:853 과 같은 이유).
              <fieldset disabled={submitting} className="contents">
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
              </fieldset>
            )}
            {allSlotsTaken && (
              <p role="status" className="text-sm text-muted-foreground">
                이 날짜는 예약이 모두 찼어요. 다른 날짜를 골라 주세요.
              </p>
            )}
            {/* 환자 축 사유 안내(FR-15b) — 의사를 바꿔도 안 풀리는 칸이 왜 막혔는지 알린다.
                의사 축(그 의사가 찼다)과 달리 이 축은 의사를 바꿔도 그대로라, 사유를 모르면
                직원이 의사만 계속 바꿔 보게 된다. 서버 거부 문구와 주어를 맞춘다("이 환자는"). */}
            {patientBusyLabels.length > 0 && (
              <p role="status" className="text-sm text-muted-foreground">
                이 환자는 <b>{patientBusyLabels.join(" · ")}</b>에 이미 다른 예약이 있어요. 그
                시간은 담당 의사를 바꿔도 고를 수 없어요.
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
