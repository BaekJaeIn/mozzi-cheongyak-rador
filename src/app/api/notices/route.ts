import { noticeSummariesRoute } from "@/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 관심 공고 갱신용 요약 ?ids=a,b (BR-U5-132)
export const GET = noticeSummariesRoute;
