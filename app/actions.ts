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

/** FR-18 회원가입 — 아이디·비밀번호·닉네임만 받는다. 만들자마자 로그인 상태가 된다.
 *  비밀번호는 D-4 그대로 평문 저장이라 화면에서 "평소 쓰는 비밀번호는 넣지 말라"고 알린다. */
export async function signup(formData: FormData) {
  const loginId = String(formData.get("login_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");
  const nickname = String(formData.get("nickname") ?? "").trim();
  const next = safeNext(formData.get("next"));

  // 실패해도 아이디·닉네임은 돌려준다 — 처음부터 다시 타이핑하게 만들지 않는다.
  const fail = (code: string) =>
    `/signup?error=${code}` +
    `&login_id=${encodeURIComponent(loginId)}` +
    `&nickname=${encodeURIComponent(nickname)}` +
    `&next=${encodeURIComponent(next)}`;

  // 로그인은 아이디를 그대로(대소문자 구분) 비교한다 — 여기서 소문자만 받아 "Demo01/demo01" 혼동을 없앤다.
  if (!/^[a-z0-9_]{4,20}$/.test(loginId)) redirect(fail("id"));
  if (password.length < 4 || password.length > 30) redirect(fail("pw"));
  if (password !== passwordConfirm) redirect(fail("pw2"));
  if (nickname.length < 1 || nickname.length > 20) redirect(fail("nickname"));

  const db = getDb();
  const { data: taken } = await db
    .from("users")
    .select("id")
    .eq("login_id", loginId)
    .maybeSingle();
  if (taken) redirect(fail("taken"));

  const { data, error } = await db
    .from("users")
    .insert({ login_id: loginId, password, nickname })
    .select("id")
    .single();

  // 23505 = UNIQUE 위반. 위 조회와 이 insert 사이에 같은 아이디가 들어온 경우 (청중 동시 접속, R4와 같은 규율).
  if (error?.code === "23505") redirect(fail("taken"));
  if (error || !data) redirect(fail("db"));

  await setSession(data.id as number);
  revalidatePath("/", "layout");
  redirect(next);
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

/* ────────────── 마이페이지 ────────────── */

/** 프로필 수정 — 닉네임·한 줄 소개만. 비밀번호는 바꾸지 않는다(공유 데모 계정이라 바꾸면 남이 못 들어온다). */
export async function updateProfile(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fme%2Fedit");

  const nickname = String(formData.get("nickname") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();

  if (!nickname || nickname.length > 20) redirect("/me/edit?error=nickname");

  await getDb().from("users").update({ nickname, bio: bio.slice(0, 100) }).eq("id", user.id);

  revalidatePath("/", "layout");
  redirect("/me?saved=1");
}

/** 회원 탈퇴 — 되돌릴 수 없다. 로그인 아이디를 그대로 입력해야 실행된다.
 *  users 삭제 시 소유 모임·멤버십·참석·메시지가 FK cascade 로 함께 사라진다. */
export async function deleteAccount(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== user.login_id) redirect("/me/edit?error=confirm");

  await getDb().from("users").delete().eq("id", user.id);
  await clearSession();

  revalidatePath("/", "layout");
  redirect("/?left=1");
}

/* ────────────── 모임 관리 (모임장 전용) ────────────── */

async function requireOwner(groupId: number) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/groups/${groupId}/manage`)}`);

  const db = getDb();
  const { data: group } = await db.from("groups").select("owner_id").eq("id", groupId).maybeSingle();
  if (!group || group.owner_id !== user.id) redirect(`/groups/${groupId}`);

  return { user, db };
}

/** 멤버 강제 퇴장 */
export async function kickMember(formData: FormData) {
  const groupId = Number(formData.get("group_id"));
  const targetId = Number(formData.get("user_id"));
  if (!Number.isInteger(groupId) || !Number.isInteger(targetId)) redirect("/");

  const { user, db } = await requireOwner(groupId);
  if (targetId === user.id) redirect(`/groups/${groupId}/manage`); // 모임장은 자신을 못 내보낸다

  await db
    .from("memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", targetId)
    .neq("role", "owner");

  // 멤버가 아닌 사람이 참석자 명단에 남으면 안 된다 (탈퇴와 같은 규율)
  const { data: eventRows } = await db.from("events").select("id").eq("group_id", groupId);
  const eventIds = (eventRows ?? []).map((e) => e.id as number);
  if (eventIds.length > 0) {
    await db.from("attendances").delete().eq("user_id", targetId).in("event_id", eventIds);
  }

  revalidatePath(`/groups/${groupId}/manage`);
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/");
}

/** 정모 삭제 */
export async function deleteEvent(formData: FormData) {
  const groupId = Number(formData.get("group_id"));
  const eventId = Number(formData.get("event_id"));
  if (!Number.isInteger(groupId) || !Number.isInteger(eventId)) redirect("/");

  const { db } = await requireOwner(groupId);
  await db.from("events").delete().eq("id", eventId).eq("group_id", groupId);

  revalidatePath(`/groups/${groupId}/manage`);
  revalidatePath(`/groups/${groupId}`);
}
