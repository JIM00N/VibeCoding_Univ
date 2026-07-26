"use client";

// 직원 환자 목록·이름 검색 (FR-5, Story 1.4). GET /patients?search= 로 서버측 필터.
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1, AD-10).
// 반응형(UX-DR11): ≥md 는 밀도 있는 표, 모바일은 카드. 환자 행(이름 셀)·모바일 카드를 클릭하면
// 그 환자의 전체 진료 내역 상세(/staff/patients/[id])로 이동한다(Story 4.2 — 조회 링크만 add-only).

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { RoleContextBar } from "@/components/role-context-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Patient } from "@/lib/api";

// 성별 역매핑 — DB 는 M/F/null, 화면은 남/여/—(1.3 성별 규약, Story 4.2 조회에서도 재사용).
const GENDER_LABEL: Record<string, string> = { M: "남", F: "여" };
function genderText(gender: string | null): string {
  return gender ? (GENDER_LABEL[gender] ?? gender) : "—";
}
// nullable 표시 필드는 비어 있으면 —.
function orDash(value: string | null): string {
  return value && value.trim() ? value : "—";
}

export default function PatientListPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  // 조회 실패를 빈 상태와 구분한다 — 오류를 빈 상태로 렌더하면 백엔드 다운을 "환자 없음"으로 오인한다.
  const [error, setError] = useState<string | null>(null);
  // 오류 후 "다시 시도" 재조회 트리거(effect 의존성). 증가시키면 같은 검색어로 다시 부른다.
  const [reloadNonce, setReloadNonce] = useState(0);
  // 현재 목록이 어떤 검색어에서 나왔는지 추적 — 빈 상태 문구(등록 0 vs 검색 결과 0)를 가른다.
  const [activeTerm, setActiveTerm] = useState("");

  useEffect(() => {
    // 이름 입력 → 디바운스(250ms) 후 서버 필터 호출(AC2, 클라이언트 배열 필터 아님).
    // 첫 마운트(search="")는 전체 목록을 부른다. 키 입력마다 즉시 호출하지 않는다.
    // setLoading 은 타이머 콜백 안에서 호출한다 — effect 본문의 동기 setState 는 React 19 린트가 막는다.
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await api.getPatients(search);
        if (cancelled) return;
        setPatients(rows);
        setActiveTerm(search.trim());
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // 오류를 별도 상태로 잡아 빈 상태와 구분(빈 상태로 렌더 시 "환자 없음" 오인).
        // request 가 한국어 메시지로 던진다(AD-10). 직원 톤=간결.
        const message = err instanceof Error ? err.message : "환자 목록을 불러오지 못했어요.";
        setError(message);
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, reloadNonce]);

  // 렌더 우선순위: 로딩 > 오류 > 빈 상태 > 목록. 오류일 때는 빈 상태를 띄우지 않는다.
  const isEmpty = !loading && !error && patients.length === 0;
  const searchEmptyTerm = isEmpty && activeTerm.length > 0 ? activeTerm : null;

  return (
    <>
      <RoleContextBar role="직원" />
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold leading-tight">환자 목록</h1>
          <Link href="/staff/patients/new" className={buttonVariants()}>
            신규 환자 등록
          </Link>
        </div>
        <p className="mt-2 text-muted-foreground">이름으로 재방문 환자를 찾을 수 있어요.</p>

        {/* 이름 검색 (디바운스 서버 필터) */}
        <div className="mt-6 flex flex-col gap-2">
          <Label htmlFor="patient-search">환자 이름 검색</Label>
          <Input
            id="patient-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 일부를 입력하세요"
            autoComplete="off"
            autoFocus
          />
        </div>

        <div className="mt-6">
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={() => setReloadNonce((n) => n + 1)} />
          ) : isEmpty ? (
            <EmptyState searchTerm={searchEmptyTerm} />
          ) : (
            <>
              {/* 데스크톱(≥md): 밀도 있는 표 */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>이름</TableHead>
                      <TableHead>생년월일</TableHead>
                      <TableHead>성별</TableHead>
                      <TableHead>연락처</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patients.map((p) => (
                      <TableRow key={p.id} className="hover:bg-accent">
                        {/* 이름 셀만 링크 — <a> 로 <tr> 를 감싸면 HTML 위반이라 셀 링크로(Story 4.2). */}
                        <TableCell className="font-medium">
                          <Link
                            href={`/staff/patients/${p.id}`}
                            className="outline-none hover:underline focus-visible:underline"
                          >
                            {p.name}
                          </Link>
                        </TableCell>
                        <TableCell>{orDash(p.birth_date)}</TableCell>
                        <TableCell>{genderText(p.gender)}</TableCell>
                        <TableCell>{orDash(p.phone)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 모바일(<md): 카드 리스트 — 카드 전체를 상세 링크로(staff 홈 카드 링크 관용 미러). */}
              <div className="grid gap-3 md:hidden">
                {patients.map((p) => (
                  <Link
                    key={p.id}
                    href={`/staff/patients/${p.id}`}
                    className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Card className="p-4 transition-colors hover:bg-accent">
                      <div className="text-base font-semibold">{p.name}</div>
                      <dl className="mt-2 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
                        <dt className="text-muted-foreground">생년월일</dt>
                        <dd>{orDash(p.birth_date)}</dd>
                        <dt className="text-muted-foreground">성별</dt>
                        <dd>{genderText(p.gender)}</dd>
                        <dt className="text-muted-foreground">연락처</dt>
                        <dd>{orDash(p.phone)}</dd>
                      </dl>
                    </Card>
                  </Link>
                ))}
              </div>

              <p className="mt-4 text-sm text-muted-foreground">총 {patients.length}명</p>
            </>
          )}
        </div>
      </main>
    </>
  );
}

// 로딩 중 Skeleton 행(UX-DR7). 데이터가 오면 대체된다.
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

// 조회 오류 상태 — 빈 상태와 구분해 "다시 시도"를 제공(백엔드 다운을 "환자 없음"으로 오인 방지).
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

// 빈 상태 2종(AC4): 검색 결과 없음 vs 등록된 환자 없음.
function EmptyState({ searchTerm }: { searchTerm: string | null }) {
  if (searchTerm) {
    return (
      <div className="rounded-xl border border-dashed py-16 text-center">
        <p className="text-muted-foreground">
          ‘{searchTerm}’ 검색 결과가 없어요. 다른 이름으로 찾아보세요.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-lg font-medium">등록된 환자가 없어요.</p>
      <p className="mt-1 text-muted-foreground">새 환자를 등록해 주세요.</p>
      <div className="mt-4">
        <Link href="/staff/patients/new" className={buttonVariants()}>
          신규 환자 등록
        </Link>
      </div>
    </div>
  );
}
