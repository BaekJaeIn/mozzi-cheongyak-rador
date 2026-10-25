// 속성 기반 테스트 — U3 변경 4 (business-logic-model "변경 요청 4", P-U3-E1~E7)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { judgementAudiences, NOTICE_AUDIENCES } from "../../domain/audiences.ts";
import { CAPITAL_SIGUNGU } from "../../domain/regions.ts";
import { DISTRICTS } from "../../eligibility/reference-data.ts";
import { findAudiences } from "../audience-words.ts";
import { contentHashInput } from "../content-hash.ts";
import { normalizeWithoutHash } from "../normalize.ts";
import { pickNoticePdf } from "../pdf-locator.ts";
import { findPlaceRegions } from "../place-names.ts";
import { matchCapitalSigungu, withoutSpecialCity } from "../regions.ts";
import type { RawNotice } from "../types.ts";

const gyeonggiArb = fc.constantFrom(...CAPITAL_SIGUNGU["경기"]);
const wordArb = fc.constantFrom("행복주택", "공공분양", "매입임대", "A1블록", "입주자", "모집공고", "(정정)", " ", "S-1", "BIX", "갈매", "거모");
const textArb = fc.array(wordArb, { maxLength: 6 }).map((ws) => ws.join(""));

test.prop([gyeonggiArb, fc.boolean()])("P-U3-E1 시 이름 정리는 멱등이고, 특례시 이름은 '특례'를 뺀 이름과 같게 맞는다", (sigungu, special) => {
  const name = special ? sigungu.replace(/시$/, "특례시") : sigungu;
  expect(withoutSpecialCity(withoutSpecialCity(name))).toBe(withoutSpecialCity(name));
  expect(matchCapitalSigungu("경기", name)).toBe(matchCapitalSigungu("경기", withoutSpecialCity(name)));
});

function raw(title: string, hintTexts: string[]): RawNotice {
  return {
    source: "gh", sourceNoticeNo: "N1", title, complexName: null, location: "경기도", sigungu: null, provider: "GH", supplyTypeText: null, tenureHint: null,
    dates: { announcedAt: null, applyStart: null, applyEnd: null, resultAt: null, contractStart: null, contractEnd: null },
    originalUrl: "https://example.invalid/1", attachments: [], raw: null, hintTexts,
  };
}

test.prop([textArb, fc.array(fc.tuple(gyeonggiArb, textArb).map(([s, t]) => `${s.slice(0, -1)}${t}`), { maxLength: 3 }), fc.array(textArb, { maxLength: 2 })])(
  "P-U3-E2 단서 글을 더하면 시군구가 줄지 않고, 시도는 경기 밖으로 늘지 않는다",
  (title, hints, more) => {
    const before = normalizeWithoutHash(raw(`공고 ${title}`, hints), DISTRICTS)!.regions; // 빈 제목은 정규화가 버린다 (BR-U3-14)
    const after = normalizeWithoutHash(raw(`공고 ${title}`, [...hints, ...more]), DISTRICTS)!.regions;
    const named = (rs: typeof before) => rs.filter((r) => r.sigungu !== null).map((r) => r.sigungu);
    expect(named(after)).toEqual(expect.arrayContaining(named(before)));
    expect(after.every((r) => r.sido === "경기")).toBe(true);
  },
);

test.prop([textArb, gyeonggiArb, fc.constantFrom("가", "공공", "A", "1")])("P-U3-E3 낱말 처음이 아닌 곳의 시군구 이름은 결과를 바꾸지 않는다", (text, sigungu, glue) => {
  const inner = `${text}${glue}${sigungu.slice(0, -1)}`;
  const base = findPlaceRegions("경기", [`${text}${glue}`]);
  // 붙여 넣은 이름 자체가 "낱말 처음"이 되지 않게 앞에 한글·영문·숫자를 둔다
  expect(findPlaceRegions("경기", [inner]).filter((r) => !base.some((b) => b.sigungu === r.sigungu)).map((r) => r.sigungu)).not.toContain(sigungu);
});

const audienceWordArb = fc.constantFrom("기업체기숙사", "창업", "예술인", "대학생", "청년", "장애인", "수급자", "어르신", "신혼", "행복주택", "공공분양", " ");

test.prop([fc.array(audienceWordArb, { maxLength: 5 }), fc.array(audienceWordArb, { maxLength: 3 })])("P-U3-E4 낱말을 더하면 대상이 줄지 않고, 결과는 9개 값 안·중복 없음·표 순서", (a, b) => {
  const before = findAudiences([a.join("")]);
  const after = findAudiences([a.join(""), b.join("")]);
  expect(after).toEqual(expect.arrayContaining(before));
  expect(new Set(after).size).toBe(after.length);
  expect(after).toEqual(NOTICE_AUDIENCES.filter((x) => after.includes(x)));
});

const nameArb = fc.tuple(fc.constantFrom("공고문", "공고문(PDF) ", "팸플릿", "주택목록", "모집공고"), fc.constantFrom(".pdf", ".hwpx", ".xlsx", ".jpg", "")).map(([n, ext]) => `${n}${ext}`);
const urlArb = fc.constantFrom("https://x/a.pdf", "https://x/lhFile.do?fileid=1", "https://x/b.pdf?v=2", "https://x/c.xlsx");

test.prop([fc.array(fc.record({ name: nameArb, url: urlArb }), { maxLength: 6 })])("P-U3-E5 고른 첨부는 항상 이름 확장자나 주소 경로가 .pdf", (attachments) => {
  const pick = pickNoticePdf(attachments);
  if (pick) expect(/\.pdf\s*$/i.test(pick.name) || /\.pdf($|\?)/i.test(pick.url)).toBe(true);
});

const audiencesArb = fc.subarray([...NOTICE_AUDIENCES]);

test.prop([fc.option(audiencesArb, { nil: null }), audiencesArb])("P-U3-E6 판정 대상 = AI 값이 비어 있지 않으면 AI, 아니면 제목 값", (ai, own) => {
  expect(judgementAudiences(ai, own)).toEqual(ai && ai.length > 0 ? ai : own);
});

test.prop([fc.string(), fc.array(fc.string(), { maxLength: 3 }), fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 })])(
  "P-U3-E7 같은 내용·같은 판이면 같은 해시 입력, 판이 다르면 다른 입력",
  (title, locationTexts, v1, v2) => {
    const n = { title, location: null, supplyTypeText: null, schedule: normalizeWithoutHash(raw("t", []), DISTRICTS)!.schedule, attachments: [], locationTexts };
    expect(contentHashInput({ ...n, locationTexts: [...locationTexts].reverse() }, v1)).toBe(contentHashInput(n, v1));
    if (v1 !== v2) expect(contentHashInput(n, v1)).not.toBe(contentHashInput(n, v2));
  },
);
