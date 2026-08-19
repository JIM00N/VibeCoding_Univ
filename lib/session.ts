import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "./supabase";

// 자체 세션: users 테이블 + HMAC 서명 httpOnly 쿠키 (PRD §6).
// Supabase Auth 를 쓰지 않는 이유 — 이메일 형식·확인메일을 강요해서 "쉬운 id/pw" 데모와 맞지 않는다.

const COOKIE = "gyemoim_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7일
const SECRET = process.env.SESSION_SECRET ?? "gyemoim-demo-secret";

export type CurrentUser = { id: number; login_id: string; nickname: string };

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("base64url");
}

export async function setSession(userId: number): Promise<void> {
  const value = String(userId);
  const store = await cookies();
  store.set(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  const expected = sign(value);
  // timingSafeEqual 은 길이가 다르면 던진다 — 먼저 거른다.
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;

  const { data } = await getDb()
    .from("users")
    .select("id, login_id, nickname")
    .eq("id", id)
    .maybeSingle();

  return (data as CurrentUser | null) ?? null;
}
