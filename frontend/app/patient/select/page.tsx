"use client";

// 환자 신원 선택 (FR-2, Story 1.5). 등록 환자 목록(GET /patients, 1.4)에서 본인을 고르면
// 그 환자로 컨텍스트가 고정되고, 이후 환자 화면이 그 데이터만 보여준다.
// 로그인이 없어 누구나 고를 수 있다 — 앱 레벨 필터일 뿐 보안 격리가 아니다(AD-8, UX-DR8).
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1, AD-10).
// 환자 화면이라 단일 컬럼·여유 있는 카드(UX-DR11) + 안심되는 해요체(UX-DR10).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/error-state";
import { RoleContextBar } from "@/components/role-context-bar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Patient } from "@/lib/api";
import { orDash } from "@/lib/format";
import { usePatientIdentity } from "@/lib/patient-identity";

// 성별 역매핑 — DB 는 M/F/null, 화면은 남/여/—(1.3 성별 규약, 1.4 목록과 동일).
const GENDER_LABEL: Record<string, string> = { M: "남", F: "여" };
function genderText(gender: string | null): string {
  return gender ? (GENDER_LABEL[gender] ?? gender) : "—";
}
// 동명이인을 구분할 수 있게 식별 정보를 함께 싣는다(UX-DR9).
// 이름만으로 등록된 환자(1.3 이 허용 — 생년월일·성별 모두 null)는 표시할 식별 정보가 없어
// 동명이인이 시각·스크린리더 양쪽에서 완전히 같아진다 → 그땐 등록번호(id)로라도 가른다.
// 목록 자체가 무인증 데모라 이미 공개돼 있으므로(AD-8) id 노출이 새로 여는 위험은 없다.
function identityDetail(p: Patient): string {
  const parts = [orDash(p.birth_date), genderText(p.gender)].filter((v) => v !== "—");
  return parts.length > 0 ? parts.join(" · ") : `등록번호 ${p.id}`;
}

function accessibleLabel(p: Patient): string {
  return `${p.name} (${identityDetail(p)}) — 이 환자로 계속하기`;
}

export default function PatientSelectPage() {
  const router = useRouter();
  // 이미 신원이 있는 사용자('다른 환자'로 들어온 경우)에게 현재 신원과 복귀 경로를 준다 —
  // 없으면 마음을 바꿔도 홈으로 돌아갈 인앱 경로가 없는 막다른 골목이 된다(AC2).
  const { patient, selectPatient } = usePatientIdentity();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  // 조회 실패를 빈 상태와 구분한다 — 오류를 빈 상태로 렌더하면 백엔드 다운을 "환자 없음"으로 오인한다(1.4 리뷰 교훈).
  const [error, setError] = useState<string | null>(null);
  // 오류 후 "다시 시도" 재조회 트리거(effect 의존성).
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    // 검색 없이 전체 목록을 부른다 — 1.4 가 이 스토리를 위해 그렇게 설계했다.
    // ⚠️ setLoading(true) 는 첫 await 이전이라 effect 실행 중 **동기적으로** 돈다 —
    // async 함수로 감쌌다고 비동기가 되는 게 아니라 린트 규칙의 검출만 피한 것이다.
    // loading 초기값이 이미 true 라 최초 마운트엔 무해하고, 재시도(reloadNonce) 때만
    // 렌더가 한 번 더 도는 정도라 그대로 둔다. 이 패턴을 "effect 내 동기 setState 가 아니다"로
    // 오해해 다른 곳에 복제하지 말 것.
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const rows = await api.getPatients();
        if (cancelled) return;
        setPatients(rows);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // request 가 한국어 메시지로 던진다(AD-10). 환자 톤이라 안심되게.
        const message =
          err instanceof Error ? err.message : "환자 목록을 불러오지 못했어요.";
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  function handleSelect(p: Patient) {
    selectPatient({ id: p.id, name: p.name });
    router.push("/patient");
  }

  // 렌더 우선순위: 로딩 > 오류 > 빈 상태 > 목록. 오류일 때는 빈 상태를 띄우지 않는다.
  const isEmpty = !loading && !error && patients.length === 0;

  return (
    <>
      {/* 신원이 있으면 바가 그 이름을 유지해 보여주고(AC2), 액션은 '돌아가기'로 바꾼다 —
          이 화면에서 '다른 환자'는 자기 자신을 가리키는 링크가 된다. */}
      <RoleContextBar
        role="환자"
        patientName={patient?.name}
        patientAction={patient ? "back" : "none"}
      />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <h1 className="text-[28px] font-bold leading-tight">누구신가요?</h1>
        <p className="mt-2 text-muted-foreground">
          {patient
            ? `지금은 ${patient.name}님으로 보고 있어요. 다른 분을 고르시거나, 그대로 두시려면 돌아가기를 눌러 주세요.`
            : "목록에서 본인을 골라 주세요. 고른 뒤에는 그 분의 예약과 진료 기록만 보여드려요."}
        </p>

        {/* 무인증 데모 고지 (AC3, UX-DR8, AD-8) — 정보 배너라 destructive(red) 를 쓰지 않는다.
            목록 상태와 무관하게 항상 보이도록 분기 밖에 둔다. */}
        <Card className="mt-6 gap-2 bg-muted/50 p-4">
          <p className="text-sm font-medium">잠깐, 알려드릴 게 있어요</p>
          <p className="text-sm text-muted-foreground">
            지금은 로그인이 없어 누구나 목록에서 환자를 고를 수 있어요(데모). 화면을 나눠 보여줄
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
              {patients.map((p) => (
                <li key={p.id}>
                  {/* div+onClick 이 아니라 button 이라야 키보드로 도달·선택된다(UX-DR9). */}
                  <button
                    type="button"
                    onClick={() => handleSelect(p)}
                    aria-label={accessibleLabel(p)}
                    className="w-full rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Card className="gap-1 p-5 transition-colors hover:bg-accent">
                      <span className="text-base font-semibold">{p.name}</span>
                      {/* 시각 사용자도 동명이인을 가를 수 있게 라벨과 같은 식별 정보를 노출한다. */}
                      <span className="text-sm text-muted-foreground">{identityDetail(p)}</span>
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

// 빈 상태 — 환자는 스스로 등록할 수 없다(등록은 접수 직원 몫, FR-4).
// 그래서 직원 목록(1.4)과 달리 "신규 환자 등록" 버튼을 두지 않는다.
function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-lg font-medium">아직 등록된 환자가 없어요.</p>
      <p className="mt-1 text-muted-foreground">
        접수 직원에게 등록을 요청하신 뒤 다시 찾아와 주세요.
      </p>
    </div>
  );
}
