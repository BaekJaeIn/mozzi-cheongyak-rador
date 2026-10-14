// 도메인 객체 ↔ DB 행 변환 (계약 K2). 모든 쌍은 fromRow(toRow(x)) = x 를 만족해야 한다 (PBT-02).
import type {
  Device,
  DeviceRow,
  District,
  DistrictRow,
  HousingUnit,
  HousingUnitRow,
  Judgement,
  JudgementRow,
  Notice,
  NoticeRow,
  PushSubscriptionRecord,
  PushSubscriptionRow,
  StoredProfile,
  StoredProfileRow,
} from "./types.ts";

const iso = (d: Date): string => d.toISOString();
const isoOrNull = (d: Date | null): string | null => (d === null ? null : d.toISOString());
const date = (s: string): Date => new Date(s);
const dateOrNull = (s: string | null): Date | null => (s === null ? null : new Date(s));

export const districtMapper = {
  toRow: (d: District): DistrictRow => ({
    id: d.id,
    name: d.name,
    sido: d.sido,
    sigungu: [...d.sigungu],
    keywords: [...d.keywords],
    active: d.active,
    sort_order: d.sortOrder,
  }),
  fromRow: (r: DistrictRow): District => ({
    id: r.id,
    name: r.name,
    sido: r.sido,
    sigungu: [...r.sigungu],
    keywords: [...r.keywords],
    active: r.active,
    sortOrder: r.sort_order,
  }),
};

export const deviceMapper = {
  toRow: (d: Device): DeviceRow => ({
    id: d.id,
    token_hash: d.tokenHash,
    notify_hour: d.notifyHour,
    notify_enabled: d.notifyEnabled,
    created_at: iso(d.createdAt),
    last_seen_at: iso(d.lastSeenAt),
  }),
  fromRow: (r: DeviceRow): Device => ({
    id: r.id,
    tokenHash: r.token_hash,
    notifyHour: r.notify_hour,
    notifyEnabled: r.notify_enabled,
    createdAt: date(r.created_at),
    lastSeenAt: date(r.last_seen_at),
  }),
};

export const storedProfileMapper = {
  toRow: (p: StoredProfile): StoredProfileRow => ({
    device_id: p.deviceId,
    schema_version: p.schemaVersion,
    data: p.data,
    enc_monthly_income: p.encMonthlyIncome,
    enc_total_asset: p.encTotalAsset,
    enc_car_value: p.encCarValue,
    profile_version: p.profileVersion,
    updated_at: iso(p.updatedAt),
  }),
  fromRow: (r: StoredProfileRow): StoredProfile => ({
    deviceId: r.device_id,
    schemaVersion: r.schema_version,
    data: r.data,
    encMonthlyIncome: r.enc_monthly_income,
    encTotalAsset: r.enc_total_asset,
    encCarValue: r.enc_car_value,
    profileVersion: r.profile_version,
    updatedAt: date(r.updated_at),
  }),
};

export const noticeMapper = {
  toRow: (n: Notice): NoticeRow => ({
    id: n.id,
    dedup_key: n.dedupKey,
    title: n.title,
    complex_name: n.complexName,
    location: n.location,
    sido: n.sido,
    sigungu: n.sigungu,
    provider: n.provider,
    primary_source: n.primarySource,
    tenure: n.tenure,
    announced_at: n.announcedAt,
    apply_start: n.applyStart,
    apply_end: n.applyEnd,
    result_at: n.resultAt,
    contract_start: n.contractStart,
    contract_end: n.contractEnd,
    summary: n.summary,
    summary_status: n.summaryStatus,
    first_seen_at: iso(n.firstSeenAt),
    updated_at: iso(n.updatedAt),
  }),
  fromRow: (r: NoticeRow): Notice => ({
    id: r.id,
    dedupKey: r.dedup_key,
    title: r.title,
    complexName: r.complex_name,
    location: r.location,
    sido: r.sido,
    sigungu: r.sigungu,
    provider: r.provider,
    primarySource: r.primary_source,
    tenure: r.tenure,
    announcedAt: r.announced_at,
    applyStart: r.apply_start,
    applyEnd: r.apply_end,
    resultAt: r.result_at,
    contractStart: r.contract_start,
    contractEnd: r.contract_end,
    summary: r.summary,
    summaryStatus: r.summary_status,
    firstSeenAt: date(r.first_seen_at),
    updatedAt: date(r.updated_at),
  }),
};

export const housingUnitMapper = {
  toRow: (u: HousingUnit): HousingUnitRow => ({
    id: u.id,
    notice_id: u.noticeId,
    label: u.label,
    supply_type: u.supplyType,
    exclusive_area_m2: u.exclusiveAreaM2,
    supply_count: u.supplyCount,
    standard_requirements: u.standardRequirements,
    extracted_requirements: u.extractedRequirements,
    requirements: u.requirements,
  }),
  fromRow: (r: HousingUnitRow): HousingUnit => ({
    id: r.id,
    noticeId: r.notice_id,
    label: r.label,
    supplyType: r.supply_type,
    exclusiveAreaM2: r.exclusive_area_m2,
    supplyCount: r.supply_count,
    standardRequirements: r.standard_requirements,
    extractedRequirements: r.extracted_requirements,
    requirements: r.requirements,
  }),
};

export const pushSubscriptionMapper = {
  toRow: (s: PushSubscriptionRecord): PushSubscriptionRow => ({
    endpoint: s.endpoint,
    device_id: s.deviceId,
    p256dh: s.p256dh,
    auth: s.auth,
    created_at: iso(s.createdAt),
    last_success_at: isoOrNull(s.lastSuccessAt),
  }),
  fromRow: (r: PushSubscriptionRow): PushSubscriptionRecord => ({
    endpoint: r.endpoint,
    deviceId: r.device_id,
    p256dh: r.p256dh,
    auth: r.auth,
    createdAt: date(r.created_at),
    lastSuccessAt: dateOrNull(r.last_success_at),
  }),
};

export const judgementMapper = {
  toRow: (j: Judgement): JudgementRow => ({
    device_id: j.deviceId,
    notice_id: j.noticeId,
    verdict: j.verdict,
    in_district: j.inDistrict,
    score: j.score,
    detail: j.detail,
    profile_version: j.profileVersion,
    computed_at: iso(j.computedAt),
  }),
  fromRow: (r: JudgementRow): Judgement => ({
    deviceId: r.device_id,
    noticeId: r.notice_id,
    verdict: r.verdict,
    inDistrict: r.in_district,
    score: r.score,
    detail: r.detail,
    profileVersion: r.profile_version,
    computedAt: date(r.computed_at),
  }),
};
