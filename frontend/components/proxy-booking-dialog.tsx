"use client";

// 직원 대리 예약 다이얼로그 (FR-18, Story 6.3). 직원이 환자를 골라 대신 예약을 만든다.
// 재사용만 한다 — 환자 검색은 1.4(`GET /patients?search=`), 예약 생성은 2.1(`POST /appointments`)
// 계약 그대로다. 신규 엔드포인트·신규 API 클라이언트 메서드·신규 도메인 로직 0.
//
// 이 컴포넌트는 목록을 모른다 — 생성된 예약을 onCreated 로 올려보내고 목록 반영은 페이지가 소유한다.
// 예약 관리 페이지에 항상 마운트된 채 open 만 토글되므로, 닫을 때 입력을 리셋해 다음 열림을 깨끗이 한다
// (effect 본문의 동기 setState 는 React 19 린트가 막아 초기화를 이벤트 핸들러에서 한다).
//
// ⚠️ (의사, 슬롯) 가용성 충돌 검사·taken 셀·walk-in 즉시 진료는 Epic 5 — P0는 2.1과 동일하게
//    검사 없이 생성한다.

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { toast } from "sonner";

import { SlotPicker } from "@/components/slot-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
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
import { api, type Appointment, type Department, type Doctor, type Patient } from "@/lib/api";
import { formatSeoulDayLabel, seoulDayOptions, slotsForSeoulDay } from "@/lib/booking-slots";

// nullable 표시 필드는 비어 있으면 —(1.4 환자 목록과 같은 표기 규약).
function orDash(value: string | null): string {
  return value && value.trim() ? value : "—";
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

  // 인라인 검증 오류 (AC5)
  const [patientErr, setPatientErr] = useState<string | null>(null);
  const [deptErr, setDeptErr] = useState<string | null>(null);
  const [doctorErr, setDoctorErr] = useState<string | null>(null);
  const [slotErr, setSlotErr] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  // 더블클릭 재진입 방지 — disabled 리렌더 커밋 전 두 번째 클릭이 중복 예약을 만든다(2.1·2.2 패턴).
  const submittingRef = useRef(false);

  // 오늘(서울)부터 7일 선택지 — 마운트 1회 계산(2.1과 동일 계약).
  // (Date.now() 는 react-hooks/purity 린트가 막아 new Date() 를 쓴다.)
  // 알려진 한계: 페이지를 자정 넘겨 열어두면 첫 옵션이 어제를 가리킨다(2.1 deferred 와 동일 성격).
  // 지난 슬롯은 아래에서 걸러지므로 그 날짜는 "예약 가능한 시간이 없어요"로 표시되고, 나머지 날짜는 유효하다.
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
  const slots = useMemo(() => {
    const nowMs = new Date().getTime();
    return slotsForSeoulDay(effectiveYmd).filter((s) => new Date(s.iso).getTime() > nowMs);
  }, [effectiveYmd]);
  const dayLabel = useMemo(() => formatSeoulDayLabel(effectiveYmd), [effectiveYmd]);

  // 진료과 로드 — 열렸을 때 1회. 닫힌 채 마운트돼 있으므로 마운트 시점에 네트워크를 때리지 않는다.
  useEffect(() => {
    if (!open || departments !== null) return;
    api
      .getDepartments()
      .then((rows) => {
        setDepartments(rows);
        setDeptLoadError(null);
      })
      .catch((err: unknown) => {
        setDeptLoadError(err instanceof Error ? err.message : "진료과를 불러오지 못했어요.");
      });
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

  // 닫을 때 입력을 전부 비운다 — 이 컴포넌트는 계속 마운트돼 있어 state 가 그대로 남는다.
  // 참조 데이터(진료과)는 남겨 다음 열림에서 재조회하지 않는다.
  function resetForm() {
    setSearch("");
    setResults(null);
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
    setPatientErr(null);
    setDeptErr(null);
    setDoctorErr(null);
    setSlotErr(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function selectPatient(p: Patient) {
    setPatient(p);
    setPatientErr(null);
  }

  function handleDeptChange(v: string) {
    setDeptId(v);
    // 진료과가 바뀌면 의사 선택을 초기화하고 그 과 의사를 새로 로드한다(2.1 패턴).
    setDoctorId(null);
    setDoctors(null);
    setDoctorsLoading(true);
    setDoctorLoadError(null);
    setDeptErr(null);
    setDoctorErr(null);
  }

  async function handleSubmit() {
    // 인라인 필수 검증 — 서버 도달 전에 먼저 막는다(UX-DR9, AC5).
    let ok = true;
    if (!patient) {
      setPatientErr("환자를 선택해 주세요.");
      ok = false;
    }
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
    if (submittingRef.current) return;
    submittingRef.current = true;

    setSubmitting(true);
    try {
      const appt = await api.createAppointment({
        patient_id: patient.id,
        hospital_department_id: Number(deptId),
        doctor_id: Number(doctorId),
        reserved_at: selectedIso as string,
      });
      onCreated(appt);
      // 생성 직후 status 는 대기다 — "확정"이라 하지 않는다(UX-DR10 정직). 직원 톤이라 간결하게.
      toast.success(`${appt.patient_name}님 예약을 만들었어요. 상태는 '대기'로 시작해요.`);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      // 4xx {detail} 한국어를 그대로 보여준다(AD-10). 실패해도 닫지 않아 입력이 남는다(AC5).
      toast.error(err instanceof Error ? err.message : "예약을 만들지 못했어요. 다시 시도해 주세요.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const deptName = departments?.find((d) => String(d.id) === deptId)?.name ?? null;
  const doctorName = doctors?.find((d) => String(d.id) === doctorId)?.name ?? null;
  const slotLabel = slots.find((s) => s.iso === selectedIso)?.label ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* 기본 DialogContent 는 max-w-md·높이 무제한 — 슬롯 격자까지 넣으면 모바일에서 버튼이 화면 밖으로
          나간다. 폭을 넓히고 뷰포트 85%에서 내부 스크롤시킨다(AC6). */}
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>대리 예약</DialogTitle>
          <DialogDescription>
            전화·방문으로 온 환자의 예약을 직원이 대신 만들어요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* 환자 (필수) — 폼의 첫 필드. 여기서 신규 등록으로 이탈해도 잃을 입력이 없게 맨 위에 둔다. */}
          {patient ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                환자 <span className="text-destructive">*</span>
              </p>
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{patient.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {orDash(patient.birth_date)} · {orDash(patient.phone)}
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
                  <div className="p-3 text-sm text-muted-foreground">
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
                        <button
                          type="button"
                          onClick={() => selectPatient(p)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {orDash(p.birth_date)} · {orDash(p.phone)}
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
                aria-describedby={deptErr ? "proxy-dept-error" : undefined}
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
              disabled={!deptId || doctorsLoading}
            >
              <SelectTrigger
                id="proxy-doctor"
                className="w-full"
                aria-invalid={doctorErr ? true : undefined}
                aria-describedby={doctorErr ? "proxy-doctor-error" : undefined}
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
              onValueChange={(v) => {
                setSelectedYmd(v as string);
                setSelectedIso(null);
                setSlotErr(null);
              }}
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

          {/* 30분 슬롯 피커 (필수) — 2.1과 같은 컴포넌트·같은 상태(available/selected). */}
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
              <SlotPicker
                slots={slots}
                value={selectedIso}
                ariaLabelledBy="proxy-slot-label"
                onChange={(iso) => {
                  setSelectedIso(iso);
                  setSlotErr(null);
                }}
              />
            )}
            {slotErr && (
              <p role="alert" className="text-sm text-destructive">
                {slotErr}
              </p>
            )}
          </div>

          {/* 요약 — 모두 골랐을 때 확인용 */}
          {patient && deptName && doctorName && slotLabel && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              📅 <b>{dayLabel} {slotLabel}</b> · {deptName} · {doctorName} 선생님 · {patient.name}님
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose type="button">닫기</DialogClose>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "예약 중…" : "예약 만들기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
