import { notFound } from "next/navigation";
import { GROUP_ORDER, type GroupId } from "@/features/profile/model/steps";
import { ProfileWizard } from "@/features/profile/ui/ProfileWizard";

// 설정에서 그룹 고치기 (US-18, BR-U4-71)
export default async function ProfileEditPage({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  if (!(GROUP_ORDER as readonly string[]).includes(group)) notFound();
  return <ProfileWizard mode={{ kind: "edit", group: group as GroupId }} />;
}
