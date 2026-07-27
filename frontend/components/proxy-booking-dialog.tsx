"use client";

// 직원 대리 예약 다이얼로그 (FR-18, Story 6.3). 직원이 환자를 골라 대신 예약을 만든다.
// 재사용만 한다 — 환자 검색은 1.4(`GET /patients?search=`), 예약 생성은 2.1(`POST /appointments`)
// 계약 그대로다. 신규 엔드포인트·신규 API 클라이언트 메서드·신규 도메인 로직 0.
//
// 이 컴포넌트는 목록을 모른다 — 생성된 예약을 onCreated 로 올려보내고 목록 반영은 페이지가 소유한다.
// 부모(예약 관리 페이지)는 열 때마다 `key` 를 바꿔 이 컴포넌트를 **새로 마운트**한다 — 시각 계산
// (오늘부터 7일·지난 슬롯 필터)이 "여는 시점" 기준이어야 하기 때문이다. 닫힌 채 상주하며 마운트
// 시각에 굳으면, 화면을 오래 열어둔 접수 데스크에서 이미 지난 슬롯이 그대로 예약 가능해진다
// (코드리뷰 4층 공통 지적). 닫을 때 resetForm 도 함께 걸어 두 겹으로 막는다.
//
// Story 5.1(FR-15): (의사, 날짜) 선택 시 점유 슬롯을 받아 taken 셀로 그리고, 제출 충돌(409)은
// red 인라인 + 그 셀 taken 갱신으로 처리한다(환자 예약 화면과 동일 규칙). 열 때마다 remount 라
// 가용성도 "여는 시점" 기준으로 신선하다. walk-in 즉시 진료는 Epic 5.3.

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
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
import {
  api,
  ApiError,
  type Appointment,
  type Department,
  type Doctor,
  type Patient,
} from "@/lib/api";
import { formatSeoulDayLabel, seoulDayOptions, slotsForSeoulDay } from "@/lib/booking-slots";

// nullable 표시 필드는 비어 있으면 —(1.4 환자 목록과 같은 표기 규약).
function orDash(value: string | null): string {
  return value && value.trim() ? value : "—";
}

// 첫 오류 필드로 스크롤·포커스한다 — 390×844에서 아래까지 스크롤한 채 제출하면 인라인 오류가 전부
// 화면 밖(위쪽)에 렌더돼 버튼이 먹통인 것처럼 보인다. base-ui 트리거에 ref 를 꽂는 대신 이미 있는
// id 로 찾는다(이벤트 핸들러에서만 호출 — 렌더 중 DOM 접근 아님).
function revealField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.focus();
}

export function ProxyBookingDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 생성된 예약(정규 모델)을 목록 소유자에게 올려보낸다 — 목록 반영 방식은 페이지가 정한다. */
  onCreated: (appointment: Appointment) => void;
}) {
  // 환자 검색·선택 (AC2 — 1.4 디바운스 서버 검색 재사용)
  const [search, setSearch] = useState("");
  // null = 아직 조회 전(리셋 직후·첫 열림). [] = 조회했는데 결과 0건. 둘을 섞으면 로딩 중에
  // "등록된 환자가 없어요"라는 거짓 문구가 뜬다(빈 상태 ≠ 미조회).
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  // 조회 실패를 빈 결과와 구분한다 — 오류를 빈 상태로 렌더하면 백엔드 다운을 "환자 없음"으로 오인한다(1.4 규율).
  const [searchError, setSearchError] = useState<string | null>(null);
  // 현재 목록이 어떤 검색어에서 나왔는지 — 빈 상태 문구(등록 0 vs 검색 결과 0)를 가른다.
  const [activeTerm, setActiveTerm] = useState("");
  const [searchNonce, setSearchNonce] = useState(0);
  const [patient, setPatient] = useState<Patient | null>(null);

  // 예약 폼 (AC3 — 2.1 진료과→의사→날짜→슬롯 계약 재사용)
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [deptLoadError, setDeptLoadError] = useState<string | null>(null);
  const [deptNonce, setDeptNonce] = useState(0);
  const [deptId, setDeptId] = useState<string | null>(null);

  const [doctors, setDoctors] = useState<Doctor[] | null>(null);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [doctorLoadError, setDoctorLoadError] = useState<string | null>(null);
  const [doctorNonce, setDoctorNonce] = useState(0);
  const [doctorId, setDoctorId] = useState<string | null>(null);

  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  // 점유 슬롯(epoch ms, Story 5.1) — null 이면 미조회/조회 실패(taken 없이 렌더). nonce 는 409 후 재조회.
  const [takenMs, setTakenMs] = useState<ReadonlySet<number> | null>(null);
  const [availabilityNonce, setAvailabilityNonce] = useState(0);

  // 인라인 검증 오류 (AC5)
  const [patientErr, setPatientErr] = useState<string | null>(null);
  const [deptErr, setDeptErr] = useState<string | null>(null);
  const [doctorErr, setDoctorErr] = useState<string | null>(null);
  const [slotErr, setSlotErr] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  // 더블클릭 재진입 방지 — disabled 리렌더 커밋 전 두 번째 클릭이 중복 예약을 만든다(2.1·2.2 패턴).
  const submittingRef = useRef(false);

  // 오늘(서울)부터 7일 선택지 — 부모가 열 때마다 remount 하므로 이 마운트 = 이번 열림 시각이다.
  // (Date.now() 는 react-hooks/purity 린트가 막아 new Date() 를 쓴다.)
  const dayOptions = useMemo(() => seoulDayOptions(new Date(), 7), []);
  // 기본 날짜 = 남은 슬롯이 있는 첫 날. 진료 시간이 끝난 저녁에 열면 오늘은 슬롯이 0개라, 그냥 오늘을
  // 기본값으로 두면 "예약 가능한 시간이 없어요"만 보이고 직원이 날짜부터 바꿔야 한다.
  const defaultYmd = useMemo(() => {
    const nowMs = new Date().getTime();
    const firstOpen = dayOptions.find((d) =>
      slotsForSeoulDay(d.ymd).some((s) => new Date(s.iso).getTime() > nowMs),
    );
    return firstOpen?.ymd ?? dayOptions[0].ymd;
  }, [dayOptions]);
  // 선택 전에는 기본 날짜를 쓴다 — 리셋 후 남은 stale ymd 가 없다.
  const effectiveYmd = selectedYmd ?? defaultYmd;

  // 지난 시각 슬롯은 제거한다 — 오늘의 이미 지난 시간(15시에 09시 예약)을 걸러 과거 예약을 막는다.
  // 이 목록도 마운트(=열림) 시각 기준이라, 다이얼로그를 오래 열어둔 경우는 제출 직전 재검증이 잡는다.
  const slots = useMemo(() => {
    const nowMs = new Date().getTime();
    return slotsForSeoulDay(effectiveYmd).filter((s) => new Date(s.iso).getTime() > nowMs);
  }, [effectiveYmd]);
  const dayLabel = useMemo(() => formatSeoulDayLabel(effectiveYmd), [effectiveYmd]);

  // 진료과 로드 — 열렸을 때 1회. 닫힌 채 마운트돼 있으므로 마운트 시점에 네트워크를 때리지 않는다.
  // 다른 로더와 같은 cancelled 가드를 둔다(늦게 도착한 실패가 성공 위에 오류를 덮어쓰지 않게).
  useEffect(() => {
    if (!open || departments !== null) return;
    let cancelled = false;
    api
      .getDepartments()
      .then((rows) => {
        if (cancelled) return;
        setDepartments(rows);
        setDeptLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDeptLoadError(err instanceof Error ? err.message : "진료과를 불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, departments, deptNonce]);

  // 환자 검색 — 250ms 디바운스 후 서버 필터(클라이언트 배열 필터 아님, 1.4 계약).
  // 환자를 이미 골랐으면 목록이 접혀 있어 조회하지 않는다.
  useEffect(() => {
    if (!open || patient) return;
    let cancelled = false;
    // setLoading 을 타이머 콜백 안에서 호출한다 — effect 본문의 동기 setState 는 React 19 린트가 막는다.
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const rows = await api.getPatients(search);
        if (cancelled) return;
        setResults(rows);
        setActiveTerm(search.trim());
        setSearchError(null);
      } catch (err) {
        if (cancelled) return;
        // 오류는 별도 상태로 — 빈 결과와 구분한다(1.4 규율). request 가 한국어로 던진다(AD-10).
        setSearchError(err instanceof Error ? err.message : "환자 목록을 불러오지 못했어요.");
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, patient, search, searchNonce]);

  // 진료과가 바뀌면 그 과의 의사만 로드한다. 로딩 표시는 진료과 변경 핸들러에서 켜고 여기서 끈다(2.1 패턴).
  useEffect(() => {
    if (!deptId) return;
    let cancelled = false;
    api
      .getDoctors(Number(deptId))
      .then((rows) => {
        if (cancelled) return;
        setDoctors(rows);
        setDoctorLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // toast-only 로 흘리지 않는다 — 다이얼로그 안 인라인 오류 + 재시도(2.3 이월 교훈).
        setDoctorLoadError(err instanceof Error ? err.message : "의사 목록을 불러오지 못했어요.");
      })
      .finally(() => {
        if (!cancelled) setDoctorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deptId, doctorNonce]);

  // (의사, 날짜)를 고르면 그 날의 점유 슬롯을 미리 받아 taken 셀로 그린다(Story 5.1, UX-DR3).
  // 열렸을 때만 조회한다(닫힌 채 네트워크 금지 규율). 조회 실패는 치명 아님 — taken 없이 렌더하고
  // 제출 시 서버 409 가 최종 방어한다(조용한 강등, 콘솔 0 유지).
  // stale taken 비우기는 진료과·날짜 변경 핸들러·resetForm 이 담당한다(effect 동기 setState 린트 금지).
  useEffect(() => {
    if (!open || !doctorId) return;
    let cancelled = false;
    const daySlots = slotsForSeoulDay(effectiveYmd);
    const startIso = daySlots[0].iso;
    // 범위는 [첫 슬롯, 마지막 슬롯 + 30분) — 마지막 슬롯의 점유까지 포함한다.
    const endIso = new Date(
      new Date(daySlots[daySlots.length - 1].iso).getTime() + 1_800_000,
    ).toISOString();
    api
      .getAvailability(Number(doctorId), startIso, endIso)
      .then((av) => {
        if (cancelled) return;
        const next = new Set(av.taken.map((t) => new Date(t).getTime()));
        setTakenMs(next);
        // 이미 고른 슬롯이 점유로 판명되면 선택을 해제해 충돌 제출을 예방한다.
        setSelectedIso((prev) => (prev && next.has(new Date(prev).getTime()) ? null : prev));
      })
      .catch(() => {
        if (!cancelled) setTakenMs(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, doctorId, effectiveYmd, availabilityNonce]);

  // base-ui Select 계약: Root 에 items 를 넘겨야 SelectValue 라벨이 렌더된다(2.1·2.3이 겪은 함정).
  const deptItems = useMemo(
    () => Object.fromEntries((departments ?? []).map((d) => [String(d.id), d.name])),
    [departments],
  );
  const doctorItems = useMemo(
    () => Object.fromEntries((doctors ?? []).map((d) => [String(d.id), `${d.name} 선생님`])),
    [doctors],
  );
  const dateItems = useMemo(
    () => Object.fromEntries(dayOptions.map((d) => [d.ymd, d.label])),
    [dayOptions],
  );

  // 참조 데이터가 "성공적으로 비어 있는" 경우 — 오류가 아니라서 조용히 빈 드롭다운만 남으면 막다른 길이 된다.
  const deptEmpty = departments !== null && departments.length === 0 && !deptLoadError;
  const doctorsEmpty =
    !!deptId && doctors !== null && doctors.length === 0 && !doctorsLoading && !doctorLoadError;

  // 닫을 때 입력을 전부 비운다 — 부모가 remount 하지만(열 때 key 변경) 닫는 순간에도 잔상이 남지 않게.
  // 참조 데이터(진료과)는 남겨 다음 열림에서 재조회하지 않는다.
  function resetForm() {
    setSearch("");
    setResults(null);
    setSearchLoading(false);
    setSearchError(null);
    setActiveTerm("");
    setPatient(null);
    setDeptId(null);
    setDoctors(null);
    setDoctorsLoading(false);
    setDoctorLoadError(null);
    setDoctorId(null);
    setSelectedYmd(null);
    setSelectedIso(null);
    setTakenMs(null);
    setPatientErr(null);
    setDeptErr(null);
    setDoctorErr(null);
    setSlotErr(null);
    setSubmitting(false);
    submittingRef.current = false;
  }

  function handleOpenChange(next: boolean) {
    // 저장 중에는 닫히지 않게 막는다 — 닫는 순간 입력이 리셋되는데 그 뒤 응답이 도착하면
    // 다시 연 다이얼로그를 지우고 닫아버린다(늦은 성공 응답의 납치). 저장은 짧다.
    if (!next && submittingRef.current) return;
    if (!next) resetForm();
    onOpenChange(next);
  }

  function selectPatient(p: Patient) {
    setPatient(p);
    setPatientErr(null);
  }

  function handleDeptChange(v: string) {
    // base-ui Select 는 같은 값을 다시 골라도 onValueChange 를 발화한다. 아래 초기화를 그대로 태우면
    // doctorsLoading=true 로 잠기는데 deptId 가 안 바뀌어 로더 effect 가 재실행되지 않아
    // 담당 의사 드롭다운이 "불러오는 중…"에서 영구 비활성이 된다(코드리뷰 재현 확인).
    if (v === deptId) return;
    setDeptId(v);
    // 진료과가 바뀌면 의사 선택을 초기화하고 그 과 의사를 새로 로드한다(2.1 패턴).
    setDoctorId(null);
    setDoctors(null);
    setDoctorsLoading(true);
    setDoctorLoadError(null);
    setTakenMs(null); // 이전 의사의 점유 표시가 남지 않게(새 의사 선택 시 재조회).
    setDeptErr(null);
    setDoctorErr(null);
  }

  function handleDateChange(v: string) {
    // 같은 날짜 재선택도 onValueChange 를 발화한다 — 그대로 두면 고른 시간이 이유 없이 사라진다.
    if (v === effectiveYmd) return;
    setSelectedYmd(v);
    setSelectedIso(null);
    setTakenMs(null); // 이전 날짜의 점유 표시가 새 날짜에 비치지 않게(effect 가 재조회).
    setSlotErr(null);
  }

  async function handleSubmit() {
    // 인라인 필수 검증 — 서버 도달 전에 먼저 막는다(UX-DR9, AC5).
    let firstErrorId: string | null = null;
    if (!patient) {
      setPatientErr("환자를 선택해 주세요.");
      firstErrorId ??= "proxy-patient-search";
    }
    if (!deptId) {
      setDeptErr("진료과를 선택해 주세요.");
      firstErrorId ??= "proxy-dept";
    }
    if (!doctorId) {
      setDoctorErr("담당 의사를 선택해 주세요.");
      firstErrorId ??= "proxy-doctor";
    }
    if (!selectedIso) {
      // 그 날짜에 남은 슬롯이 아예 없으면 "시간을 고르세요"는 지킬 수 없는 지시다 — 날짜를 안내한다.
      setSlotErr(
        slots.length === 0
          ? "이 날짜엔 예약 가능한 시간이 없어요. 다른 날짜를 골라 주세요."
          : "예약할 시간을 골라주세요.",
      );
      firstErrorId ??= "proxy-slot-label";
    } else if (new Date(selectedIso).getTime() <= new Date().getTime()) {
      // 다이얼로그를 오래 열어두면 고를 때 미래였던 슬롯이 지나간다 — 제출 직전 재검증(UX 층).
      // Story 5.1부터 서버에도 과거 시각 가드(400)가 있어 최종 방어는 서버가 담당한다.
      setSlotErr("고른 시간이 이미 지났어요. 다른 시간을 골라 주세요.");
      setSelectedIso(null);
      firstErrorId ??= "proxy-slot-label";
    }
    // 명시적 null 체크로 타입을 좁힌다 — 플래그 변수로는 TS 가 좁히지 못해 as 캐스팅이 필요해진다.
    if (firstErrorId || !patient || !deptId || !doctorId || !selectedIso) {
      if (firstErrorId) revealField(firstErrorId);
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;

    setSubmitting(true);
    try {
      const appt = await api.createAppointment({
        patient_id: patient.id,
        hospital_department_id: Number(deptId),
        doctor_id: Number(doctorId),
        reserved_at: selectedIso,
      });
      onCreated(appt);
      // 생성 직후 status 는 대기다 — "확정"이라 하지 않는다(UX-DR10 정직). 직원 톤이라 간결하게.
      toast.success(`${appt.patient_name}님 예약을 만들었어요. 상태는 '대기'로 시작해요.`);
      submittingRef.current = false;
      resetForm();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // 슬롯 충돌(Story 5.1, UX-DR7 도메인 거부) — 서버 detail 그대로 red 인라인 + 그 셀 즉시
        // taken + 선택 해제, 재조회로 다른 셀도 동기화한다. 다이얼로그는 닫지 않는다(입력 보존).
        setSlotErr(err.message);
        const failedMs = new Date(selectedIso).getTime();
        setTakenMs((prev) => new Set([...(prev ?? []), failedMs]));
        setSelectedIso(null);
        setAvailabilityNonce((n) => n + 1);
        revealField("proxy-slot-label");
      } else {
        // 4xx {detail} 한국어를 그대로 보여준다(AD-10). 실패해도 닫지 않아 입력이 남는다(AC5).
        toast.error(
          err instanceof Error ? err.message : "예약을 만들지 못했어요. 다시 시도해 주세요.",
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const deptName = departments?.find((d) => String(d.id) === deptId)?.name ?? null;
  const doctorName = doctors?.find((d) => String(d.id) === doctorId)?.name ?? null;
  const slotLabel = slots.find((s) => s.iso === selectedIso)?.label ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal>
      {/* 기본 DialogContent 는 max-w-md·높이 무제한 — 슬롯 격자까지 넣으면 모바일에서 버튼이 화면 밖으로
          나간다. 폭을 넓히고 뷰포트 85%에서 내부 스크롤시킨다(AC6).
          disablePointerDismissal: 배경 오터치 한 번에 다 채운 폼이 확인 없이 날아가는 걸 막는다
          (닫기는 [닫기] 버튼·Esc 로만). */}
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>대리 예약</DialogTitle>
          <DialogDescription>
            전화·방문으로 온 환자의 예약을 직원이 대신 만들어요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* 환자 (필수) — 폼의 첫 필드. 여기서 신규 등록으로 이탈해도 잃을 입력이 적게 맨 위에 둔다. */}
          {patient ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-none font-medium">
                환자 <span className="text-destructive">*</span>
              </p>
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{patient.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {orDash(patient.birth_date)} · {orDash(patient.phone)} · #{patient.id}
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={() => setPatient(null)}>
                  변경
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="proxy-patient-search">
                환자 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="proxy-patient-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름 일부를 입력하세요"
                autoComplete="off"
                aria-invalid={patientErr ? true : undefined}
                aria-describedby={patientErr ? "proxy-patient-error" : undefined}
              />
              <div className="max-h-48 overflow-y-auto rounded-lg border">
                {searchLoading || (results === null && !searchError) ? (
                  <div className="flex flex-col gap-2 p-2" aria-hidden>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full rounded-md" />
                    ))}
                  </div>
                ) : searchError ? (
                  <div className="flex items-center justify-between gap-2 p-3">
                    <p role="alert" className="text-sm text-destructive">
                      {searchError}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSearchNonce((n) => n + 1)}
                    >
                      다시 시도
                    </Button>
                  </div>
                ) : results !== null && results.length === 0 ? (
                  <div role="status" className="p-3 text-sm text-muted-foreground">
                    {activeTerm
                      ? `‘${activeTerm}’ 검색 결과가 없어요.`
                      : "등록된 환자가 없어요."}{" "}
                    <Link
                      href="/staff/patients/new"
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      신규 환자 등록
                    </Link>
                    에서 먼저 등록해 주세요.
                  </div>
                ) : (
                  <ul>
                    {(results ?? []).map((p) => (
                      <li key={p.id}>
                        {/* 동명이인이 있을 수 있어 생년월일·연락처에 더해 환자 번호(#id)까지 보여준다
                            — 셋 다 비어 있어도 번호로는 구분된다(db 계층도 id 로 tie-break). */}
                        <button
                          type="button"
                          onClick={() => selectPatient(p)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {orDash(p.birth_date)} · {orDash(p.phone)} · #{p.id}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {patientErr && (
                <p id="proxy-patient-error" role="alert" className="text-sm text-destructive">
                  {patientErr}
                </p>
              )}
            </div>
          )}

          {/* 진료과 (필수) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="proxy-dept">
              진료과 <span className="text-destructive">*</span>
            </Label>
            <Select
              items={deptItems}
              value={deptId}
              onValueChange={(v) => handleDeptChange(v as string)}
            >
              <SelectTrigger
                id="proxy-dept"
                className="w-full"
                aria-invalid={deptErr ? true : undefined}
                aria-describedby={
                  deptErr ? "proxy-dept-error" : deptEmpty ? "proxy-dept-empty" : undefined
                }
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
              <div className="flex items-center justify-between gap-2">
                <p role="alert" className="text-sm text-destructive">
                  {deptLoadError}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDeptLoadError(null);
                    setDepartments(null);
                    setDeptNonce((n) => n + 1);
                  }}
                >
                  다시 시도
                </Button>
              </div>
            )}
            {deptEmpty && (
              <div className="flex items-center justify-between gap-2">
                <p id="proxy-dept-empty" role="status" className="text-sm text-muted-foreground">
                  선택할 수 있는 진료과가 없어요.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDepartments(null);
                    setDeptNonce((n) => n + 1);
                  }}
                >
                  다시 시도
                </Button>
              </div>
            )}
            {deptErr && (
              <p id="proxy-dept-error" role="alert" className="text-sm text-destructive">
                {deptErr}
              </p>
            )}
          </div>

          {/* 담당 의사 (필수, 직접 선택 — P0) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="proxy-doctor">
              담당 의사 <span className="text-destructive">*</span>
            </Label>
            <Select
              items={doctorItems}
              value={doctorId}
              onValueChange={(v) => {
                setDoctorId(v as string);
                setDoctorErr(null);
              }}
              disabled={!deptId || doctorsLoading || doctorsEmpty}
            >
              <SelectTrigger
                id="proxy-doctor"
                className="w-full"
                aria-invalid={doctorErr ? true : undefined}
                aria-describedby={
                  doctorErr
                    ? "proxy-doctor-error"
                    : doctorsEmpty
                      ? "proxy-doctor-empty"
                      : undefined
                }
              >
                <SelectValue
                  placeholder={
                    !deptId
                      ? "진료과를 먼저 선택하세요"
                      : doctorsLoading
                        ? "의사를 불러오는 중…"
                        : doctorsEmpty
                          ? "선택할 수 있는 의사가 없어요"
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
            {doctorLoadError && (
              <div className="flex items-center justify-between gap-2">
                <p role="alert" className="text-sm text-destructive">
                  {doctorLoadError}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDoctorLoadError(null);
                    setDoctorsLoading(true);
                    setDoctorNonce((n) => n + 1);
                  }}
                >
                  다시 시도
                </Button>
              </div>
            )}
            {doctorsEmpty && (
              <p id="proxy-doctor-empty" role="status" className="text-sm text-muted-foreground">
                이 진료과엔 등록된 의사가 없어요. 다른 진료과를 골라 주세요.
              </p>
            )}
            {doctorErr && (
              <p id="proxy-doctor-error" role="alert" className="text-sm text-destructive">
                {doctorErr}
              </p>
            )}
          </div>

          {/* 날짜 (필수) — 오늘부터 7일. 날짜를 바꾸면 그 날의 슬롯으로 갱신하고 시간 선택을 초기화한다. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="proxy-date">
              날짜 <span className="text-destructive">*</span>
            </Label>
            <Select
              items={dateItems}
              value={effectiveYmd}
              onValueChange={(v) => handleDateChange(v as string)}
            >
              <SelectTrigger id="proxy-date" className="w-full">
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

          {/* 30분 슬롯 피커 (필수) — 2.1과 같은 컴포넌트. Story 5.1: taken(예약됨) 3상태. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              {/* radiogroup 은 form control 이 아니라 htmlFor 대신 id + aria-labelledby 로 연결한다.
                  <label> 이 아니라 <span> 인 이유: htmlFor 없는 <label> 은 짝이 없어 Chrome a11y 이슈
                  ("No label associated with a form field")로 잡힌다. 타이포는 Label 과 동일하게 맞춘다. */}
              <span id="proxy-slot-label" className="text-sm leading-none font-medium">
                시간 선택 (30분 단위) <span className="text-destructive">*</span>
              </span>
              <span className="truncate text-xs text-muted-foreground">{dayLabel}</span>
            </div>
            {slots.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                이 날짜엔 예약 가능한 시간이 없어요. 다른 날짜를 골라 주세요.
              </p>
            ) : (
              // SlotPicker 는 동결 컴포넌트라 aria-describedby 를 받지 않는다 — 오류가 있을 때
              // 그룹 라벨 체인(aria-labelledby)에 오류 문단 id 를 이어 붙여 SR 이 함께 읽게 한다.
              <SlotPicker
                slots={slots}
                value={selectedIso}
                ariaLabelledBy={
                  slotErr ? "proxy-slot-label proxy-slot-error" : "proxy-slot-label"
                }
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
              <p id="proxy-slot-error" role="alert" className="text-sm text-destructive">
                {slotErr}
              </p>
            )}
          </div>

          {/* 요약 — 모두 골랐을 때 확인용 */}
          {patient && deptName && doctorName && slotLabel && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              📅 <b>{dayLabel} {slotLabel}</b> · {deptName} · {doctorName} 선생님 · {patient.name}님
              (#{patient.id})
            </div>
          )}
        </div>

        <DialogFooter>
          {/* DialogClose 대신 일반 Button — 저장 중 닫기를 막아야 해서 닫기 경로를 handleOpenChange 로 모은다. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            닫기
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "예약 중…" : "예약 만들기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
