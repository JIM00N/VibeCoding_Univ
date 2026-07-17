import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "서울중앙병원 · 진료관리",
  description: "환자 예약·진료·조회 데모 서비스 (교육용)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 한국어 UI(NFR-5). 본문 폰트는 Pretendard(가변, 동적 서브셋). 네트워크 없으면
  // globals.css 의 --font-sans 시스템 폰트(Apple SD Gothic Neo/Malgun Gothic)로 폴백.
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        {/* 성공/오류 toast 인프라(UX-DR7). 전역 1회 마운트 — 이후 예약·진료 스토리가 재사용. */}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
