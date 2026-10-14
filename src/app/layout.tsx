import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppHeader } from "@/features/app-chrome/AppHeader";
import { BottomNav } from "@/features/app-chrome/BottomNav";
import { APP_NAME } from "@/features/app-chrome/constants";
import { DeviceBootstrap } from "@/features/device/DeviceBootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "3기 신도시 분양·임대 공고 중 우리 집에 맞는 것만 골라 알려 드려요",
  applicationName: APP_NAME,
};

// 글자 확대를 막지 않는다 (NFR-U1-28)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b5cad",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-mode: 일반(normal) / 쉬운 모드(easy). 전환은 U4에서 구현
    <html lang="ko" data-mode="normal">
      <body className="min-h-dvh bg-canvas">
        <AppHeader title={APP_NAME} />
        <main className="mx-auto w-full max-w-xl px-4 pb-32 pt-4">
          <DeviceBootstrap>{children}</DeviceBootstrap>
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
