// 의사판 환자 진료 내역 (FR-20, Story 8.1). 사본이 아니라 **같은 모듈을 다른 URL 로 노출**한다 —
// /staff/* 밖이라 직원 사이드바 셸(staff/layout.tsx)이 자동으로 안 걸리고, 페이지가 usePathname()
// 하나로 역할을 판정할 수 있어 useSearchParams 의 Suspense 제약(Next 16)도 피한다.
export { default } from "@/app/staff/patients/[id]/page";
