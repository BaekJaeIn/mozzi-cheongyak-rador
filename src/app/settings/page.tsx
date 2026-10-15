import { SettingsView } from "@/features/settings/SettingsView";

// 설정 (U4). saved: 고치기 저장 결과 (synced·offline·rejected)
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  return <SettingsView saved={saved} />;
}
