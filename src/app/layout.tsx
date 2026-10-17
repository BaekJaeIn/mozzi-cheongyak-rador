import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppHeader } from "@/features/app-chrome/AppHeader";
import { BackNavigation } from "@/features/app-chrome/BackNavigation";
import { BookmarksProvider } from "@/features/bookmarks/BookmarksProvider";
import { BottomNav } from "@/features/app-chrome/BottomNav";
import { APP_NAME } from "@/features/app-chrome/constants";
import { DeviceBootstrap } from "@/features/device/DeviceBootstrap";
import { DISPLAY_MODE_SCRIPT } from "@/features/display-mode/display-mode";
import { PushResync, PwaProvider } from "@/features/pwa/PwaProvider";
import {
  ProfileProvider,
  SyncOnReady,
} from "@/features/profile/ProfileProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "3기 신도시 분양·임대 공고 중 우리 집에 맞는 것만 골라 알려 드려요",
  applicationName: APP_NAME,
  // iPhone 홈 화면 앱 (U6 BR-U6-75, NFR-U6-22·26). manifest는 src/app/manifest.ts
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

// 글자 확대를 막지 않는다 (NFR-U1-28)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b5cad",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-mode: 일반(normal) / 쉬운 모드(easy). 저장된 모드는 그리기 전에 스크립트가 바꾼다 (BR-U4-83)
    <html lang="ko" data-mode="normal" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_MODE_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-canvas">
        <ProfileProvider>
          <PwaProvider>
            <BookmarksProvider>
              <BackNavigation>
              <AppHeader title={APP_NAME} />
              <main className="mx-auto w-full max-w-xl px-4 pb-32 pt-2">
                <DeviceBootstrap>
                  <SyncOnReady />
                  <PushResync />
                  {children}
                </DeviceBootstrap>
              </main>
              <BottomNav />
              </BackNavigation>
            </BookmarksProvider>
          </PwaProvider>
        </ProfileProvider>
      </body>
    </html>
  );
}
