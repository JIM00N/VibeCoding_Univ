"use client";

// 의사 신원 컨텍스트 (FR-1b, AD-8, UX-DR4, Story 6.1). 선택한 의사를 localStorage 에 담아
// 화면 이동·새로고침에도 유지한다. 여기 저장된 정수 id 가 이후 의사 대시보드 조회의
// ?doctor_id= 값이 된다. 앱 레벨 필터일 뿐 보안 격리가 아니다(AD-8, 누구나 임의 의사 선택 가능).
//
// ⚠️ patient-identity.ts 의 의사판이다 — 같은 이유로 같은 구조를 쓴다(패턴이 아니라 이유를 복제):
//   - useEffect + setState 재수화 → react-hooks/set-state-in-effect 가 error 라 npm run lint 실패.
//   - lazy useState 초기자 단독 → 서버(없음)/클라(있음) 하이드레이션 불일치.
//   useSyncExternalStore 는 외부 저장소 구독용 React 공식 API 라 둘 다 피한다.
// 저장 키는 환자와 분리한다 — 역할 전환 시 두 신원이 서로 침범하지 않는다.

import { useCallback, useSyncExternalStore } from "react";

export type DoctorIdentity = { id: number; name: string };
type Snapshot = { ready: boolean; doctor: DoctorIdentity | null };

const STORAGE_KEY = "hospital-care.doctor";
// 서버 렌더 스냅샷은 항상 "아직 모름"(ready:false). 상수 1개를 재사용해야 참조가 안정적이다.
const SERVER_SNAPSHOT: Snapshot = { ready: false, doctor: null };

let cache: Snapshot = SERVER_SNAPSHOT;
let cachedRaw: string | null = null;
const listeners = new Set<() => void>();

// localStorage 를 못 쓰는 환경(쿠키 전면 차단·쿼터 초과·Safari 프라이빗·일부 웹뷰)에서의
// 세션 한정 폴백. 이게 없으면 선택한 신원이 증발해 가드가 되돌리고 의사가 영영 못 들어간다.
// 이 값은 새로고침하면 사라진다(그 환경엔 원래 저장할 곳이 없다).
let memoryRaw: string | null = null;

// ⚠️ 폴백 조건은 "읽기가 throw 했나"가 아니라 "저장소를 못 쓰나"여야 한다.
// 읽기는 되고 쓰기만 던지는 환경(쿼터 초과 등)이 실재하며, 그때 읽기 예외만 보고 폴백하면
// (a) 저장값이 없을 땐 무한 튕김, (b) 옛 값이 있을 땐 사용자가 고르지 않은 의사로 조용히 고정된다.
let storageUsable = true;

function readRaw(): string | null {
  // 쓰기가 한 번이라도 실패했다면 localStorage 는 신뢰할 수 없다 — 메모리가 진실이다.
  if (!storageUsable) return memoryRaw;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    storageUsable = false;
    return memoryRaw;
  }
}

function writeRaw(value: string | null) {
  // 메모리를 먼저 갱신한다 — localStorage 가 던져도 이 세션에선 신원이 유지된다.
  memoryRaw = value;
  try {
    if (value === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // 쓰기 실패를 기록해야 readRaw 가 memoryRaw 를 보게 된다. 이 플래그가 없으면
    // getItem 이 멀쩡한 환경에서 방금 고른 신원이 그대로 버려진다.
    storageUsable = false;
  }
}

function parse(raw: string | null): DoctorIdentity | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // 깨진 JSON·구버전·손댄 값을 걸러낸다. shape 뿐 아니라 **값의 도메인**까지 본다 —
    // 이 id 는 ?doctor_id= 로 백엔드에 그대로 전달되므로 양의 정수여야 하고
    // (typeof 만 보면 Infinity·-1·1.5 가 통과한다), 이름이 비면 화면·컨텍스트 바가 깨진다.
    if (
      typeof parsed?.id === "number" &&
      Number.isInteger(parsed.id) &&
      parsed.id > 0 &&
      typeof parsed?.name === "string" &&
      parsed.name.trim() !== ""
    ) {
      return { id: parsed.id, name: parsed.name };
    }
    return null;
  } catch {
    return null;
  }
}

function getSnapshot(): Snapshot {
  const raw = readRaw();
  // ⚠️ 값이 그대로면 이전 객체를 그대로 돌려준다. 매번 새 객체를 만들면 무한 렌더.
  if (!cache.ready || raw !== cachedRaw) {
    cachedRaw = raw;
    cache = { ready: true, doctor: parse(raw) };
  }
  return cache;
}

const getServerSnapshot = (): Snapshot => SERVER_SNAPSHOT;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener); // 다른 탭에서의 변경도 반영
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function emit() {
  for (const l of listeners) l(); // 같은 탭 변경은 storage 이벤트가 안 오므로 직접 알린다.
}

/**
 * 선택된 의사 신원을 읽고 바꾼다.
 *
 * ⚠️ `ready` 를 반드시 함께 보라 — 서버 렌더·하이드레이션 첫 프레임엔 ready:false 다.
 * ready:false 를 "신원 없음"으로 착각해 리다이렉트하면 신원이 있는 사용자도 튕긴다.
 * 판정은 항상 `ready && !doctor`.
 */
export function useDoctorIdentity() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const selectDoctor = useCallback((d: DoctorIdentity) => {
    writeRaw(JSON.stringify({ id: d.id, name: d.name }));
    emit();
  }, []);

  const clearDoctor = useCallback(() => {
    writeRaw(null);
    emit();
  }, []);

  return { ...snapshot, selectDoctor, clearDoctor };
}
