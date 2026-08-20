import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/header";

export const metadata: Metadata = {
  title: "계모임 — 취미로 모이는 사람들",
  description: "가까운 동네에서 취미 모임을 찾고 가입해요.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      {/* pb-14: 모바일 하단 탭이 fixed 라 본문 끝이 가려지지 않게 자리를 비워둔다 */}
      <body className="min-h-full flex flex-col pb-14 sm:pb-0">
        {/* PRD FR-X3 */}
        <div className="bg-amber-100 text-amber-900 text-[13px] text-center px-4 py-1.5 border-b border-amber-200">
          데모용 서비스예요. 실제 개인정보는 입력하지 말아주세요.
        </div>
        <Header />
        <main className="flex-1 w-full">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-400">
            계모임 · 학습용 프로토타입 · 실제 서비스가 아니에요
          </div>
        </footer>
      </body>
    </html>
  );
}
