"use client";

// 홈(/) 화면 결정 (US-02, BR-U4-01·02): 프로필 있음 → 피드, 초안 있음 → 마법사 이어서, 없음 → 처음 실행 안내
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

export function Welcome() {
  return (
    <section className="flex flex-col gap-6 rounded-xl bg-surface p-6">
      <h1 className="text-heading font-bold">내 정보를 넣으면 맞는 공고만 골라 드려요</h1>
      <ol className="flex flex-col gap-3 text-body">
        <li>① 3기 신도시 공고를 매일 모아요</li>
        <li>② 우리 집 조건에 맞는지 확인해요</li>
        <li>③ 새 공고가 있으면 하루 1번 알려 드려요</li>
      </ol>
      <Link href="/profile/setup" className={`${primaryButton} flex items-center justify-center`}>
        시작하기
      </Link>
    </section>
  );
}
