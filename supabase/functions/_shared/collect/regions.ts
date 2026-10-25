// 공고 지역 판별 (U3 변경 2 BR-U3-C4~C9, P-U3-C6) — DB·네트워크 없는 순수 함수
import { type DistrictRule } from "../domain/district-matcher.ts";
import { type CapitalSido, CAPITAL_SIDO, CAPITAL_SIGUNGU, isCapitalSido, normalizeSido } from "../domain/regions.ts";
import type { NoticeRegion } from "../eligibility/types.ts";

/**
 * 인천 2026-07 개편 전 구 이름 → 새 구 (BR-U3-C5). 법정동 기준 — 행정안전부 행정구역 자료로 대조:
 * - 영종구 = 옛 중구의 영종도·용유·무의 (운서·운남·운북·중산·을왕·남북·덕교·무의동, 행정동 영종·영종1·용유)
 * - 검단구 = 옛 서구의 검단 (대곡·불로·마전·금곡·오류·왕길·당하·원당동, 행정동 검단·아라·불로대곡·오류왕길)
 */
const YEONGJONG_DONG = ["영종", "운서", "운남", "운북", "중산", "을왕", "남북", "덕교", "무의", "용유"];
const GEOMDAN_DONG = ["검단", "대곡", "불로", "마전", "금곡", "오류", "왕길", "당하", "원당", "아라"];

const compact = (s: string) => s.normalize("NFC").replace(/\s+/g, "");
const hasDong = (text: string, names: readonly string[]) => names.some((n) => new RegExp(`${n}(?:\\d*동|도|지구|신도시|택지|하늘도시|국제도시)`).test(compact(text)));

/** 옛 인천 구 → 새 구. 가를 수 없으면 null (BR-U3-C5) */
export function incheonNewGu(oldGu: string, text: string): string | null {
  if (oldGu === "동구") return "제물포구";
  if (oldGu === "중구") return hasDong(text, YEONGJONG_DONG) ? "영종구" : text.trim() === "" ? null : "제물포구";
  if (oldGu === "서구") return hasDong(text, GEOMDAN_DONG) ? "검단구" : text.trim() === "" ? null : "서해구";
  return null;
}

/** 특례시 이름 → 목록 이름: "화성특례시" → "화성시" (변경 4 BR-U3-E1). 멱등 */
export function withoutSpecialCity(name: string): string {
  return name.replace(/특례시$/, "시");
}

/**
 * 시군구 문자열을 공용 목록 값으로 (BR-U3-C4): 그대로 / "고양시 덕양구" → 고양시 / 인천 옛 구 → 새 구 / 못 맞추면 null.
 * `text`는 인천 옛 구를 가를 때 쓰는 주소·제목
 */
export function matchCapitalSigungu(sido: CapitalSido, sigungu: string | null, text = ""): string | null {
  if (!sigungu) return null;
  const list = CAPITAL_SIGUNGU[sido];
  const parts = sigungu.trim().split(/\s+/).map(withoutSpecialCity);
  for (const p of parts) if (list.includes(p)) return p; // "고양시 덕양구" → 고양시, "강서구" → 강서구, "화성특례시" → 화성시
  if (sido === "인천") {
    const gu = parts.find((p) => ["중구", "동구", "서구"].includes(p));
    if (gu) {
      const newGu = incheonNewGu(gu, text);
      // 옛 "중구"·"서구" 이면서 동을 가를 수 없을 때(주소에 동이 없음)는 시도까지만
      if (newGu && (gu === "동구" || hasDong(text, gu === "중구" ? YEONGJONG_DONG : GEOMDAN_DONG) || hasAnyDong(text))) return newGu;
      return null;
    }
  }
  return null;
}

const hasAnyDong = (text: string) => /[가-힣]{1,6}\d*동(?![가-힣])/.test(text);

/** 정리 규칙 (BR-U3-C6): 중복 제거, 같은 시도에 시군구 값이 있으면 그 시도의 null 항목은 뺀다, 목록 순서로 */
export function mergeRegions(...lists: readonly (readonly NoticeRegion[])[]): NoticeRegion[] {
  const all = lists.flat();
  const out: NoticeRegion[] = [];
  for (const sido of CAPITAL_SIDO) {
    const named = CAPITAL_SIGUNGU[sido].filter((s) => all.some((r) => r.sido === sido && r.sigungu === s));
    if (named.length > 0) for (const s of named) out.push({ sido, sigungu: s });
    else if (all.some((r) => r.sido === sido)) out.push({ sido, sigungu: null });
  }
  return out;
}

/** 지구 → 지역 (BR-U3-C8): 지구의 시도·시군구들 */
export function districtRegions(districtIds: readonly string[], districts: readonly DistrictRule[]): NoticeRegion[] {
  const out: NoticeRegion[] = [];
  for (const id of districtIds) {
    const d = districts.find((x) => x.id === id);
    const sido = d?.sido ? normalizeSido(d.sido) : null;
    if (!d || !isCapitalSido(sido)) continue;
    for (const s of d.sigungu) out.push({ sido, sigungu: matchCapitalSigungu(sido, s) });
  }
  return out;
}

/** 정규화 공고의 지역 (BR-U3-C4·C8). 수도권이 아니거나 시도를 모르면 빈 배열 → 저장 안 함 (BR-U3-C2) */
export function resolveRegions(input: {
  sido: string | null;
  sigungu: string | null;
  text: string;
  districtIds: readonly string[];
  districts: readonly DistrictRule[];
}): NoticeRegion[] {
  const fromDistricts = districtRegions(input.districtIds, input.districts);
  const sido = input.sido ? normalizeSido(input.sido) : null;
  const own: NoticeRegion[] = isCapitalSido(sido) ? [{ sido, sigungu: matchCapitalSigungu(sido, input.sigungu, input.text) }] : [];
  return mergeRegions(own, fromDistricts);
}

/**
 * AI가 뽑은 공급 위치 시군구로 "시도까지만" 항목 고치기 (BR-U3-C9).
 * 시도 집합은 바꾸지 않고, 이미 정해진 시군구는 그대로. 고칠 것이 없으면 null(=regions_ai 안 씀)
 */
export function applyAiRegions(regions: readonly NoticeRegion[], supplySigungu: readonly string[] | null): NoticeRegion[] | null {
  if (!supplySigungu || supplySigungu.length === 0) return null;
  const openSido = new Set(regions.filter((r) => r.sigungu === null).map((r) => r.sido));
  if (openSido.size === 0) return null;
  const found: NoticeRegion[] = [];
  for (const text of supplySigungu) {
    for (const sido of openSido) {
      const named = normalizeSido(text.split(/\s+/)[0] ?? "");
      if (isCapitalSido(named) && named !== sido) continue; // 다른 시도 표기면 건너뜀
      const rest = isCapitalSido(named) ? text.trim().split(/\s+/).slice(1).join(" ") : text;
      const sigungu = matchCapitalSigungu(sido, rest, text);
      if (sigungu) found.push({ sido, sigungu });
    }
  }
  if (found.length === 0) return null;
  return mergeRegions(regions, found);
}
