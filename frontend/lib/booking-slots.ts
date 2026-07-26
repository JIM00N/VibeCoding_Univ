// 예약 슬롯 시각 헬퍼 (Story 6.3). 병원 시각은 항상 서울 기준 — 30분 격자 슬롯과 날짜 선택지를
// 브라우저 타임존과 무관하게 만든다.
//
// ⚠️ 왜 로컬 타임존을 안 쓰는가: 브라우저 로컬 tz 로 슬롯을 만들면(예: UTC 브라우저) 화면에 보이는
//    "10:30"이 그 브라우저 시각으로 해석돼 실제로는 서울 19:30 에 예약된다. 그래서 슬롯 인스턴트
//    생성·표시를 모두 Asia/Seoul 로 고정한다. 서울은 DST 가 없어 항상 UTC+9 라 오프셋을 그대로
//    박아도 안전하다.
// ⚠️ 분 ∈ {0,30}·초 0 으로만 만들기 때문에 백엔드 to_slot() 재정규화와 reserved_at 30분 CHECK 를
//    그대로 통과한다(AD-3, AD-9).
//
// 이 모듈은 Story 2.1(app/patient/book/page.tsx)의 로컬 헬퍼와 같은 계산을 하는 2번째 사본이다 —
// 환자 예약 화면은 동결(add-only 규율)이라 import 로 이관하지 않았고, 통합은 중복 사본 정리 스토리
// 몫이다(deferred-work: booking-slots 2-소스).

import type { Slot } from "@/components/slot-picker";

const HOSPITAL_TZ = "Asia/Seoul";
const HOSPITAL_UTC_OFFSET = "+09:00";

/** 브라우저 타임존과 무관하게 "서울 기준 오늘"의 YYYY-MM-DD 를 얻는다(en-CA = ISO 형식). */
function seoulTodayYmd(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HOSPITAL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 서울 벽시계 시각(h:m)을 +09:00 고정 오프셋으로 만들어 브라우저 무관하게 정확한 UTC 인스턴트를 얻는다.
 *  분 ∈ {0,30}·초 0 이라 백엔드 to_slot()·reserved_at CHECK 를 그대로 통과한다(AD-3). */
export function slotsForSeoulDay(ymd: string, startHour = 9, endHour = 18): Slot[] {
  const out: Slot[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      out.push({
        label: `${hh}:${mm}`,
        iso: new Date(`${ymd}T${hh}:${mm}:00${HOSPITAL_UTC_OFFSET}`).toISOString(),
      });
    }
  }
  return out;
}

/** YYYY-MM-DD → "7월 27일 (월)" (서울 기준). 정오 앵커를 서울 tz 로 포맷해 브라우저 무관하게 만든다. */
export function formatSeoulDayLabel(ymd: string): string {
  return new Date(`${ymd}T12:00:00${HOSPITAL_UTC_OFFSET}`).toLocaleDateString("ko-KR", {
    timeZone: HOSPITAL_TZ,
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/** 오늘(서울)부터 days 일치의 날짜 선택지. 각 날의 정오 앵커에 24h 씩 더해 서울 tz 로 YYYY-MM-DD·라벨을
 *  만든다. 서울은 DST 가 없어 24h 스텝이 항상 다음 날 같은 벽시계로 떨어진다. reserved_at 은
 *  timestamptz 라 어느 날짜든 그대로 저장된다(DB 변경 없음). */
export function seoulDayOptions(now: Date, days = 7): { ymd: string; label: string }[] {
  const todayNoon = new Date(`${seoulTodayYmd(now)}T12:00:00${HOSPITAL_UTC_OFFSET}`).getTime();
  const out: { ymd: string; label: string }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(todayNoon + i * 86_400_000);
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: HOSPITAL_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    out.push({ ymd, label: formatSeoulDayLabel(ymd) });
  }
  return out;
}
