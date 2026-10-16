import { NoticeDetailView } from "@/features/notice/NoticeDetailView";

// 공고 상세 — 알림을 눌렀을 때 열리는 곳 (계약 K8). 프로필이 없어도 열린다 (BR-U5-74)
export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NoticeDetailView id={id} />;
}
