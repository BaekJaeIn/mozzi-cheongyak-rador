// HTML 공통 도우미 (cheongYak-radar parsers.ts에서 가져옴)

/** HTML → 공백 정규화된 평문 (script/style/주석 제거) */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtmlAttr(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** 상대 주소를 절대 주소로 (잘못된 주소면 null) */
export function absoluteUrl(href: string, base: string): string | null {
  try {
    return new URL(decodeHtmlAttr(href), base).toString();
  } catch {
    return null;
  }
}
