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

  return districts
    .filter((d) => d.active) // BR-U2-06
    .filter((d) => {
      if (d.keywords.some((k) => text.includes(compactText(k)))) return true; // BR-U2-02
      const inSigungu = d.sigungu.some((s) => sigunguForms(s).some((form) => text.includes(form)));
      return inSigungu && d.areaKeywords.some((k) => text.includes(compactText(k))); // BR-U2-03·04
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((d) => d.id);
}
