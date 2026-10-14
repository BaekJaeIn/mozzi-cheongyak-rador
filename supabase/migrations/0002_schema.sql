-- U1: 전체 테이블 구조 (domain-entities.md E1~E13, 계약 K1)
-- 값(시드)은 U2. 단, housing_units.supply_type 외래 키 때문에 'other' 공급유형 1건만 여기서 넣는다.

-- ---------- 공고 영역 ----------

create table if not exists public.districts (
  id          text primary key,
  name        text not null,
  sido        text not null,
  sigungu     text[] not null check (cardinality(sigungu) >= 1),
  keywords    text[] not null check (cardinality(keywords) >= 1),
  active      boolean not null default true,
  sort_order  integer not null default 0
);

create table if not exists public.supply_type_standards (
  code            text primary key,
  formal_label    text not null,
  plain_label     text not null,
  tenure          text not null check (tenure in ('sale', 'rent')),
  requirements    jsonb not null default '{}'::jsonb,
  effective_from  date not null default current_date
);

insert into public.supply_type_standards (code, formal_label, plain_label, tenure, requirements)
values ('other', '기타 공급', '기타', 'rent', '{}'::jsonb)
on conflict (code) do nothing;

create table if not exists public.income_asset_thresholds (
  year            integer not null check (year between 2000 and 2100),
  kind            text not null check (kind in ('monthly_income', 'total_asset', 'car_value')),
  household_size  integer not null check (household_size >= 0),
  basis           text not null,
  amount_manwon   integer not null check (amount_manwon >= 0),
  primary key (year, kind, household_size, basis)
);

create table if not exists public.notices (
  id              uuid primary key default gen_random_uuid(),
  dedup_key       text not null unique,
  title           text not null,
  complex_name    text,
  location        text,
  sido            text,
  sigungu         text,
  provider        text not null,
  primary_source  text not null check (primary_source in ('applyhome', 'lh_rental', 'myhome_complex', 'sh', 'gh')),
  tenure          text not null check (tenure in ('sale', 'rent')),
  announced_at    date,
  apply_start     date,
  apply_end       date,
  result_at       date,
  contract_start  date,
  contract_end    date,
  summary         jsonb,
  summary_status  text not null default 'pending' check (summary_status in ('pending', 'done', 'failed')),
  first_seen_at   timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists notices_apply_end_idx on public.notices (apply_end);
create index if not exists notices_first_seen_at_idx on public.notices (first_seen_at);

create table if not exists public.source_notices (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in ('applyhome', 'lh_rental', 'myhome_complex', 'sh', 'gh')),
  source_notice_no  text not null,
  notice_id         uuid not null references public.notices (id) on delete cascade,
  original_url      text not null,
  raw               jsonb,
  content_hash      text not null,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  unique (source, source_notice_no)
);
create index if not exists source_notices_notice_id_idx on public.source_notices (notice_id);

create table if not exists public.notice_districts (
  notice_id    uuid not null references public.notices (id) on delete cascade,
  district_id  text not null references public.districts (id) on delete cascade,
  primary key (notice_id, district_id)
);
create index if not exists notice_districts_district_id_idx on public.notice_districts (district_id);

create table if not exists public.housing_units (
  id                      uuid primary key default gen_random_uuid(),
  notice_id               uuid not null references public.notices (id) on delete cascade,
  label                   text,
  supply_type             text not null references public.supply_type_standards (code),
  exclusive_area_m2       numeric(7, 2) check (exclusive_area_m2 >= 0),
  supply_count            integer check (supply_count >= 0),
  standard_requirements   jsonb,
  extracted_requirements  jsonb,
  requirements            jsonb not null default '{}'::jsonb
);
create index if not exists housing_units_notice_id_idx on public.housing_units (notice_id);

-- ---------- 기기 영역 ----------

create table if not exists public.devices (
  id              uuid primary key,
  token_hash      text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  notify_hour     smallint not null default 9 check (notify_hour between 0 and 23),
  notify_enabled  boolean not null default true,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);
create index if not exists devices_created_at_idx on public.devices (created_at);
create index if not exists devices_last_seen_at_idx on public.devices (last_seen_at);
create index if not exists devices_notify_hour_idx on public.devices (notify_hour) where notify_enabled;

create table if not exists public.device_profiles (
  device_id           uuid primary key references public.devices (id) on delete cascade,
  schema_version      integer not null check (schema_version >= 1),
  data                jsonb not null,
  enc_monthly_income  text,
  enc_total_asset     text,
  enc_car_value       text,
  profile_version     integer not null default 1 check (profile_version >= 1),
  updated_at          timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint         text primary key,
  device_id        uuid not null references public.devices (id) on delete cascade,
  p256dh           text not null,
  auth             text not null,
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz
);
create index if not exists push_subscriptions_device_id_idx on public.push_subscriptions (device_id);

create table if not exists public.judgements (
  device_id        uuid not null references public.devices (id) on delete cascade,
  notice_id        uuid not null references public.notices (id) on delete cascade,
  verdict          text not null check (verdict in ('eligible', 'ineligible', 'unknown')),
  in_district      boolean not null,
  score            numeric,
  detail           jsonb not null,
  profile_version  integer not null,
  computed_at      timestamptz not null default now(),
  primary key (device_id, notice_id)
);
create index if not exists judgements_notice_id_idx on public.judgements (notice_id);

create table if not exists public.notification_log (
  device_id    uuid not null references public.devices (id) on delete cascade,
  notice_id    uuid not null references public.notices (id) on delete cascade,
  notified_at  timestamptz not null default now(),
  primary key (device_id, notice_id)
);

create table if not exists public.collect_runs (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null default gen_random_uuid(),
  source          text not null check (source in (
                    'applyhome', 'lh_rental', 'myhome_complex', 'sh', 'gh', 'all',
                    'cleanup_devices', 'cleanup_notices', 'dispatch')),
  ok              boolean not null,
  fetched_count   integer not null default 0,
  upserted_count  integer not null default 0,
  deleted_count   integer not null default 0,
  warning         text,
  error           text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists collect_runs_started_at_idx on public.collect_runs (started_at desc);
