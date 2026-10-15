"use client";

// 하단 메뉴: 피드 / 관심 공고 / 설정 (frontend-components.md §2, U4 BR-U4-03 숨김)
// - 터치 영역 48px 이상, 라벨 16px 이상
// - 현재 위치는 색 + 굵기 + 위쪽 막대로 표시 (색만으로 구분하지 않음)
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useProfile } from "@/features/profile/ProfileProvider";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const iconProps = {
  width: 28,
  height: 28,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ITEMS: NavItem[] = [
  {
    href: "/",
    label: "맞춤 공고",
    icon: (
      <svg {...iconProps}>
        <path d="M3 10.5 12 3l9 7.5V21H3z" />
        <path d="M9 21v-6h6v6" />
      </svg>
    ),
  },
  {
    href: "/bookmarks",
    label: "관심 공고",
    icon: (
      <svg {...iconProps}>
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "설정",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    ),
  },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" || pathname.startsWith("/notice/") : pathname.startsWith(href);
}

/** 마법사(/profile/*)와 처음 실행(프로필 없음)에서는 숨긴다 (BR-U4-03). 기기 저장을 읽기 전에도 숨긴다 */
export function shouldShowNav(pathname: string, loaded: boolean, hasProfile: boolean): boolean {
  if (pathname.startsWith("/profile")) return false;
  return loaded && hasProfile;
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const { loaded, stored } = useProfile();
  if (!shouldShowNav(pathname, loaded, stored !== null)) return null;
  return (
    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface">
      <ul className="mx-auto flex w-full max-w-xl">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-touch flex-col items-center justify-center gap-1 border-t-4 py-2 text-caption",
                  active ? "border-primary font-bold text-primary" : "border-transparent font-normal text-muted",
                ].join(" ")}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
