// 카테고리·지역은 DB 테이블이 아니라 상수다 (PRD §5.1). groups 에 문자열로 저장된다.
// 커버 이미지도 없다 — 카테고리별 그라데이션 + 이모지로 대신한다 (PRD §6).

export type Category = {
  name: string;
  emoji: string;
  from: string;
  to: string;
};

export const CATEGORIES: Category[] = [
  { name: "운동/스포츠", emoji: "🏃", from: "#fb923c", to: "#ef4444" },
  { name: "사교/인맥", emoji: "🤝", from: "#fbbf24", to: "#f97316" },
  { name: "인문학/책/글", emoji: "📚", from: "#38bdf8", to: "#6366f1" },
  { name: "아웃도어/여행", emoji: "🏕️", from: "#4ade80", to: "#0d9488" },
  { name: "음악/악기", emoji: "🎸", from: "#c084fc", to: "#ec4899" },
  { name: "업종/직무", emoji: "🏢", from: "#94a3b8", to: "#334155" },
  { name: "문화/공연/축제", emoji: "🎭", from: "#f472b6", to: "#8b5cf6" },
  { name: "외국/언어", emoji: "🗣️", from: "#22d3ee", to: "#3b82f6" },
  { name: "게임/오락", emoji: "🎲", from: "#a78bfa", to: "#4f46e5" },
  { name: "공예/만들기", emoji: "🧶", from: "#fcd34d", to: "#d97706" },
  { name: "댄스/무용", emoji: "💃", from: "#fb7185", to: "#e11d48" },
  { name: "봉사활동", emoji: "🤲", from: "#34d399", to: "#059669" },
  { name: "사진/영상", emoji: "📷", from: "#60a5fa", to: "#1e40af" },
  { name: "자기계발", emoji: "🌱", from: "#a3e635", to: "#16a34a" },
];

export const REGIONS = [
  "용인", "수원", "광교", "판교", "분당", "동탄",
  "평택", "부천", "일산", "평촌", "안산", "남양주",
];

const FALLBACK: Category = { name: "기타", emoji: "✨", from: "#cbd5e1", to: "#64748b" };

export function categoryOf(name: string): Category {
  return CATEGORIES.find((c) => c.name === name) ?? { ...FALLBACK, name };
}

export function coverStyle(category: string) {
  const c = categoryOf(category);
  return { backgroundImage: `linear-gradient(135deg, ${c.from}, ${c.to})` };
}

// 시드 임시계정(demo01~demo40)은 여러 사람이 나눠 쓴다. 한 명이 비밀번호를 바꾸면 같은 계정으로
// 들어오려던 다른 청중이 못 들어오고, 시드를 다시 돌리기 전엔 복구도 안 된다 — 변경·재설정을 막는다(D-12).
// 가입 쪽에서 `demo`로 시작하는 아이디를 아예 거부하므로(D-22) 접두사만 봐도 시드 계정인지 갈린다.
export function isSeedAccount(loginId: string): boolean {
  return loginId.toLowerCase().startsWith("demo");
}
