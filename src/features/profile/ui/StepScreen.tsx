"use client";

// 마법사 화면별 질문·입력 (business-rules §2 표, §3 입력 방식, 변경 2 §9)
import type { IsoDate } from "@shared/domain/dates.ts";
import { AREA_BANDS, type SavingsKind, SAVINGS_KINDS, type WelfareStatus, WELFARE_STATUSES } from "@shared/domain/profile.ts";
import type { ReactNode } from "react";
import { HOMELESS_BANDS, MONTHS_BANDS, RESIDENCE_BANDS } from "../model/bands";
import { DISTRICT_OPTIONS } from "../model/districts";
import { defaultRegions, SIDO_OPTIONS, SIGUNGU_BY_SIDO } from "../model/regions";
import { hasSpouse, SELF_BIRTH_YEARS, spouseBirthYears, type StepId } from "../model/steps";
import { isCapitalSido } from "@shared/domain/regions.ts";
import { AREA_LABELS, SAVINGS_KIND_LABELS, WELFARE_LABELS } from "../model/summary";
import { type Maybe, type SavingsOwnerAnswer, UNKNOWN, type WizardAnswers } from "../model/types";
import { AmountInput, BirthDatePicker, ChoiceList, CountInput, MultiChoice, RegionMultiPicker } from "./controls";

/** 화면 제목(질문). 본인·배우자는 이 휴대폰 사용자 기준 (BR-U4-14) */
export const STEP_TITLES: Readonly<Record<StepId, string>> = {
  selfBirth: "이 휴대폰을 쓰시는 분의 생년월일을 골라 주세요",
  household: "주민등록에 함께 올라 있는 분은 누구인가요?",
  householdMore: "함께 올라 있는 가족을 알려 주세요",
  spouseBirth: "배우자분의 생년월일을 골라 주세요",
  head: "주민등록상 세대주는 누구인가요?",
  residence: "지금 사시는 곳을 골라 주세요",
  residenceYears: "지금 사시는 시(서울은 서울 전체)에 계속 사신 지 얼마나 되셨나요?",
  homeOwned: "지금 집을 가지고 계신가요?",
  homeCount: "가지고 계신 집은 몇 채인가요?",
  homelessYears: "집 없이 지내신 지 얼마나 되셨나요?",
  savingsOwner: "청약통장이 있으신가요?",
  savingsKind: "어떤 통장인가요?",
  savingsPeriod: "통장에 가입하신 지 얼마나 되셨나요?",
  savingsAmount: "통장에 들어 있는 돈은 얼마인가요?",
  income: "부부 두 분의 소득을 합친 월평균은 얼마인가요?",
  spouseEarns: "배우자분도 일하거나 사업 소득이 있나요?",
  asset: "세대 전체의 총자산은 얼마인가요?",
  car: "가지고 계신 자동차 값은 얼마인가요?",
  welfare: "아래 중 해당하는 것이 있나요?",
  districts: "관심 있는 3기 신도시를 골라 주세요",
  regions: "다른 지역도 볼까요?",
  area: "원하시는 집 넓이를 골라 주세요",
  tenurePrefs: "원하시는 집 조건을 골라 주세요",
  review: "입력하신 내용을 확인해 주세요",
};

const STEP_HINTS: Partial<Record<StepId, string>> = {
  selfBirth: "이 휴대폰을 쓰시는 분이 '나(본인)'예요. 배우자 휴대폰에서는 배우자분이 '나'가 돼요.",
  head: "등본 맨 위에 이름이 있는 분이 세대주예요.",
  homeOwned: "부부 두 분 모두 포함해서 답해 주세요. 분양권·입주권도 집으로 봐요.",
  savingsAmount: "통장 앱이나 은행에서 보이는 '납입 인정 금액'을 넣어 주세요.",
  area: "여러 개 고를 수 있어요. 고르지 않으면 '상관없음'이에요. 순서를 정할 때만 쓰고 공고를 숨기지는 않아요.",
  tenurePrefs: "순서를 정할 때만 쓰고 공고를 숨기지는 않아요.",
  residenceYears: "같은 시·군 안에서 이사한 것은 이어서 세요. 주민등록 기준이에요. 예) 강서구 화곡동 15년 → 올해 염창동으로 이사: 10년 이상",
  districts: "다른 지역은 다음 화면에서 고를 수 있어요. 여기서는 하나도 안 골라도 돼요.",
  regions: "서울·경기·인천에서 공고를 보고 싶은 곳을 여러 개 고를 수 있어요. 고른 곳과 3기 신도시의 공고만 보여 드리고 알려 드려요.",
};

export function stepHint(id: StepId): string | undefined {
  return STEP_HINTS[id];
}

/** 통장 자세한 화면의 "누구 통장" (BR-U4-C3). 혼자 사는 가구는 그냥 "통장" */
function savingsWho(a: WizardAnswers): string {
  if (!hasSpouse(a)) return "통장";
  return ({ self: "내 통장", spouse: "배우자분 통장", both: "가입이 더 오래된 통장" } as Partial<Record<string, string>>)[String(a.savingsOwner)] ?? "통장";
}

/** 답에 따라 바뀌는 질문 (BR-U4-C3, FR-C2-1) */
export function stepTitle(id: StepId, a: WizardAnswers): string {
  switch (id) {
    case "savingsOwner":
      return hasSpouse(a) ? "부부 중 청약통장이 있는 분이 있나요?" : STEP_TITLES.savingsOwner;
    case "savingsKind":
      return `${savingsWho(a)}은 어떤 통장인가요?`;
    case "savingsPeriod":
      return `${savingsWho(a)}에 가입하신 지 얼마나 되셨나요?`;
    case "savingsAmount":
      return `${savingsWho(a)}에 들어 있는 돈은 얼마인가요?`;
    default:
      return STEP_TITLES[id];
  }
}

const SPOUSE_ACCOUNT_HELP = "배우자분 통장이어도 우리 집 공고를 함께 볼 수 있어요";

const yesNo: { value: boolean; label: string }[] = [
  { value: true, label: "예" },
  { value: false, label: "아니오" },
];

/** UNKNOWN은 화면에서 "고르지 않음"으로 보여 준다 */
const shown = <T,>(v: Maybe<T> | undefined): T | undefined => (v === UNKNOWN ? undefined : (v as T | undefined));

export function StepScreen({
  step,
  answers,
  today,
  set,
}: {
  step: StepId;
  answers: WizardAnswers;
  today: IsoDate;
  set: (patch: Partial<WizardAnswers>) => void;
}): ReactNode {
  const a = answers;
  switch (step) {
    case "selfBirth":
      return <BirthDatePicker value={a.selfBirth} years={SELF_BIRTH_YEARS} today={today} onChange={(v) => set({ selfBirth: v })} />;
    case "household":
      return (
        <ChoiceList
          label="세대 구성"
          value={a.householdType}
          onChange={(v) => set({ householdType: v })}
          options={[
            { value: "couple" as const, label: "부부 두 분만" },
            { value: "single" as const, label: "혼자" },
            { value: "other" as const, label: "다른 가족도 함께", help: "자녀·부모님 등" },
          ]}
        />
      );
    case "householdMore":
      return (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-2 text-body font-bold">모두 몇 명인가요? (본인 포함)</h2>
            <ChoiceList
              label="가족 수"
              columns={4}
              value={a.householdSize}
              onChange={(v) => set({ householdSize: v })}
              options={[2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: `${n}명` }))}
            />
          </section>
          <section>
            <h2 className="mb-2 text-body font-bold">그중 배우자가 계신가요?</h2>
            <ChoiceList label="배우자 유무" columns={2} value={a.hasSpouse} onChange={(v) => set({ hasSpouse: v })} options={yesNo} />
          </section>
        </div>
      );
    case "spouseBirth":
      return (
        <BirthDatePicker
          value={shown(a.spouseBirth)}
          years={spouseBirthYears(today)}
          today={today}
          onChange={(v) => set({ spouseBirth: v })}
        />
      );
    case "head":
      return (
        <ChoiceList
          label="세대주"
          value={shown(a.head)}
          onChange={(v) => set({ head: v })}
          options={[
            { value: "self" as const, label: "나" },
            ...(hasSpouse(a) ? [{ value: "spouse" as const, label: "배우자" }] : []),
            { value: "other" as const, label: "다른 가족" },
          ]}
        />
      );
    case "residence":
      return (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-2 text-body font-bold">시·도</h2>
            <ChoiceList
              label="시·도"
              columns={3}
              value={a.sido}
              onChange={(v) => set({ sido: v, sigungu: v in SIGUNGU_BY_SIDO ? undefined : null })}
              options={SIDO_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </section>
          {a.sido && SIGUNGU_BY_SIDO[a.sido] && (
            <section>
              <h2 className="mb-2 text-body font-bold">시·군·구</h2>
              <ChoiceList
                label="시·군·구"
                columns={2}
                value={a.sigungu ?? undefined}
                onChange={(v) => set({ sigungu: v })}
                options={SIGUNGU_BY_SIDO[a.sido]!.map((name) => ({ value: name, label: name }))}
              />
            </section>
          )}
        </div>
      );
    case "residenceYears":
      return (
        <ChoiceList
          label="거주 기간"
          value={shown(a.residenceYearsBand)}
          onChange={(v) => set({ residenceYearsBand: v })}
          options={RESIDENCE_BANDS.map((b) => ({ value: b.band, label: b.label }))}
        />
      );
    case "homeOwned":
      return <ChoiceList label="집 보유" value={shown(a.homeOwned)} onChange={(v) => set({ homeOwned: v })} options={yesNo} />;
    case "homeCount":
      return (
        <ChoiceList
          label="보유 주택 수"
          columns={3}
          value={shown(a.homeCount)}
          onChange={(v) => set({ homeCount: v })}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 5 ? "5채 이상" : `${n}채` }))}
        />
      );
    case "homelessYears":
      return (
        <ChoiceList
          label="무주택 기간"
          value={shown(a.homelessYearsBand)}
          onChange={(v) => set({ homelessYearsBand: v })}
          options={HOMELESS_BANDS.map((b) => ({ value: b.band, label: b.label }))}
        />
      );
    case "savingsOwner": {
      const options: { value: SavingsOwnerAnswer; label: string; help?: string }[] = hasSpouse(a)
        ? [
            { value: "self", label: "나" },
            { value: "spouse", label: "배우자", help: SPOUSE_ACCOUNT_HELP },
            { value: "both", label: "두 분 다", help: SPOUSE_ACCOUNT_HELP },
            { value: "none", label: "없음" },
          ]
        : [
            { value: "self", label: "있음" },
            { value: "none", label: "없음" },
          ];
      return (
        <div className="flex flex-col gap-4">
          <ChoiceList label="청약통장" value={shown(a.savingsOwner)} onChange={(v) => set({ savingsOwner: v })} options={options} />
          {a.savingsOwner === "both" && (
            <p role="status" className="rounded-2xl bg-primary-soft px-4 py-3 text-body">
              신청할 때는 가입이 더 오래된 통장 하나로 해요. 다음 화면부터 그 통장 정보를 넣어 주세요.
            </p>
          )}
        </div>
      );
    }
    case "savingsKind":
      return (
        <ChoiceList
          label="통장 종류"
          value={shown(a.savingsKind)}
          onChange={(v) => set({ savingsKind: v })}
          options={SAVINGS_KINDS.map((k: SavingsKind) => ({ value: k, label: SAVINGS_KIND_LABELS[k].name, help: SAVINGS_KIND_LABELS[k].help }))}
        />
      );
    case "savingsPeriod":
      return (
        <div className="flex flex-col gap-6">
          <ChoiceList
            label="가입 기간"
            value={shown(a.savingsMonthsBand)}
            onChange={(v) => set({ savingsMonthsBand: v })}
            options={MONTHS_BANDS.map((b) => ({ value: b.band, label: b.label }))}
          />
          <section>
            <h2 className="mb-2 text-body font-bold">돈을 넣은 횟수 (납입 인정 횟수)</h2>
            <CountInput label="납입 횟수" unit="회" max={600} value={shown(a.paymentCount)} onChange={(v) => set({ paymentCount: v })} />
          </section>
        </div>
      );
    case "savingsAmount":
      return (
        <AmountInput
          label="통장 금액"
          help="통장에 들어 있는 금액을 만원 단위로 넣어 주세요."
          value={shown(a.depositManwon)}
          onChange={(v) => set({ depositManwon: v })}
        />
      );
    case "income":
      return (
        <AmountInput
          label="월평균 소득"
          help="부부 두 분의 소득을 합친 월평균(세금 떼기 전)을 만원 단위로 넣어 주세요. 연금·근로·사업 소득 모두 포함해요."
          monthly
          value={shown(a.monthlyIncome)}
          onChange={(v) => set({ monthlyIncome: v })}
        />
      );
    case "spouseEarns":
      return <ChoiceList label="배우자 소득" value={shown(a.spouseEarns)} onChange={(v) => set({ spouseEarns: v })} options={yesNo} />;
    case "asset":
      return (
        <AmountInput
          label="총자산"
          help="집·땅·예금·주식 등 세대 전체의 재산을 합친 금액을 만원 단위로 넣어 주세요."
          value={shown(a.totalAsset)}
          onChange={(v) => set({ totalAsset: v })}
        />
      );
    case "car":
      return (
        <AmountInput
          label="자동차 값"
          help="가지고 계신 자동차 값(여러 대면 합계)을 만원 단위로 넣어 주세요. 없으면 0이에요."
          value={shown(a.carValue)}
          onChange={(v) => set({ carValue: v })}
        />
      );
    case "welfare":
      return (
        <ChoiceList
          label="해당 사항"
          value={shown(a.welfare)}
          onChange={(v) => set({ welfare: v })}
          options={WELFARE_STATUSES.map((w: WelfareStatus) => ({ value: w, label: WELFARE_LABELS[w] }))}
        />
      );
    case "districts":
      return (
        <MultiChoice
          label="3기 신도시"
          value={a.districtIds ?? []}
          onChange={(v) => set({ districtIds: v })}
          options={DISTRICT_OPTIONS.map((d) => ({ value: d.id, label: d.name }))}
        />
      );
    case "regions": {
      const home = defaultRegions(a.sido, a.sigungu)[0];
      const homePicked = home !== undefined && (a.regions ?? []).some((r) => r.sido === home.sido && r.sigungu === home.sigungu);
      return (
        <div className="flex flex-col gap-4">
          {homePicked && <p className="text-body text-muted">사시는 곳({home.sido} {home.sigungu})을 골라 두었어요. 빼려면 한 번 더 누르세요.</p>}
          <RegionMultiPicker value={a.regions ?? []} onChange={(v) => set({ regions: v })} initialSido={isCapitalSido(a.sido) ? a.sido : "서울"} />
        </div>
      );
    }
    case "area":
      return (
        <MultiChoice
          label="원하는 넓이"
          value={a.areaBands ?? []}
          onChange={(v) => set({ areaBands: v })}
          options={AREA_BANDS.map((b) => ({ value: b, label: AREA_LABELS[b] }))}
        />
      );
    case "tenurePrefs":
      return (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-2 text-body font-bold">분양과 임대 중 어느 쪽인가요?</h2>
            <ChoiceList
              label="분양·임대"
              value={a.tenure}
              onChange={(v) => set({ tenure: v })}
              options={[
                { value: "sale" as const, label: "분양 (집을 사기)" },
                { value: "rent" as const, label: "임대 (빌려 살기)" },
                { value: "both" as const, label: "둘 다" },
              ]}
            />
          </section>
          <section>
            <h2 className="mb-2 text-body font-bold">낮은 층이 좋으신가요?</h2>
            <ChoiceList
              label="저층 선호"
              columns={2}
              value={a.lowFloor}
              onChange={(v) => set({ lowFloor: v })}
              options={[
                { value: true, label: "예" },
                { value: false, label: "상관없음" },
              ]}
            />
          </section>
        </div>
      );
    case "review":
      return null;
  }
}
