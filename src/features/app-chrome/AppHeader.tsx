// 상단 막대 (서버 컴포넌트). 높이 56px 이상. 오른쪽에 큰 글씨 버튼
import Image from "next/image";
import Link from "next/link";
import { DisplayModeToggle } from "@/features/display-mode/DisplayModeToggle";

export function AppHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex min-h-header w-full max-w-xl items-center justify-between gap-3 px-4">
        <Link href="/" replace className="flex min-h-touch min-w-0 items-center gap-2">
          <Image src="/icons/icon-192.png" alt="" width={32} height={32} className="rounded-lg" priority />
          <span className="truncate text-title font-bold tracking-tight text-ink">{title}</span>
        </Link>
        <DisplayModeToggle />
      </div>
    </header>
  );
}
