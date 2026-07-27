"use client";

// 환자 예약 생성 (FR-6, Story 2.1). 진료과·담당 의사·30분 슬롯을 골라 POST /appointments.
// 신원(1.5)에서 patient_id 를 얻고, 슬롯은 30분 격자로 만들어 ISO-8601 UTC 로 보낸다(백엔드 to_slot() 재검증).
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1, AD-10). 저장은 비관적(서버 확정 후 반영).
// Story 5.1(FR-15): (의사, 날짜) 선택 시 점유 슬롯을 미리 받아 taken 셀로 그리고, 제출 충돌(409)은
// red 인라인 + 그 셀 taken 갱신으로 처리한다. 이 페이지는 라우트 상주형이라 시각·가용성이 낡을 수
// 있다 — 제출 직전 재검증과 서버 게이트(400/409)가 최종 방어다(주기적 폴링은 두지 않는다).
// Story 5.2(FR-6 P1): 의사 Select 의 "자동 배정" 옵션 — doctor_id: null 로 제출하면 서버가 그
// 진료과의 빈 의사를 골라 채운다. taken 사전 표시는 과 의사 전원의 가용성 교집합(전원 점유 슬롯만
// taken — 한 명이라도 비면 자동 배정 가능)으로 계산한다. 과당 의사 수가 소수(시드 2명)라 N회
// 병렬 호출로 충분하다 — 규모가 커지면 진료과 단위 가용성 API 로 승격(deferred).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { RoleContextBar } from "@/components/role-context-bar";
import { SlotPicker } from "@/components/slot-picker";
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
import { api, ApiError, type Appointment, type Department, type Doctor } from "@/lib/api";
import { formatSeoulDayLabel, seoulDayOptions, slotsForSeoulDay } from "@/lib/booking-slots";
import { formatReservedAt } from "@/lib/format";
import { usePatientIdentity } from "@/lib/patient-identity";

// 의사 Select 의 자동 배정 옵션 값(Story 5.2) — 실제 의사 id(숫자 문자열)와 절대 겹치지 않는다.
const AUTO_DOCTOR = "auto";

export default function BookAppointmentPage() {
  const router = useRouter();
  const { ready, patient } = usePatientIdentity();

  // 예약 가능 날짜: 서울 기준 오늘부터 7일. 선택한 날의 30분 슬롯을 만든다(병원 시각=Asia/Seoul 고정).
  const dayOptions = useMemo(() => seoulDayOptions(new Date(), 7), []);
  const [selectedYmd, setSelectedYmd] = useState<string>(() => dayOptions[0].ymd);
  // 지난 시각 슬롯은 제거한다 — 오늘의 이미 지난 시간(15시에 09시 예약)·자정 넘긴 과거 날짜를 걸러
  // 과거 예약을 막는다. 미래 날짜는 전부 남는다.
  const slots = useMemo(() => {
    // 마운트/날짜 변경 시점의 현재 시각 기준으로 지난 슬롯을 거른다. dayOptions 와 동일하게 new Date() 사용
    // (Date.now() 는 react-hooks/purity 린트가 막는다).
    const nowMs = new Date().getTime();
    return slotsForSeoulDay(selectedYmd).filter((s) => new Date(s.iso).getTime() > nowMs);
  }, [selectedYmd]);
  const dayLabel = useMemo(() => formatSeoulDayLabel(selectedYmd), [selectedYmd]);
  const dateItems = useMemo(
    () => Object.fromEntries(dayOptions.map((d) => [d.ymd, d.label])),
    [dayOptions],
  );

  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [deptLoadError, setDeptLoadError] = useState<string | null>(null);
  const [deptId, setDeptId] = useState<string | null>(null);

  const [doctors, setDoctors] = useState<Doctor[] | null>(null);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [doctorId, setDoctorId] = useState<string | null>(null);

  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  // 점유 슬롯(epoch ms) — null 이면 미조회/조회 실패(taken 없이 렌더). nonce 는 409·성공 후 재조회 트리거.
  const [takenMs, setTakenMs] = useState<ReadonlySet<number> | null>(null);
  const [availabilityNonce, setAvailabilityNonce] = useState(0);
  // 가용성 응답 시점의 최신 선택을 읽기 위한 미러 — effect 클로저의 selectedIso 는 stale 하다(리뷰 P8).
  const selectedIsoRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIsoRef.current = selectedIso;
  }, [selectedIso]);

  const [deptErr, setDeptErr] = useState<string | null>(null);
  const [doctorErr, setDoctorErr] = useState<string | null>(null);
  const [slotErr, setSlotErr] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false); // 더블클릭 재진입 방지(disabled 리렌더 커밋 전 두 번째 클릭 방어).
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

  // (의사, 날짜)를 고르면 그 날의 점유 슬롯을 미리 받아 taken 셀로 그린다(Story 5.1, UX-DR3).
  // 자동 배정(Story 5.2)은 과 의사 전원의 가용성을 병렬로 받아 교집합만 taken — 전원 점유 슬롯만
  // 막고, 한 명이라도 비면 예약 가능(자동 배정이 그 의사를 잡는다). 조회 실패(부분 실패 포함)는
  // 치명 아님 — taken 없이 렌더하고 제출 시 서버 409 가 최종 방어한다(조용한 강등, 콘솔 0 유지).
  // stale taken 비우기는 진료과·의사·날짜 변경 핸들러가 담당한다(effect 동기 setState 린트 금지).
  useEffect(() => {
    if (!doctorId) return;
    // 자동 배정인데 의사 목록이 비어 있으면 조회 생략. 이 가드의 실제 도달 경로는 과도기가 아니라
    // **지속 상태**다(코드리뷰) — 진료과 전환 직후는 핸들러가 doctorId 를 먼저 null 로 만들어 윗줄
    // 가드에서 이미 끊기고, 여기 오는 경우는 의사 로드 실패(catch 의 setDoctors([]))·의사 0명 과에서
    // 자동 배정을 고른 때다. 이때 taken 사전 표시 없이 제출이 열리지만 서버 400/409 가 백스톱한다
    // (빈 과 안내 UI 는 2-1 deferred "의사 0명 안내 없음"의 연장 — 스코프 밖).
    if (doctorId === AUTO_DOCTOR && (doctors ?? []).length === 0) return;
    let cancelled = false;
    const daySlots = slotsForSeoulDay(selectedYmd);
    const startIso = daySlots[0].iso;
    // 범위는 [첫 슬롯, 마지막 슬롯 + 30분) — 마지막 슬롯의 점유까지 포함한다.
    const endIso = new Date(
      new Date(daySlots[daySlots.length - 1].iso).getTime() + 1_800_000,
    ).toISOString();
    const toMsSet = (taken: string[]) => new Set(taken.map((t) => new Date(t).getTime()));
    const nextTaken: Promise<Set<number>> =
      doctorId === AUTO_DOCTOR
        ? Promise.all(
            (doctors ?? []).map((d) => api.getAvailability(d.id, startIso, endIso)),
          ).then((avs) => {
            const sets = avs.map((av) => toMsSet(av.taken));
            // 교집합 — 모든 의사의 taken 에 공통인 슬롯만(전원 점유). sets 는 위 가드로 비지 않는다.
            return new Set([...sets[0]].filter((ms) => sets.every((s) => s.has(ms))));
          })
        : api.getAvailability(Number(doctorId), startIso, endIso).then((av) => toMsSet(av.taken));
    nextTaken
      .then((next) => {
        if (cancelled) return;
        setTakenMs(next);
        // 이미 고른 슬롯이 점유로 판명되면 해제하되 — 조용히 지우지 않고 — 인라인으로 알린다(리뷰 P8).
        const cur = selectedIsoRef.current;
        if (cur && next.has(new Date(cur).getTime())) {
          setSelectedIso(null);
          setSlotErr("고른 시간이 그새 예약됐어요. 다른 시간을 골라 주세요.");
        }
      })
      .catch(() => {
        // 조회 실패 시 이전 스냅샷(409로 확인된 마킹 포함)을 보존한다 — null 리셋은 방금 확인한
        // 충돌 셀까지 되살린다(리뷰 P3). 미조회 상태면 어차피 null(조용한 강등 유지).
      });
    return () => {
      cancelled = true;
    };
  }, [doctorId, doctors, selectedYmd, availabilityNonce]);

  const deptItems = useMemo(
    () => Object.fromEntries((departments ?? []).map((d) => [String(d.id), d.name])),
    [departments],
  );
  const doctorItems = useMemo(
    () => ({
      // 자동 배정(Story 5.2) — 트리거 라벨용. 목록 첫 항목은 SelectContent 쪽에 있다.
      [AUTO_DOCTOR]: "자동 배정",
      ...Object.fromEntries((doctors ?? []).map((d) => [String(d.id), d.name])),
    }),
    [doctors],
  );

  function handleDeptChange(v: string) {
    // base-ui Select 는 같은 값을 다시 골라도 onValueChange 를 발화한다(6.3 High 재현 클래스) —
    // 그대로 두면 doctorsLoading 만 켜지고 로더 effect([deptId])가 재실행되지 않아 영구 잠긴다.
    if (v === deptId) return;
    setDeptId(v);
    // 진료과가 바뀌면 의사·슬롯 선택을 초기화하고 그 과 의사를 새로 로드한다.
    setDoctorId(null);
    setDoctors(null);
    setDoctorsLoading(true);
    setTakenMs(null); // 이전 의사의 점유 표시가 남지 않게(새 의사 선택 시 재조회).
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
    // 6.3 미러(Story 5.1 AC7): 상주 페이지를 오래 열어두면 고른 슬롯이 지나간다 — 제출 직전
    // 재검증으로 인라인 안내한다(서버 400 이 최종 방어, 여긴 UX 층).
    if (selectedIso && new Date(selectedIso).getTime() <= new Date().getTime()) {
      setSlotErr("고른 시간이 이미 지났어요. 다른 시간을 골라 주세요.");
      setSelectedIso(null);
      return;
    }
    // 빠른 더블클릭이 disabled 리렌더 커밋 전에 두 번 들어오면 중복 예약이 생긴다 — ref 로 즉시 차단.
    if (submittingRef.current) return;
    submittingRef.current = true;

    setSubmitting(true);
    try {
      const appt = await api.createAppointment({
        patient_id: patient.id,
        hospital_department_id: Number(deptId),
        // 자동 배정(Story 5.2)은 null — 서버가 그 진료과의 빈 의사를 골라 응답에 채워 준다.
        doctor_id: doctorId === AUTO_DOCTOR ? null : Number(doctorId),
        reserved_at: selectedIso as string,
      });
      setCreated(appt);
      // 성공 문구는 정직하게 — 생성 직후 status 는 대기라 "확정"이라 하지 않는다(UX-DR10).
      toast.success("예약을 접수했어요. 상태는 '대기'로 시작해요.");
      // 방금 잡은 슬롯 처리 — **직접 선택 모드만** 즉시 taken(5.1 리뷰 P1: 안 하면 그 셀이 계속
      // "예약 가능"으로 남아 재제출 시 자기 예약과 충돌하는 409 를 받는다). 자동 모드는 낙관 마킹을
      // 하지 않는다 — 교집합 의미론상 다른 의사가 비어 있으면 그 셀은 여전히 "예약 가능"이 참이라
      // 마킹해도 재조회가 곧 되돌려 깜빡임만 남고, 재제출도 409 가 아니라 다른 의사 201 이다
      // (Story 5.2 코드리뷰 Med). 어느 모드든 아래 재조회가 서버 진실과 동기화한다.
      if (doctorId !== AUTO_DOCTOR) {
        const bookedMs = new Date(selectedIso as string).getTime();
        setTakenMs((prev) => new Set([...(prev ?? []), bookedMs]));
      }
      setAvailabilityNonce((n) => n + 1);
      // 같은 슬롯 중복 제출 방지 — 다시 예약하려면 슬롯을 새로 고르게 한다.
      setSelectedIso(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && selectedIso) {
        // 슬롯 충돌(Story 5.1, UX-DR7 도메인 거부) — 서버 detail 그대로 red 인라인 + 그 셀 즉시
        // taken + 선택 해제, 그리고 재조회로 다른 셀도 서버 진실과 동기화한다(toast 아님 — 폼 보존).
        setSlotErr(err.message);
        const failedMs = new Date(selectedIso).getTime();
        setTakenMs((prev) => new Set([...(prev ?? []), failedMs]));
        setSelectedIso(null);
        setAvailabilityNonce((n) => n + 1);
      } else {
        // request 가 오류를 한국어 메시지로 던진다(AD-10). 환자 톤이라 안심되게.
        toast.error(err instanceof Error ? err.message : "예약하지 못했어요. 다시 시도해 주세요.");
      }
    } finally {
      submittingRef.current = false;
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
  // 요약·슬롯 헤더 공용 라벨 — 자동 배정 모드에서도 렌더된다(Story 5.2).
  const doctorLabel =
    doctorId === AUTO_DOCTOR ? "자동 배정" : doctorName ? `${doctorName} 선생님` : null;
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

          {/* 담당 의사 (필수 — 직접 선택 또는 자동 배정, Story 5.2). 빈 선택≠자동: 미선택 제출은
              여전히 인라인 에러다(실수로 자동 배정되는 사고 방지 — 비관적 UX). */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="doctor">
              담당 의사 <span className="text-destructive">*</span>
            </Label>
            <Select
              items={doctorItems}
              value={doctorId}
              onValueChange={(v) => {
                if (v === doctorId) return; // 동일값 재발화 가드 — taken 을 불필요하게 지우지 않는다.
                setDoctorId(v as string);
                setDoctorErr(null);
                // 이전 의사의 점유가 새 의사 그리드에 잔상으로 남지 않게(리뷰 P2 — false-block 방향은
                // 서버 백스톱이 없다). 새 응답이 오면 effect 가 다시 채운다.
                setTakenMs(null);
              }}
              disabled={!deptId || doctorsLoading}
            >
              <SelectTrigger
                id="doctor"
                className="w-full"
                aria-invalid={doctorErr ? true : undefined}
                aria-describedby={
                  // 오류문 우선, 자동 배정 선택 시엔 안내 캡션을 연결(SR 에도 동작 설명 전달 — 코드리뷰).
                  doctorErr
                    ? "doctor-error"
                    : doctorId === AUTO_DOCTOR
                      ? "doctor-auto-hint"
                      : undefined
                }
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
                {/* 자동 배정 — 항상 첫 항목(의사 목록이 로드된 뒤에만 Select 가 열린다). */}
                <SelectItem value={AUTO_DOCTOR}>자동 배정</SelectItem>
                {(doctors ?? []).map((doc) => (
                  <SelectItem key={doc.id} value={String(doc.id)}>
                    {doc.name} 선생님
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {doctorId === AUTO_DOCTOR && !doctorErr && (
              <p id="doctor-auto-hint" className="text-xs text-muted-foreground">
                고른 시간이 빈 선생님 중 한 분이 자동으로 배정돼요.
              </p>
            )}
            {doctorErr && (
              <p id="doctor-error" role="alert" className="text-sm text-destructive">
                {doctorErr}
              </p>
            )}
          </div>

          {/* 날짜 (필수) — 오늘부터 7일. 날짜를 바꾸면 그 날의 슬롯으로 갱신하고 시간 선택을 초기화한다. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="date">
              날짜 <span className="text-destructive">*</span>
            </Label>
            <Select
              items={dateItems}
              value={selectedYmd}
              onValueChange={(v) => {
                // 동일 값 재발화 가드(6.3 Edge #11 클래스) — 같은 날짜 재선택이 고른 시간을 지우면 안 된다.
                if (v === selectedYmd) return;
                setSelectedYmd(v as string);
                setSelectedIso(null);
                setTakenMs(null); // 이전 날짜의 점유 표시가 새 날짜에 비치지 않게(effect 가 재조회).
                setSlotErr(null);
              }}
            >
              <SelectTrigger id="date" className="w-full">
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

          {/* 30분 슬롯 피커 (필수) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              {/* radiogroup 은 form control 이 아니라 <label> 대신 span id + aria-labelledby 로
                  연결한다(6.3 픽스 미러 — 짝 없는 <label> 은 DevTools a11y 이슈를 낸다). */}
              <span id="slot-label" className="text-sm leading-none font-medium">
                시간 선택 (30분 단위) <span className="text-destructive">*</span>
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {dayLabel}
                {doctorLabel ? ` · ${doctorLabel}` : ""}
              </span>
            </div>
            {slots.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                이 날짜엔 예약 가능한 시간이 없어요. 다른 날짜를 골라 주세요.
              </p>
            ) : (
              <SlotPicker
                slots={slots}
                value={selectedIso}
                ariaLabelledBy="slot-label"
                takenMs={takenMs ?? undefined}
                onChange={(iso) => {
                  setSelectedIso(iso);
                  setSlotErr(null);
                }}
              />
            )}
            {/* 남은 슬롯이 전부 점유됐을 때의 막다른 길 안내(AC5) — 슬롯 0개(시간 지남)와 구분. */}
            {slots.length > 0 &&
              takenMs !== null &&
              slots.every((s) => takenMs.has(new Date(s.iso).getTime())) && (
                <p role="status" className="text-sm text-muted-foreground">
                  이 날짜는 예약이 모두 찼어요. 다른 날짜를 골라 주세요.
                </p>
              )}
            {slotErr && (
              <p role="alert" className="text-sm text-destructive">
                {slotErr}
              </p>
            )}
          </div>

          {/* 요약 — 모두 골랐을 때 확인용. 자동 배정 모드는 의사 자리에 "자동 배정"(Story 5.2). */}
          {deptName && doctorLabel && selectedSlotLabel && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
              📅 <b>{dayLabel} {selectedSlotLabel}</b> · {deptName} · {doctorLabel}으로 예약해요.
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
