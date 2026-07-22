// 병원 시각 표시 헬퍼. 병원 시각은 Asia/Seoul 고정(서울은 DST 없어 항상 UTC+9) — 브라우저
// 타임존과 무관하게 같은 벽시계로 보인다(Story 2.1 리뷰 결정). 예약 화면(book)과 예약 관리(직원)가 공유.
const HOSPITAL_TZ = "Asia/Seoul";

/** ISO-8601 UTC 예약 시각(reserved_at)을 한국어 "N월 N일 (요일) 오전/오후 H:MM" 로 포맷한다.
 *  값이 없거나 파싱 불가한 문자열이면 "Invalid Date" 대신 —(대시)로 표시한다(방어). */
export function formatReservedAt(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR", {
    timeZone: HOSPITAL_TZ,
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
