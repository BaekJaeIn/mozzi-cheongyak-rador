import { ProfileWizard } from "@/features/profile/ui/ProfileWizard";

// 처음 입력 (/profile/setup) · 처음부터 다시 입력 (/profile/setup?redo=1)
export default async function ProfileSetupPage({ searchParams }: { searchParams: Promise<{ redo?: string }> }) {
  const { redo } = await searchParams;
  return <ProfileWizard mode={redo === "1" ? { kind: "redo" } : { kind: "setup" }} />;
}
