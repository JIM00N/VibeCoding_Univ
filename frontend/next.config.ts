import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev 전용: 같은 LAN IP(예: http://192.168.0.13:3000)로 접속하는 브라우저 실측을 허용한다.
  // Next 16은 미등록 교차 오리진의 dev 접근을 차단해 클라이언트 하이드레이션이 멈춘다(Story 5.1 실측 중 확인).
  // 프로덕션 빌드에는 영향 없음.
  allowedDevOrigins: ["192.168.0.13"],
};

export default nextConfig;
