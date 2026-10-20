import type { HouseholdKind } from "@shared/domain/profile.ts";
import { ProfileWizard } from "@/features/profile/ui/ProfileWizard";

const KINDS: readonly HouseholdKind[] = ["senior", "newlywed"];

// 처음 입력 (/profile/setup) · 처음부터 다시 입력 (/profile/setup?redo=1) · 가구 종류 바꾸기 (?redo=1&kind=newlywed, 변경 3 BR-U4-D42)
export default async function ProfileSetupPage({ searchParams }: { searchParams: Promise<{ redo?: string; kind?: string }> }) {
  const { redo, kind } = await searchParams;
  const switchTo = KINDS.find((k) => k === kind);
  return <ProfileWizard mode={redo === "1" ? { kind: "redo", switchTo } : { kind: "setup" }} />;
}
