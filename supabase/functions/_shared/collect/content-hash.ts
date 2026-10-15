// 변경 감지 해시 (BR-U3-50): 정규화한 내용만, raw·조회 시각은 넣지 않는다
import { bytesToHex } from "../encoding/base64url.ts";
import { SCHEDULE_KEYS, type Schedule, type Attachment } from "./types.ts";

export interface HashableNotice {
  title: string;
  location: string | null;
  supplyTypeText: string | null;
  schedule: Schedule;
  attachments: Attachment[];
}

export function contentHashInput(n: HashableNotice): string {
  return JSON.stringify([
    n.title,
    n.location,
    n.supplyTypeText,
    SCHEDULE_KEYS.map((k) => n.schedule[k]),
    n.attachments.map((a) => a.url).sort(),
  ]);
}

export async function contentHash(n: HashableNotice): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(contentHashInput(n)));
  return bytesToHex(new Uint8Array(digest));
}
