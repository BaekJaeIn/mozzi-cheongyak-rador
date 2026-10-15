// 블록 번호 → 묶음 키용 정규화 (BR-U3-30)
// "A2블록", "A-2BL", "a2 bl", "A02블록" → "A2" / "S-1블록" → "S1" / "A1-1블록" → "A1-1" / 여러 개 → "A1+A2"

const BLOCK = /(?<![A-Za-z])([A-Za-z]{1,2})\s*-?\s*0*(\d{1,2})(?:\s*-\s*0*(\d{1,2}))?\s*(?:블록|BL)/gi;

export function extractBlockKey(text: string): string | null {
  const keys = new Set<string>();
  for (const m of text.normalize("NFC").matchAll(BLOCK)) {
    keys.add(`${m[1]!.toUpperCase()}${m[2]}${m[3] ? `-${m[3]}` : ""}`);
  }
  if (keys.size === 0) return null;
  return [...keys].sort().join("+");
}

export type BlockStyle = "korean" | "hyphenBl" | "lowerSpaced";

/** 테스트·문서용: 블록 키 하나를 원천 표기로 바꾼다 */
export function formatBlock(key: string, style: BlockStyle): string {
  const m = /^([A-Z]{1,2})(\d{1,2})(?:-(\d{1,2}))?$/.exec(key);
  if (!m) throw new Error(`블록 키 형식이 아님: ${key}`);
  const [, letters, n1, n2] = m;
  const tail = n2 ? `-${n2}` : "";
  switch (style) {
    case "korean":
      return `${letters}${n1}${tail}블록`;
    case "hyphenBl":
      return `${letters}-${n1}${tail}BL`;
    case "lowerSpaced":
      return `${letters!.toLowerCase()} ${n1}${tail} bl`;
  }
}
