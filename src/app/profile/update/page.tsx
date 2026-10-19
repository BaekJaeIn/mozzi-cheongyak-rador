import { ProfileWizard } from "@/features/profile/ui/ProfileWizard";

// 새 항목만 묻는 짧은 입력 화면 (변경 2, US-21, BR-U4-C30~C35)
export default function ProfileUpdatePage() {
  return <ProfileWizard mode={{ kind: "update" }} />;
}
