"use client";

// 홈(/) 화면 결정 (US-02, BR-U4-01·02): 프로필 있음 → 피드, 초안 있음 → 마법사 이어서, 없음 → 처음 실행 안내
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useProfile } from "../ProfileProvider";
import { primaryButton } from "./controls";

export function HomeGate({ feed }: { feed: ReactNode }) {
  const { loaded, stored, hasDraft } = useProfile();
  const router = useRouter();
  const resume = loaded && !stored && hasDraft;

  useEffect(() => {
    if (resume) router.replace("/profile/setup");
  }, [resume, router]);

  if (!loaded || resume) {
    return (
      <p role="status" className="py-8 text-center text-body text-muted">
        준비하고 있어요…
      </p>
    );
  }
  if (stored) return <>{feed}</>;
  return <Welcome />;
}

const WELCOME_STEPS = ["3기 신도시 공고를 매일 모아요", "우리 집 조건에 맞는지 확인해요", "새 공고가 있으면 하루 1번 알려 드려요"] as const;

export function Welcome() {
  return (
    <section className="flex flex-col gap-6 rounded-card bg-surface p-6 shadow-card">
      <Image src="/icons/icon-192.png" alt="" width={72} height={72} className="rounded-2xl" priority />
      <h1 className="text-heading font-bold leading-snug tracking-tight">내 정보를 넣으면 맞는 공고만 골라 드려요</h1>
      <ol className="flex flex-col gap-4 text-body">
        {WELCOME_STEPS.map((text, i) => (
          <li key={text} className="flex items-center gap-3">
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption font-bold text-primary">
              {i + 1}
            </span>
            <span>
              <span className="sr-only">{i + 1}. </span>
              {text}
            </span>
          </li>
        ))}
      </ol>
      <Link replace href="/profile/setup" className={`${primaryButton} flex items-center justify-center`}>
        시작하기
      </Link>
    </section>
  );
}
