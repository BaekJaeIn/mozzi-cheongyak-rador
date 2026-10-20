// 판정 사유·행동 문구 (NFR-U2-20, P-U2-S3)
// 템플릿은 기준 값·나이·가구원수만 받는다. 프로필의 금액을 받는 템플릿은 두지 않는다 (DB에 평문 금액이 남지 않게).

/** 원 단위 금액 → "645만 2,897원", "300만원" */
export function formatWon(won: number): string {
  const man = Math.floor(won / 10000);
  const rest = won % 10000;
  if (man === 0) return `${rest.toLocaleString("ko-KR")}원`;
  return rest === 0 ? `${formatManwonNumber(man)}원` : `${formatManwonNumber(man)} ${rest.toLocaleString("ko-KR")}원`;
}

function formatManwonNumber(man: number): string {
  const eok = Math.floor(man / 10000);
  const rest = man % 10000;
  if (eok === 0) return `${rest.toLocaleString("ko-KR")}만`;
  return rest === 0 ? `${eok}억` : `${eok}억 ${rest.toLocaleString("ko-KR")}만`;
}

/** 만원 단위 기준 금액 → "3억 4,500만원" */
export function formatManwon(manwon: number): string {
  return `${formatManwonNumber(manwon)}원`;
}

export const ACTION = {
  checkNotice: "원문의 '신청 자격'을 확인해 주세요",
  enterInSettings: (item: string) => `설정에서 ${item}을(를) 입력하면 정확히 알려 드려요`,
  tableMissing: "올해 소득 기준표가 아직 준비되지 않았어요. 공고문의 소득 기준을 확인해 주세요",
  areaDependent: "주택형 면적에 따라 소득 기준이 달라요. 공고문을 확인해 주세요",
  otherPriority: "국가유공자·장애인 등 우선 대상 자격은 공고문에서 확인해 주세요",
  // 변경 3
  engagedRegister: "입주 전까지 혼인신고를 해야 해요",
  checkEngaged: "예비신혼부부를 받는지 공고문을 확인해 주세요",
  checkRealEstate: "부동산(집·땅) 가액이 기준 이하인지 공고문에서 확인해 주세요",
} as const;

/** 변경 3 신혼 가구 사유 (BR-U2-D20~D42) — 금액은 기준 값만 */
export const MSG_NEWLYWED = {
  marriage: (years: number) => `혼인 ${years}년 이내 신혼부부`,
  marriageOk: (years: number) => `혼인 ${years}년 이내 신혼부부예요`,
  marriageOver: (years: number) => `혼인 ${years}년이 지났어요`,
  notNewlywed: "신혼부부 대상 주택이에요",
  engagedOk: "예비신혼부부도 신청할 수 있어요",
  engagedNo: "이 공고는 예비신혼부부를 받지 않아요",
  engagedUnknown: "예비신혼부부도 받는지 확인이 필요해요",
  seniorOnly: "어르신 대상 주택이에요",
  newlywedOnly: "신혼부부·생애최초 대상 물량이에요",
  firstTime: (years: number) => `세대원 모두 집을 가진 적이 없고, ${years}년 이상 소득세를 낸 분이 있어야 해요`,
  firstTimeOwned: "집을 가진 적이 있으면 생애최초로 신청할 수 없어요",
  firstTimeNoTax: (years: number) => `${years}년 이상 소득세를 낸 분이 있어야 해요`,
  firstTimeMarriage: "혼인 중이거나 미혼 자녀가 있어야 해요",
  incomeLottery: (manwon: number) => `소득 기준을 넘지만 부동산이 ${formatManwon(manwon)} 이하면 추첨으로 신청할 수 있어요`,
  incomePriority: "우선공급 소득 기준 안이에요",
  savingsBySpouse: "배우자 통장으로 신청하면 돼요",
  standardNote: "일반적인 기준이에요. 공고문에서 확인해 주세요",
} as const;

export const MSG = {
  unknownRequirement: "공고마다 기준이 달라요",
  unclassified: "어떤 공급 유형인지 알 수 없어요",

  ageEligible: (minAge: number, age: number, couple: boolean) =>
    couple ? `만 ${minAge}세 이상 → 두 분 중 만 ${age}세인 분이 있어요` : `만 ${minAge}세 이상 → 만 ${age}세예요`,
  ageIneligible: (minAge: number, maxAge: number, couple: boolean) =>
    couple ? `만 ${minAge}세 이상 → 두 분 모두 아직 만 ${maxAge}세 이하예요` : `만 ${minAge}세 이상 → 아직 만 ${maxAge}세예요`,
  ageUnknown: (minAge: number) => `만 ${minAge}세 이상인지 확인이 필요해요`,
  headAgeEligible: (minAge: number, age: number) => `세대주가 만 ${minAge}세 이상 → 세대주 만 ${age}세예요`,
  headAgeIneligible: (minAge: number, age: number) => `세대주가 만 ${minAge}세 이상 → 세대주가 아직 만 ${age}세예요`,
  headNotCouple: "세대주가 두 분 중 한 분이어야 해요",
  headRequired: "세대주만 신청할 수 있어요",

  homelessRequired: "집이 없는 세대만 신청할 수 있어요",
  homelessYears: (years: number) => `무주택 기간 ${years}년 이상이 필요해요`,

  income: (size: number, limitWon: number) => `${size}인 가구 기준 월 ${formatWon(limitWon)} 이하`,
  incomeDual: (size: number, limitWon: number, dualWon: number) =>
    `${size}인 가구 기준 월 ${formatWon(limitWon)} 이하 (맞벌이 ${formatWon(dualWon)} 이하)`,
  incomeTableMissing: "소득 기준 금액을 아직 알 수 없어요",

  asset: (maxManwon: number) => `총자산 ${formatManwon(maxManwon)} 이하`,
  car: (maxManwon: number) => `자동차 ${formatManwon(maxManwon)} 이하`,

  savingsNone: "청약통장이 있어야 해요",
  savingsMonths: (months: number) => `청약통장 가입 ${months}개월 이상`,
  savingsPayments: (count: number) => `납입 ${count}회 이상`,
  savingsDeposit: (manwon: number) => `예치금 ${formatManwon(manwon)} 이상`,
  savingsDepositByArea: "예치금은 사는 지역과 주택 면적에 따라 달라요",
  savingsSpouseOwner: "신청은 통장을 가진 배우자분 명의로 하셔야 해요",

  residence: (sidoIn: string[]) => `${sidoIn.join("·")}에 사는 분만 신청할 수 있어요`,

  welfareOk: "생계·의료급여 수급 등 대상이에요",
  welfareNeed: (kinds: string) => `${kinds} 대상이거나 소득 기준을 맞춰야 해요`,
} as const;

export const WELFARE_LABEL: Record<string, string> = {
  livelihood_or_medical: "생계·의료급여 수급",
  near_poverty: "차상위 계층",
  other_priority: "국가유공자·장애인 등",
};
