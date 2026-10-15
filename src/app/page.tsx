import { Placeholder } from "@/features/app-chrome/Placeholder";
import { HomeGate } from "@/features/profile/ui/HomeGate";

// 프로필이 없으면 처음 실행 안내 (U4). 피드는 U5에서 바꾼다
export default function HomePage() {
  return (
    <HomeGate
      feed={<Placeholder title="맞춤 공고" description="우리 집에 맞는 공고를 모아 보여 드릴 곳이에요. 지금 준비하고 있어요." />}
    />
  );
}
