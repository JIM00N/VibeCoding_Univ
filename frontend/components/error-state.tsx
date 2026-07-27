// 조회 오류 상태 — "다시 시도"와 "예약 목록으로" 탈출구를 함께 제공한다. 백엔드 다운을 "데이터 없음"으로
// 오인하지 않게 빈/안내 상태와 구분하고(2.2·1.4 규율), 404 처럼 재시도가 영원히 실패하는 경우의 탈출구도 준다.
//
// Story 3.1 진료 기록 페이지의 로컬 ErrorState(4번째 사본)를 components 로 승격한 것이다
// (deferred-work "4사본 승격 임계" 이행). Story 5.4 가 남은 로컬 사본 6곳을 전부 이 정본으로
// 이관했다 — 로컬 사본 금지. onBack 은 옵션: 탈출구가 설계된 화면(기록·처방전·환자 조회)만 넘기고,
// 넘기지 않으면 뒤로 버튼을 렌더하지 않는다(이관 화면들의 렌더 불변 — 뒤로 버튼 신설은 각 화면 몫).
import { Button } from "@/components/ui/button";

export function ErrorState({
  message,
  onRetry,
  onBack,
  // 뒤로 가기 라벨 — 기본값은 기존 처방전 페이지 호출부 보존용(무변경). 환자 페이지는 "홈으로" 를 넘긴다.
  backLabel = "예약 목록으로",
}: {
  message: string;
  onRetry: () => void;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-muted-foreground">{message}</p>
      <div className="mt-4 flex justify-center gap-3">
        <Button variant="outline" onClick={onRetry}>
          다시 시도
        </Button>
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            {backLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
