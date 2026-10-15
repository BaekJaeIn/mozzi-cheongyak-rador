// 3기 신도시 지구 매칭 (BR-U2-01~06)
import { compactText } from "./supply-types.ts";

export interface DistrictRule {
  id: string;
  sigungu: string[];
  keywords: string[];
  areaKeywords: string[];
  active: boolean;
  sortOrder: number;
}

export interface NoticeText {
  title: string;
  complexName?: string | null;
  location?: string | null;
  /** 원천 데이터에 시군구 필드가 따로 있으면 */
  sigungu?: string | null;
}

/** "고양시 덕양구"는 "고양시덕양구"와 "덕양구" 둘 다로 찾는다. */
function sigunguForms(sigungu: string): string[] {
  const parts = sigungu.trim().split(/\s+/);
  const forms = [compactText(sigungu)];
  const last = parts[parts.length - 1];
  if (parts.length > 1 && last) forms.push(compactText(last));
  return forms;
}

/** 공고 텍스트가 맞는 활성 지구 ID 목록 (sortOrder 순, 중복 없음). */
export function matchDistricts(notice: NoticeText, districts: readonly DistrictRule[]): string[] {
  const text = compactText([notice.title, notice.complexName ?? "", notice.location ?? "", notice.sigungu ?? ""].join(" "));
  const active = districts.filter((d) => d.active); // BR-U2-06
  const byKeyword = active.filter((d) => d.keywords.some((k) => text.includes(compactText(k)))); // BR-U2-02

  // BR-U2-07: 동 키워드 매칭(BR-U2-03)은 보조 규칙 — 대표 키워드로 찾았거나, 다른 이름의 "지구"를 밝힌 공고에는 쓰지 않는다.
  // 실제 공고: 인천계양 지구 경계에 "부천시 대장동"이 나열됨, "남양주진접2지구"는 진접읍이지만 왕숙이 아님.
  const byArea =
    byKeyword.length > 0 || text.includes("지구")
      ? []
      : active.filter((d) => {
          const inSigungu = d.sigungu.some((s) => sigunguForms(s).some((form) => text.includes(form)));
          return inSigungu && d.areaKeywords.some((k) => text.includes(compactText(k))); // BR-U2-03·04
        });

  return [...byKeyword, ...byArea]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((d) => d.id);
}
