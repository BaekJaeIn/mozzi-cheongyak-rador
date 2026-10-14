// 지구 목록·공급유형 라벨 캐시 (서버 인스턴스마다 10분)
import "server-only";
import { getDb } from "../db/client";
import { createReferenceRepository } from "../db/reference-repository";
import { createTtlCache } from "./ttl-cache";

const reference = () => createReferenceRepository(getDb());

export const districtsCache = createTtlCache(() => reference().listDistricts());
export const supplyTypeLabelsCache = createTtlCache(() => reference().listSupplyTypeLabels());
