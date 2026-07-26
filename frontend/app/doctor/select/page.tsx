"use client";

// 의사 신원 선택 (FR-1b, Story 6.1). 전체 의사 목록(GET /doctors, 진료과 무관)에서 본인을 고르면
// 그 의사로 컨텍스트가 고정되고, 이후 의사 대시보드가 ?doctor_id= 로 그 의사 배정 예약만 보여준다.
// 로그인이 없어 누구나 고를 수 있다 — 앱 레벨 필터일 뿐 보안 격리가 아니다(AD-8, UX-DR8).
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1, AD-10). patient/select 의 의사판(구조 미러).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { RoleContextBar } from "@/components/role-context-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Doctor } from "@/lib/api";
import { useDoctorIdentity } from "@/lib/doctor-identity";

// 동명이인 의사를 구분할 수 있게 소속 진료과를 함께 싣는다(UX-DR9). 시드 의사는 모두 소속이 있어
// 진료과가 식별 정보가 된다(환자 select 의 생년월일·성별 자리).
function accessibleLabel(d: Doctor): string {
  return `${d.name} 선생님 (${d.department_name}) — 이 의사로 계속하기`;
}

export default function DoctorSelectPage() {
  const router = useRouter();
  // 이미 신원이 있는 사용자('다른 의사'로 들어온 경우)에게 현재 신원과 복귀 경로를 준다 —
  // 없으면 마음을 바꿔도 대시보드로 돌아갈 인앱 경로가 없는 막다른 골목이 된다(AC3).
  const { doctor, selectDoctor } = useDoctorIdentity();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  // 조회 실패를 빈 상태와 구분한다 — 오류를 빈 상태로 렌더하면 백엔드 다운을 "의사 없음"으로 오인한다(4.1 리뷰 교훈).
  const [error, setError] = useState<string | null>(null);
  // 오류 후 "다시 시도" 재조회 트리거(effect 의존성).
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    // patient/select 미러 — setLoading(true) 는 첫 await 이전이라 effect 실행 중 동기적으로 돈다.
    // loading 초기값이 이미 true 라 최초 마운트엔 무해하고, 재시도 때만 렌더가 한 번 더 도는 정도라 그대로 둔다.
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const rows = await api.getAllDoctors();
        if (cancelled) return;
        setDoctors(rows);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // request 가 한국어 메시지로 던진다(AD-10).
        const message =
          err instanceof Error ? err.message : "의사 목록을 불러오지 못했어요.";
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  function handleSelect(d: Doctor) {
    selectDoctor({ id: d.id, name: d.name });
    router.push("/doctor");
  }

  // 렌더 우선순위: 로딩 > 오류 > 빈 상태 > 목록. 오류일 때는 빈 상태를 띄우지 않는다.
  const isEmpty = !loading && !error && doctors.length === 0;

  return (
    <>
      {/* 신원이 있으면 바가 그 이름을 유지해 보여주고(AC3), 액션은 '돌아가기'로 바꾼다 —
          이 화면에서 '다른 의사'는 자기 자신을 가리키는 링크가 된다. */}
      <RoleContextBar
        role="의사"
        doctorName={doctor?.name}
        doctorAction={doctor ? "back" : "none"}
      />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <h1 className="text-[28px] font-bold leading-tight">어느 선생님이신가요?</h1>
        <p className="mt-2 text-muted-foreground">
          {doctor
            ? `지금은 ${doctor.name} 선생님으로 보고 있어요. 다른 분을 고르시거나, 그대로 두시려면 돌아가기를 눌러 주세요.`
            : "목록에서 본인을 골라 주세요. 고른 뒤에는 그 선생님께 배정된 예약을 보여드려요."}
        </p>

        {/* 무인증 데모 고지 (AC2, UX-DR8, AD-8) — 정보 배너라 destructive(red) 를 쓰지 않는다.
            목록 상태와 무관하게 항상 보이도록 분기 밖에 둔다(patient/select 미러). */}
        <Card className="mt-6 gap-2 bg-muted/50 p-4">
          <p className="text-sm font-medium">잠깐, 알려드릴 게 있어요</p>
          <p className="text-sm text-muted-foreground">
            지금은 로그인이 없어 누구나 목록에서 의사를 고를 수 있어요(데모). 화면을 나눠 보여줄
            뿐 진짜 보안 격리는 아니라서, 실제 개인정보를 넣지 말아 주세요.
          </p>
        </Card>

        <div className="mt-6">
          {loading ? (
            <SelectSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={() => setReloadNonce((n) => n + 1)} />
          ) : isEmpty ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col gap-3">
              {doctors.map((d) => (
                <li key={d.id}>
                  {/* div+onClick 이 아니라 button 이라야 키보드로 도달·선택된다(UX-DR9). */}
                  <button
                    type="button"
                    onClick={() => handleSelect(d)}
                    aria-label={accessibleLabel(d)}
                    className="w-full rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Card className="gap-1 p-5 transition-colors hover:bg-accent">
                      <span className="text-base font-semibold">{d.name} 선생님</span>
                      {/* 시각 사용자도 소속을 볼 수 있게 라벨과 같은 식별 정보를 노출한다. */}
                      <span className="text-sm text-muted-foreground">{d.department_name}</span>
                    </Card>
                  </button>
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
function SelectSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

// 조회 오류 — 빈 상태와 구분해 "다시 시도"를 제공(백엔드 다운을 "의사 없음"으로 오인 방지).
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-muted-foreground">{message}</p>
      <div className="mt-4">
        <Button variant="outline" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    </div>
  );
}

// 빈 상태 — 의사는 시드 참조 데이터라(FR-13) 정상 환경에선 비지 않는다. 시드 누락 방어용.
function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-lg font-medium">등록된 의사가 없어요.</p>
      <p className="mt-1 text-muted-foreground">
        시드 데이터가 준비됐는지 확인한 뒤 다시 찾아와 주세요.
      </p>
    </div>
  );
}
