// 조회 오류 상태 — "다시 시도"와 "예약 목록으로" 탈출구를 함께 제공한다. 백엔드 다운을 "데이터 없음"으로
// 오인하지 않게 빈/안내 상태와 구분하고(2.2·1.4 규율), 404 처럼 재시도가 영원히 실패하는 경우의 탈출구도 준다.
//
// Story 3.1 진료 기록 페이지의 로컬 ErrorState(4번째 사본)를 components 로 승격한 것이다
// (deferred-work "4사본 승격 임계" 이행). 처방전 페이지(Story 3.3)와 환자 조회 페이지(Story 4.1)가
// 이 공용 컴포넌트를 재사용한다 — 5번째 로컬 사본 금지. 기존 4곳(기록 페이지 등)의 로컬 사본 이관은
// 별도 정리 스토리 몫이라 여기서 건드리지 않는다(하드닝 파일 무수정).
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
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      <p className="text-muted-foreground">{message}</p>
      <div className="mt-4 flex justify-center gap-3">
        <Button variant="outline" onClick={onRetry}>
          다시 시도
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {backLabel}
        </Button>
      </div>
    </div>
  );
}
