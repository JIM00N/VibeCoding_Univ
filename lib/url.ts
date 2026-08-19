export type HomeFilters = { category?: string; region?: string; q?: string };

/** 홈 필터 조합을 하나의 URL 로 — 카테고리·지역·검색어는 서로를 지우지 않는다 (PRD FR-9). */
export function homeHref(f: HomeFilters): string {
  const sp = new URLSearchParams();
  if (f.category) sp.set("category", f.category);
  if (f.region) sp.set("region", f.region);
  if (f.q) sp.set("q", f.q);
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}
