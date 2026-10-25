// 변경 감지 해시 (BR-U3-50): 정규화한 내용만, raw·조회 시각은 넣지 않는다
import { bytesToHex } from "../encoding/base64url.ts";
import { SCHEDULE_KEYS, type Schedule, type Attachment } from "./types.ts";

/** 정규화 판 — 지역·대상 계산 규칙이 바뀌면 올린다. 올리면 다음 수집에서 모든 공고가 다시 저장된다 (변경 4 BR-U3-E40) */
export const NORMALIZE_VERSION = 4;

export interface HashableNotice {
  title: string;
  location: string | null;
  supplyTypeText: string | null;
  schedule: Schedule;
  attachments: Attachment[];
  locationTexts?: readonly string[];
  hintTexts?: readonly string[];
}

export function contentHashInput(n: HashableNotice, version = NORMALIZE_VERSION): string {
  return JSON.stringify([
    version,
    n.title,
    n.location,
    n.supplyTypeText,
    SCHEDULE_KEYS.map((k) => n.schedule[k]),
    n.attachments.map((a) => a.url).sort(),
    [...(n.locationTexts ?? [])].sort(),
    [...(n.hintTexts ?? [])].sort(),
  ]);
}

export async function contentHash(n: HashableNotice): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(contentHashInput(n)));
  return bytesToHex(new Uint8Array(digest));
}
