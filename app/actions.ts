"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase";
import { getCurrentUser, setSession, clearSession } from "@/lib/session";
import { CATEGORIES, REGIONS } from "@/lib/constants";

// redirect() 는 예외를 던져서 흐름을 끊는다 — try/catch 안에 넣지 말 것.

function safeNext(value: unknown): string {
  const v = String(value ?? "");
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

/** FR-1 로그인 */
export async function login(formData: FormData) {
  const loginId = String(formData.get("login_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const fail = `/login?error=1&next=${encodeURIComponent(next)}`;

  if (!loginId || !password) redirect(fail);

  const { data } = await getDb()
    .from("users")
    .select("id, password")
    .eq("login_id", loginId)
    .maybeSingle();

  if (!data || data.password !== password) redirect(fail);

  await setSession(data.id as number);
  revalidatePath("/", "layout");
  redirect(next);
}

/** FR-2 로그아웃 */
export async function logout() {
  await clearSession();
  revalidatePath("/", "layout");
  redirect("/");
}

/** FR-7 가입 */
export async function joinGroup(formData: FormData) {
  const groupId = Number(formData.get("group_id"));
  if (!Number.isInteger(groupId)) redirect("/");

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/groups/${groupId}`)}`);

  // UNIQUE(group_id, user_id) 위반은 "이미 멤버"라는 뜻이므로 조용히 넘긴다 (PRD R4).
  await getDb().from("memberships").insert({ group_id: groupId, user_id: user.id, role: "member" });

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/");
}

/** FR-8 탈퇴 — 모임장은 탈퇴할 수 없다 */
export async function leaveGroup(formData: FormData) {
  const groupId = Number(formData.get("group_id"));
  if (!Number.isInteger(groupId)) redirect("/");

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/groups/${groupId}`)}`);

  const db = getDb();
  await db
    .from("memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .neq("role", "owner");

  // 멤버가 아닌 사람이 참석자 명단에 남아 있으면 안 된다 — 이 모임 정모의 참석 기록도 함께 지운다.
  const { data: eventRows } = await db.from("events").select("id").eq("group_id", groupId);
  const eventIds = (eventRows ?? []).map((e) => e.id as number);
  if (eventIds.length > 0) {
    await db.from("attendances").delete().eq("user_id", user.id).in("event_id", eventIds);
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/");
}

/** FR-10 모임 만들기 */
export async function createGroup(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fgroups%2Fnew");

  const name = String(formData.get("name") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const region = String(formData.get("region") ?? "");

  const valid =
    name.length > 0 &&
    summary.length > 0 &&
    CATEGORIES.some((c) => c.name === category) &&
    REGIONS.includes(region);
  if (!valid) redirect("/groups/new?error=1");

  const db = getDb();
  const { data, error } = await db
    .from("groups")
    .insert({ name, summary, description, category, region, owner_id: user.id })
    .select("id")
    .single();

  if (error || !data) redirect("/groups/new?error=1");

  await db.from("memberships").insert({ group_id: data.id, user_id: user.id, role: "owner" });

  revalidatePath("/");
  redirect(`/groups/${data.id}`);
}

/** FR-12 정모 만들기 — 모임장만 */
export async function createEvent(formData: FormData) {
  const groupId = Number(formData.get("group_id"));
  if (!Number.isInteger(groupId)) redirect("/");

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/groups/${groupId}`)}`);

  const title = String(formData.get("title") ?? "").trim();
  const place = String(formData.get("place") ?? "").trim();
  const startsAtRaw = String(formData.get("starts_at") ?? "");
  const startsAt = new Date(startsAtRaw);

  const db = getDb();
  const { data: group } = await db.from("groups").select("owner_id").eq("id", groupId).maybeSingle();
  if (!group || group.owner_id !== user.id) redirect(`/groups/${groupId}`);

  if (title && place && !Number.isNaN(startsAt.getTime())) {
    await db.from("events").insert({
      group_id: groupId,
      title,
      place,
      starts_at: startsAt.toISOString(),
      created_by: user.id,
    });
  }

  revalidatePath(`/groups/${groupId}`);
}

/** FR-13 참석 신청·취소 — 그 모임 멤버만 */
export async function toggleAttend(formData: FormData) {
  const eventId = Number(formData.get("event_id"));
  const groupId = Number(formData.get("group_id"));
  if (!Number.isInteger(eventId) || !Number.isInteger(groupId)) redirect("/");

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/groups/${groupId}`)}`);

  const db = getDb();
  const { data: membership } = await db
    .from("memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect(`/groups/${groupId}`);

  const { data: existing } = await db
    .from("attendances")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await db.from("attendances").delete().eq("id", existing.id);
  } else {
    await db.from("attendances").insert({ event_id: eventId, user_id: user.id });
  }

  revalidatePath(`/groups/${groupId}`);
}
