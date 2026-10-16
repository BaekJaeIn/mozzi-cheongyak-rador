import { FeedView } from "@/features/feed/FeedView";
import { HomeGate } from "@/features/profile/ui/HomeGate";

// 프로필이 없으면 처음 실행 안내 (U4), 있으면 맞춤 공고 피드 (U5)
export default function HomePage() {
  return <HomeGate feed={<FeedView />} />;
}
