// 공용 지역 데이터 (U2 변경 2 domain-entities, FR-C2-9)
// 입력 화면(U4)·공고 지역 판별(U3)·관심 지역 판정(U2)이 이 목록 하나를 쓴다.
// 2026년 행정구역: 인천 2026-07-01 중구·동구 → 제물포구·영종구, 서구 → 서해구·검단구. 광주·전남은 전남광주통합특별시

export type CapitalSido = "서울" | "경기" | "인천";
export const CAPITAL_SIDO: readonly CapitalSido[] = ["서울", "경기", "인천"];

/** 수도권 시군구. 경기의 "수원시 영통구"처럼 시 아래 구는 시로 본다 */
export const CAPITAL_SIGUNGU: Readonly<Record<CapitalSido, readonly string[]>> = {
  서울: [
    "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구",
    "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구",
  ],
  경기: [
    "가평군", "고양시", "과천시", "광명시", "광주시", "구리시", "군포시", "김포시", "남양주시", "동두천시", "부천시", "성남시", "수원시",
    "시흥시", "안산시", "안성시", "안양시", "양주시", "양평군", "여주시", "연천군", "오산시", "용인시", "의왕시", "의정부시", "이천시",
    "파주시", "평택시", "포천시", "하남시", "화성시",
  ],
  인천: ["강화군", "검단구", "계양구", "남동구", "미추홀구", "부평구", "서해구", "연수구", "영종구", "옹진군", "제물포구"],
};

export function isCapitalSido(value: unknown): value is CapitalSido {
  return typeof value === "string" && (CAPITAL_SIDO as readonly string[]).includes(value);
}

/** 수도권 시도의 시군구 목록에 있는지 */
export function isCapitalSigungu(sido: CapitalSido, sigungu: string): boolean {
  return CAPITAL_SIGUNGU[sido].includes(sigungu);
}

const SIDO_ALIASES: [string, string[]][] = [
  ["서울", ["서울특별시", "서울시", "서울"]],
  ["부산", ["부산광역시", "부산시", "부산"]],
  ["대구", ["대구광역시", "대구시", "대구"]],
  ["인천", ["인천광역시", "인천시", "인천"]],
  ["광주", ["광주광역시", "광주시", "광주"]],
  ["대전", ["대전광역시", "대전시", "대전"]],
  ["울산", ["울산광역시", "울산시", "울산"]],
  ["세종", ["세종특별자치시", "세종시", "세종"]],
  ["경기", ["경기도", "경기"]],
  ["강원", ["강원특별자치도", "강원도", "강원"]],
  ["충북", ["충청북도", "충북"]],
  ["충남", ["충청남도", "충남"]],
  ["전북", ["전북특별자치도", "전라북도", "전북"]],
  ["전남", ["전라남도", "전남"]],
  ["경북", ["경상북도", "경북"]],
  ["경남", ["경상남도", "경남"]],
  ["제주", ["제주특별자치도", "제주도", "제주"]],
];

/** "서울특별시" → "서울" 처럼 줄임 이름으로 맞춘다. 모르는 이름은 공백만 지워 돌려준다. */
export function normalizeSido(name: string): string {
  const compact = name.normalize("NFC").replace(/\s+/g, "");
  for (const [canonical, aliases] of SIDO_ALIASES) {
    if (aliases.some((alias) => compact === alias)) return canonical;
  }
  return compact;
}

/** 주소·제목 같은 문장에서 처음 나오는 시도 이름을 줄임 이름으로 찾는다 (U3 정규화). 없으면 null. */
export function findSido(text: string): string | null {
  const compact = text.normalize("NFC");
  let best: { index: number; canonical: string; length: number } | null = null;
  for (const [canonical, aliases] of SIDO_ALIASES) {
    for (const alias of aliases) {
      const index = compact.indexOf(alias);
      if (index === -1) continue;
      // 같은 위치면 더 긴 이름(예: "광주광역시")을, 아니면 더 앞에 나온 이름을 쓴다
      if (!best || index < best.index || (index === best.index && alias.length > best.length)) {
        best = { index, canonical, length: alias.length };
      }
    }
  }
  return best?.canonical ?? null;
}
