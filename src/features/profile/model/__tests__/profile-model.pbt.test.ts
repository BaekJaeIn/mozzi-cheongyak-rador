// 속성 기반 테스트 — U4 (domain-entities §6, P-U4-1~10)
import { fc, test } from "@fast-check/vitest";
import { validateProfile } from "@shared/domain/profile.ts";
import { expect } from "vitest";
import { CONFIRM_ABOVE, formatManwon, needsConfirm, parseKoreanManwon } from "../amount";
import { type BandDef, bandOf, HOMELESS_BANDS, lowerOf, MONTHS_BANDS, RESIDENCE_BANDS } from "../bands";
import { fromProfile, mergeGroupEdit, toProfile } from "../convert";
import { hourLabel, HOURS } from "../hour";
import { GROUP_ORDER, markUnknown, pruneHidden, STEPS, visibleSteps } from "../steps";
import { commitProfile, loadStoredProfile } from "../storage";
import { type ApiOutcome, createProfileSync } from "../sync";
import { answersArb } from "./arbitraries";
import { memoryStorage } from "./helpers";

test.prop([answersArb])("P-U4-1 마법사가 만든 프로필은 항상 서버 형식 검증을 통과한다", (a) => {
  expect(validateProfile(toProfile(a)).ok).toBe(true);
});

test.prop([answersArb])("P-U4-2 보이는 화면: 필수 화면 포함, 조건이 거짓인 화면 없음, 표 순서의 부분열", (a) => {
  const list = visibleSteps(a);
  const pruned = pruneHidden(a);
  for (const id of ["selfBirth", "household", "residence", "districts", "review"]) expect(list.map((s) => s.id)).toContain(id);
  expect(list.every((s) => s.visible(pruned))).toBe(true);
  const order = list.map((s) => STEPS.indexOf(s));
  expect([...order].sort((x, y) => x - y)).toEqual(order);
});

test.prop([answersArb, fc.subarray(STEPS.map((s) => s.id))])(
  "P-U4-1b 어느 화면에서든 [잘 모르겠어요]를 눌러도 프로필은 서버 형식 검증을 통과한다",
  (a, unknownSteps) => {
    const marked = unknownSteps.reduce((acc, id) => markUnknown(id, acc), a);
    expect(validateProfile(toProfile(marked)).ok).toBe(true);
  },
);

test.prop([answersArb, fc.boolean()])("P-U4-3 안 보이는 화면에 남은 답은 프로필에 영향을 주지 않는다", (a, flip) => {
  const pruned = pruneHidden(a);
  // 숨은 화면 답을 마구 바꿔도 결과가 같다
  const noisy = { ...a };
  for (const step of STEPS) {
    if (step.visible(pruned)) continue;
    if (step.id === "homeCount") noisy.homeCount = flip ? 3 : 1;
    if (step.id === "spouseBirth") noisy.spouseBirth = "1955-05-05";
    if (step.id === "spouseEarns") noisy.spouseEarns = flip;
    if (step.id === "savingsKind") noisy.savingsKind = "deposit";
    if (step.id === "homelessYears") noisy.homelessYearsBand = "ge15";
  }
  expect(toProfile(noisy)).toEqual(toProfile(a));
});

test.prop([answersArb])("P-U4-4 프로필 → 답 → 프로필 왕복", (a) => {
  const p = toProfile(a);
  expect(toProfile(fromProfile(p))).toEqual(p);
});

const ALL_BANDS: readonly (readonly BandDef<string>[])[] = [RESIDENCE_BANDS, HOMELESS_BANDS, MONTHS_BANDS];

test.prop([fc.integer({ min: 0, max: 200 })])("P-U4-5 구간: 아래 값 ≤ 값, 왕복, 단조", (v) => {
  for (const bands of ALL_BANDS) {
    const lower = lowerOf(bands, bandOf(bands, v));
    expect(lower).toBeLessThanOrEqual(v);
    expect(bandOf(bands, lower)).toBe(bandOf(bands, v));
    expect(lowerOf(bands, bandOf(bands, v + 1))).toBeGreaterThanOrEqual(lower);
  }
});

test.prop([fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 1_000_000 })])(
  "P-U4-6 한글 금액: 왕복, 서로 다른 값은 다른 문구",
  (x, y) => {
    expect(parseKoreanManwon(formatManwon(x))).toBe(x);
    if (x !== y) expect(formatManwon(x)).not.toBe(formatManwon(y));
  },
);

test.prop([
  fc.constantFrom(...(Object.keys(CONFIRM_ABOVE) as (keyof typeof CONFIRM_ABOVE)[])),
  fc.integer({ min: 0, max: 1_000_000 }),
  fc.integer({ min: 0, max: 1_000_000 }),
])("P-U4-7 단위 실수 확인은 단조", (field, x, d) => {
  if (needsConfirm(field, x)) expect(needsConfirm(field, x + d)).toBe(true);
});

test.prop([answersArb, answersArb, fc.constantFrom(...GROUP_ORDER)])(
  "P-U4-8 그룹 고치기는 다른 그룹의 (계속 보이는) 값을 바꾸지 않는다",
  (base, other, group) => {
    const current = fromProfile(toProfile(base));
    const merged = mergeGroupEdit(current, fromProfile(toProfile(other)), group);
    const prunedMerged = pruneHidden(merged);
    for (const step of STEPS) {
      if (step.group === group || step.group === "review" || !step.visible(prunedMerged)) continue;
      for (const f of step.fields) {
        // 세대주 "배우자"는 배우자가 없어지면 지워진다 (BR-U4-12)
        if (f === "head" && current.head === "spouse" && prunedMerged.head === undefined) continue;
        expect(prunedMerged[f]).toEqual(current[f]);
      }
    }
  },
);

type Op = { kind: "save"; n: number } | { kind: "flush"; outcome: ApiOutcome };
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant("save" as const), n: fc.integer({ min: 0, max: 1000 }) }),
  fc.record({
    kind: fc.constant("flush" as const),
    outcome: fc.oneof(
      fc.constant<ApiOutcome>({ ok: true }),
      fc.constant<ApiOutcome>({ ok: false, status: 0 }),
      fc.constant<ApiOutcome>({ ok: false, status: 503 }),
    ),
  }),
);

test.prop([answersArb, fc.array(opArb, { maxLength: 20 })])(
  "P-U4-9 동기화: 마지막 flush가 성공하면 서버 값 = 기기의 마지막 저장, 보낸 횟수 ≤ flush 횟수",
  async (a, ops) => {
    const storage = memoryStorage();
    const base = toProfile(a);
    let server: unknown = null;
    let outcome: ApiOutcome = { ok: true };
    let sends = 0;
    let flushes = 0;
    const sync = createProfileSync({
      storage,
      api: {
        putProfile: async (p) => {
          sends += 1;
          if (outcome.ok) server = p;
          return outcome;
        },
        putNotify: async () => ({ ok: true }),
      },
    });
    let clock = 0;
    for (const op of ops) {
      if (op.kind === "save") {
        commitProfile(storage, { ...base, money: { ...base.money, monthlyIncome: op.n } }, new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)));
      } else {
        outcome = op.outcome;
        flushes += 1;
        await sync.flush();
      }
    }
    outcome = { ok: true };
    flushes += 1;
    await sync.flush();
    const stored = loadStoredProfile(storage);
    if (stored) {
      expect(server).toEqual(stored.profile);
      expect(stored.sync.state).toBe("synced");
    }
    expect(sends).toBeLessThanOrEqual(flushes);
  },
);

test("P-U4-10 알림 시각 표기: 24개 모두 다르다", () => {
  expect(new Set(HOURS.map(hourLabel)).size).toBe(24);
});
