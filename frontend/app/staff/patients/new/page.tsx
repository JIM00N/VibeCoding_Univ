"use client";

// 직원 신규 환자 등록 (FR-4, Story 1.3). POST /patients 로 환자를 만든다.
// 브라우저는 lib/api.ts 만 통해 백엔드를 호출한다(AD-1, AD-10). 저장은 비관적(서버 확정 후 반영).
//
// 성별·생년월일은 주민등록번호 "앞 7자리"(생년월일 6 + 성별 판별 1)에서 자동 파생한다.
// ⚠️ 프라이버시: 뒤 6자리는 아예 받지 않고, 주민번호 자체는 저장·전송하지 않는다 —
//    브라우저에서 성별(M/F)·생년월일만 계산해 서버로 보낸다(DB 에 주민번호 컬럼 없음).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { RoleContextBar } from "@/components/role-context-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type Derived = { birthDate: string; gender: "M" | "F"; label: string };

// 주민등록번호 앞 7자리에서 생년월일·성별을 파생한다.
//  - 성별 판별 숫자(뒷자리 첫 자리): 1·2 = 2000년 이전 출생, 3·4 = 2000년 이후 출생
//                                    1·3 = 남자, 2·4 = 여자
function deriveFromRrn(front6: string, genderDigit: string): Derived | { error: string } {
  if (!/^\d{6}$/.test(front6)) {
    return { error: "생년월일 6자리(YYMMDD)를 숫자로 입력해 주세요." };
  }
  if (!/^[1-4]$/.test(genderDigit)) {
    return { error: "성별 번호(뒷자리 첫 자리)는 1~4 중 하나여야 해요." };
  }
  const century = genderDigit === "1" || genderDigit === "2" ? 1900 : 2000;
  const year = century + Number(front6.slice(0, 2));
  const month = Number(front6.slice(2, 4));
  const day = Number(front6.slice(4, 6));
  // 실제 달력상 유효한 날짜인지 검사(예: 02-30 차단).
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return { error: "생년월일이 올바른 날짜가 아니에요." };
  }
  const gender: "M" | "F" = genderDigit === "1" || genderDigit === "3" ? "M" : "F";
  const birthDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { birthDate, gender, label: `${gender === "M" ? "남" : "여"} · ${birthDate}` };
}

export default function NewPatientPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rrnFront, setRrnFront] = useState(""); // 생년월일 6자리(YYMMDD)
  const [rrnGender, setRrnGender] = useState(""); // 성별 판별 1자리
  const [phone, setPhone] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [rrnError, setRrnError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 주민번호 앞자리를 둘 다 입력했을 때만 파생을 시도한다(선택 입력이라 비어 있으면 파생 안 함).
  const rrnEntered = rrnFront.length > 0 || rrnGender.length > 0;
  const derived = rrnEntered ? deriveFromRrn(rrnFront, rrnGender) : null;
  const derivedOk = derived !== null && "gender" in derived;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // 인라인 검증: 이름 필수(공백만도 불가). 서버 도달 전에 먼저 막는다(UX-DR9).
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("이름을 입력해 주세요.");
      return;
    }
    setNameError(null);

    // 주민번호 앞자리를 입력했다면 유효해야 진행(선택 입력 — 비우면 성별·생년월일 없이 등록).
    if (rrnEntered && (derived === null || "error" in derived)) {
      setRrnError(derived && "error" in derived ? derived.error : "주민등록번호 앞 7자리를 확인해 주세요.");
      return;
    }
    setRrnError(null);

    setSubmitting(true);
    try {
      const created = await api.createPatient({
        name: trimmedName,
        birth_date: derivedOk ? (derived as Derived).birthDate : null,
        gender: derivedOk ? (derived as Derived).gender : null,
        phone: phone.trim() || null,
      });
      toast.success(`${created?.name ?? trimmedName}님을 등록했어요.`);
      // 접수 데스크 현실: 다음 환자를 이어 등록하도록 폼을 비운다(목록은 Story 1.4).
      setName("");
      setRrnFront("");
      setRrnGender("");
      setPhone("");
    } catch (err) {
      // request 가 오류를 한국어 메시지로 던진다(AD-10). 직원 톤=간결.
      toast.error(err instanceof Error ? err.message : "등록하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <RoleContextBar role="직원" />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <h1 className="text-[28px] font-bold leading-tight">신규 환자 등록</h1>
        <p className="mt-2 text-muted-foreground">
          이름은 필수예요. 주민등록번호는 앞 7자리만 입력하면 성별·생년월일이 자동으로 채워져요.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5" noValidate>
          {/* 이름 (필수) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">
              이름 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="환자 이름"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "name-error" : undefined}
              autoFocus
            />
            {nameError && (
              <p id="name-error" role="alert" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>

          {/* 주민등록번호 앞자리 (선택) — 성별·생년월일 자동 판별 */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="rrn-front">주민등록번호 앞자리</Label>
            <div className="flex items-center gap-2">
              <Input
                id="rrn-front"
                inputMode="numeric"
                maxLength={6}
                value={rrnFront}
                onChange={(e) => {
                  setRrnFront(e.target.value.replace(/\D/g, "").slice(0, 6));
                  if (rrnError) setRrnError(null);
                }}
                placeholder="생년월일 6자리"
                className="w-40"
                aria-invalid={rrnError ? true : undefined}
                aria-describedby="rrn-help rrn-error"
              />
              <span aria-hidden className="text-muted-foreground">
                –
              </span>
              <Input
                id="rrn-gender"
                inputMode="numeric"
                maxLength={1}
                value={rrnGender}
                onChange={(e) => {
                  setRrnGender(e.target.value.replace(/\D/g, "").slice(0, 1));
                  if (rrnError) setRrnError(null);
                }}
                placeholder="0"
                className="w-14 text-center"
                aria-label="성별 판별 숫자 (뒷자리 첫 자리)"
                aria-invalid={rrnError ? true : undefined}
                aria-describedby="rrn-help rrn-error"
              />
              <span aria-hidden className="tracking-widest text-muted-foreground select-none">
                ●●●●●●
              </span>
            </div>
            <p id="rrn-help" className="text-sm text-muted-foreground">
              뒤 6자리는 입력받지 않아요(성별 판별에 필요한 앞 7자리만). 입력하면{" "}
              <b>성별·생년월일이 자동 계산</b>돼요.
            </p>
            {derivedOk && (
              <p role="status" className="text-sm font-medium text-primary">
                → {(derived as Derived).label}
              </p>
            )}
            {rrnError && (
              <p id="rrn-error" role="alert" className="text-sm text-destructive">
                {rrnError}
              </p>
            )}
          </div>

          {/* 연락처 (선택) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">연락처</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-1234-5678"
            />
          </div>

          <div className="mt-2 flex gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "등록 중…" : "환자 등록"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push("/staff")}>
              직원 홈으로
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
