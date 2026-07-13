"use client";

// 역할 선택 첫 화면 (FR-1). [환자]/[직원] 선택 + GET /departments 로 수직 슬라이스 관통(AC6).
// 브라우저가 lib/api.ts 를 통해 FastAPI 를 직접 호출한다(AD-1, AD-10).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type Department } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 정적 화면이 아니라 실제로 브라우저→FastAPI→Supabase 를 관통해 진료과를 가져온다(AC6).
    api
      .getDepartments()
      .then(setDepartments)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-[28px] font-bold leading-tight">서울중앙병원 진료관리</h1>
        <p className="text-muted-foreground">어떤 역할로 이용하실지 골라 주세요.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Button size="lg" className="h-24 text-lg" onClick={() => router.push("/patient")}>
          환자
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-24 text-lg"
          onClick={() => router.push("/staff")}
        >
          직원
        </Button>
      </div>

      {/* 수직 슬라이스 관통 증거: 시드된 진료과가 백엔드를 거쳐 렌더된다. */}
      <Card className="gap-3 p-5">
        <h2 className="text-sm font-semibold text-muted-foreground">운영 중인 진료과</h2>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            진료과를 불러오지 못했어요: {error}
          </p>
        )}
        {!error && departments === null && (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        )}
        {departments !== null && departments.length === 0 && (
          <p className="text-sm text-muted-foreground">등록된 진료과가 없어요.</p>
        )}
        {departments !== null && departments.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {departments.map((d) => (
              <li
                key={d.id}
                className="rounded-md bg-secondary px-3 py-1 text-sm text-secondary-foreground"
              >
                {d.name}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
