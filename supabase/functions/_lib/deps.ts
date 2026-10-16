// collect·analyze·dispatch 공통 조립 (CG-1): 환경 변수 → DB·저장소·재계산·Collector·PDF·Gemini
import {
  applyhomeCollector,
  ghCollector,
  lhCollector,
  mockCollectorSet,
  mockExtractor,
  mockPdfFetcher,
} from "../_shared/collect/collectors.ts";
import type { Clock, Collector, Extractor, PdfFetcher, Recomputer } from "../_shared/collect/ports.ts";
import type { Logger } from "../_shared/log/logger.ts";
import { createKeyring, type Keyring } from "../_shared/security/amount-cipher.ts";
import { createJudgementService } from "../_shared/services/judgement-service.ts";
import { createCollectRepository } from "./db/collect-repository.ts";
import { createDb } from "./db/client.ts";
import {
  createJudgementRepository,
  createNoticeRepository,
  createProfileRepository,
  createReferenceRepository,
} from "./db/repositories.ts";
import type { FunctionEnv } from "./env.ts";
import { createGeminiExtractor } from "./gemini.ts";
import { createPdfFetcher, getText } from "./http.ts";

export const systemClock: Clock = { now: () => new Date(), nowMs: () => Date.now() };

export function createPipeline(env: FunctionEnv, log: Logger) {
  const db = createDb(env.supabaseUrl, env.serviceRoleKey);
  let keyring: Promise<Keyring> | null = null;
  const judgement = createJudgementService({
    profiles: createProfileRepository(db),
    notices: createNoticeRepository(db),
    reference: createReferenceRepository(db),
    judgements: createJudgementRepository(db),
    keyring: () => (keyring ??= createKeyring(env.amountEncKeys, env.amountEncKeyCurrent)),
    log,
  });
  const recomputer: Recomputer = { recomputeAll: (asOf) => judgement.recomputeAll(asOf) };

  function collectors(): Collector[] {
    if (env.mock) return mockCollectorSet();
    const deps = { http: { getText }, nowMs: systemClock.nowMs };
    const list: Collector[] = [];
    if (env.dataGoKrKey) list.push(applyhomeCollector(env.dataGoKrKey, deps), lhCollector(env.dataGoKrKey, deps));
    else log.warn("DATA_GO_KR_API_KEY 없음 — 청약홈·LH 건너뜀");
    list.push(ghCollector(deps));
    return list;
  }

  /** Gemini 키가 없으면 null (analyze는 아무것도 예약하지 않는다) */
  function ai(): { pdf: PdfFetcher; extractor: Extractor } | null {
    if (env.mock) return { pdf: mockPdfFetcher, extractor: mockExtractor };
    if (!env.geminiKey) return null;
    return { pdf: createPdfFetcher(), extractor: createGeminiExtractor(env.geminiKey, env.geminiModel) };
  }

  /** U6 dispatch: 오래된 판정만 그 기기에서 다시 계산 (BR-U6-04) */
  const recomputeDevice = (deviceId: string, asOf: string) => judgement.recomputeForDevice(deviceId, asOf);

  return { repo: createCollectRepository(db), recomputer, collectors, ai, db, recomputeDevice };
}
