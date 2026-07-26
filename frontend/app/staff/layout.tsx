// 직원 화면 전용 셸 (Story 6.2, UX-DR12). 모든 /staff/* 를 좌측 사이드바로 감싼다 —
// 각 페이지는 자기 <RoleContextBar/> + <main> 을 그대로 렌더(동결), 셸은 그 왼쪽에 rail 만 얹는다.
// 환자·의사 라우트는 이 세그먼트 밖이라 자동 제외(AC5). 공유 기록/처방전 폼은 StaffSidebar 가 스스로 숨는다.
// pb-16(모바일): 하단 고정 탭 바가 콘텐츠를 가리지 않게 여백 확보 — md·인쇄(≥768px)에선 md:pb-0.
import { StaffSidebar } from "@/components/staff-sidebar";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1">
      <StaffSidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">{children}</div>
    </div>
  );
}
