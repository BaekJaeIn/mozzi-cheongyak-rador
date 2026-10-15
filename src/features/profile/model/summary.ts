// 설정 화면의 그룹 요약 한 줄 (business-logic-model §3). 비어 있으면 "확인 필요".
import type { IsoDate } from "@shared/domain/dates.ts";
import { ageAt, type AreaBand, type HouseholdProfile, type SavingsKind, type WelfareStatus } from "@shared/domain/profile.ts";
import { formatManwon } from "./amount";
import { bandLabel, bandOf, HOMELESS_BANDS, MONTHS_BANDS, RESIDENCE_BANDS } from "./bands";
import { ALL_DISTRICT_IDS, districtName } from "./districts";
import { sidoLabel } from "./regions";
import type { GroupId } from "./steps";

export const UNKNOWN_LABEL = "확인 필요";

export const SAVINGS_KIND_LABELS: Readonly<Record<SavingsKind, { name: string; help: string }>> = {
  comprehensive: { name: "주택청약종합저축", help: "요즘 가장 많이 쓰는 통장" },
  savings: { name: "청약저축", help: "예전에 공공주택용으로 많이 만든 통장" },
  deposit: { name: "청약예금", help: "목돈을 한 번에 넣어 두는 통장" },
  installment: { name: "청약부금", help: "매달 조금씩 넣던 예전 통장" },
};

export const WELFARE_LABELS: Readonly<Record<WelfareStatus, string>> = {
  livelihood_or_medical: "생계·의료급여 수급",
  near_poverty: "차상위 계층",
  other_priority: "국가유공자·장애인 등",
  none: "해당 없음",
};

export const AREA_LABELS: Readonly<Record<AreaBand, string>> = {
  xs: "작게 (~40㎡, 약 12평)",
  s: "보통 (40~60㎡, 약 12~18평)",
  m: "넓게 (60~85㎡, 약 18~25평)",
  l: "아주 넓게 (85㎡~, 약 25평~)",
};

const AREA_SHORT: Readonly<Record<AreaBand, string>> = { xs: "~40㎡", s: "40~60㎡", m: "60~85㎡", l: "85㎡~" };

const age = (birth: string | null, today: IsoDate) => (birth ? `만 ${ageAt(birth, today)}세` : UNKNOWN_LABEL);
const money = (v: number | null) => (v === null ? UNKNOWN_LABEL : formatManwon(v));

export function groupSummary(p: HouseholdProfile, group: GroupId, today: IsoDate): string {
  switch (group) {
    case "basic": {
      const head = p.householdHead === null ? UNKNOWN_LABEL : { self: "본인", spouse: "배우자", other: "다른 가족" }[p.householdHead];
      const parts = [`본인 ${age(p.self.birthDate, today)}`];
      if (p.spouse) parts.push(`배우자 ${age(p.spouse.birthDate, today)}`);
      if (p.householdType === "other") parts.push(`가족 ${p.householdSize}명`);
      parts.push(`세대주 ${head}`);
      return parts.join(" · ");
    }
    case "residence": {
      const place = [p.residence.sido ? sidoLabel(p.residence.sido) : UNKNOWN_LABEL, p.residence.sigungu].filter(Boolean).join(" ");
      const years = p.residence.years === null ? UNKNOWN_LABEL : bandLabel(RESIDENCE_BANDS, bandOf(RESIDENCE_BANDS, p.residence.years));
      return `${place} · ${years}`;
    }
    case "housing":
      if (p.housing.homeless === null) return UNKNOWN_LABEL;
      if (p.housing.homeless) {
        const y = p.housing.homelessYears;
        return `집 없음 · ${y === null ? UNKNOWN_LABEL : bandLabel(HOMELESS_BANDS, bandOf(HOMELESS_BANDS, y))}`;
      }
      return `집 있음 · ${p.housing.ownedCount === null ? UNKNOWN_LABEL : `${p.housing.ownedCount >= 5 ? "5채 이상" : `${p.housing.ownedCount}채`}`}`;
    case "savings":
      if (p.savings.has === null) return UNKNOWN_LABEL;
      if (!p.savings.has) return "통장 없음";
      return [
        p.savings.kind ? SAVINGS_KIND_LABELS[p.savings.kind].name : UNKNOWN_LABEL,
        p.savings.months === null ? UNKNOWN_LABEL : bandLabel(MONTHS_BANDS, bandOf(MONTHS_BANDS, p.savings.months)),
      ].join(" · ");
    case "money":
      return [
        `월 ${money(p.money.monthlyIncome)}`,
        `자산 ${money(p.money.totalAsset)}`,
        `자동차 ${money(p.money.carValue)}`,
      ].join(" · ");
    case "districts": {
      const ids = p.prefs.districtIds;
      if (ids.length === ALL_DISTRICT_IDS.length && ALL_DISTRICT_IDS.every((id) => ids.includes(id))) return `${ids.length}곳 모두`;
      const first = districtName(ids[0] ?? "");
      return ids.length > 1 ? `${first} 외 ${ids.length - 1}곳` : first;
    }
    case "prefs": {
      const area = p.prefs.areaBands.length === 0 ? "면적 상관없음" : p.prefs.areaBands.map((b) => AREA_SHORT[b]).join(", ");
      const tenure = { sale: "분양", rent: "임대", both: "분양·임대" }[p.prefs.tenure];
      return [area, tenure, p.prefs.lowFloor ? "저층" : null].filter(Boolean).join(" · ");
    }
  }
}
