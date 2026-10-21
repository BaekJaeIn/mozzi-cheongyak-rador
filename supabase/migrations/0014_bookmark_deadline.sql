-- 변경 요청 3 (U6 BR-U6-D1~D42): 관심 공고 ID 서버 저장, 마감 임박 알림 (2026-10-20)
-- 재실행 안전: if not exists / create or replace
-- 마감 알림 기록은 기존 notification_log(기본키 기기 × 공고)를 바꾸지 않고 따로 둔다 — 새 공고 알림 기록·기준선 규칙(0008)이 그대로 남는다

-- ---------- 칸 ----------
alter table public.devices add column if not exists deadline_enabled boolean not null default true;

-- ---------- 표 ----------
create table if not exists public.device_bookmarks (
  device_id   uuid not null references public.devices (id) on delete cascade,
  notice_id   uuid not null references public.notices (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (device_id, notice_id)
);
create index if not exists device_bookmarks_notice_idx on public.device_bookmarks (notice_id);

create table if not exists public.deadline_notification_log (
  device_id    uuid not null references public.devices (id) on delete cascade,
  notice_id    uuid not null references public.notices (id) on delete cascade,
  notified_at  timestamptz not null default now(),
  primary key (device_id, notice_id)
);

-- 기기 인증 API·dispatch(서버 키)로만 (NFR-C3-5)
alter table public.device_bookmarks enable row level security;
alter table public.deadline_notification_log enable row level security;
revoke all on public.device_bookmarks, public.deadline_notification_log from anon, authenticated;

-- ---------- 관심 공고 바꾸기 (BR-U6-D1·D5): 기기 목록을 통째로, 없는 공고는 빼고, 100개까지 ----------
create or replace function public.replace_device_bookmarks(p_device uuid, p_ids uuid[])
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_count integer;
begin
  if not exists (select 1 from public.devices where id = p_device) then
    return 0;
  end if;
  select coalesce(array_agg(x), '{}') into v_ids
  from (
    select distinct x from unnest(coalesce(p_ids, '{}')) as x
    where exists (select 1 from public.notices n where n.id = x)
    limit 100
  ) t;
  delete from public.device_bookmarks where device_id = p_device and notice_id <> all (v_ids);
  insert into public.device_bookmarks (device_id, notice_id)
  select p_device, x from unnest(v_ids) as x
  on conflict (device_id, notice_id) do nothing;
  select count(*)::int into v_count from public.device_bookmarks where device_id = p_device;
  return v_count;
end;
$$;

-- ---------- 마감 임박 (BR-U6-D10~D12): 관심 공고 ∩ 마감 = 내일 − 마감 알림 기록, 스위치 켜짐 ----------
create or replace function public.dispatch_deadlines(p_device_ids uuid[], p_today date)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(x.device_id::text, x.items), '{}'::jsonb)
  from (
    select b.device_id,
           jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'complex_name', n.complex_name)
                     order by coalesce(n.complex_name, n.title), n.id) as items
    from public.device_bookmarks b
    join public.devices d on d.id = b.device_id and d.deadline_enabled
    join public.notices n on n.id = b.notice_id
    where b.device_id = any (p_device_ids)
      and n.apply_end = p_today + 1
      and not exists (select 1 from public.deadline_notification_log l where l.device_id = b.device_id and l.notice_id = b.notice_id)
    group by b.device_id
  ) x;
$$;

-- 보낸 직후 마감 알림 기록 (BR-U6-D22)
create or replace function public.record_deadline_push(p_device uuid, p_notice_ids uuid[])
returns void
language sql
set search_path = public, pg_temp
as $$
  insert into public.deadline_notification_log (device_id, notice_id)
  select p_device, x from unnest(coalesce(p_notice_ids, '{}')) as x
  where exists (select 1 from public.notices n where n.id = x)
  on conflict (device_id, notice_id) do nothing;
$$;

-- ---------- 권한: service_role만 ----------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.replace_device_bookmarks(uuid, uuid[])',
    'public.dispatch_deadlines(uuid[], date)',
    'public.record_deadline_push(uuid, uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
