-- U6: 알림 발송·구독 (logical-components §3, nfr-design P-1·2·6·7·8·9, BR-U6-10~13·20~24·50~55·66)
-- 재실행 안전: if not exists / create or replace / cron 이름 지우고 다시 등록

-- ---------- 칸 ----------
alter table public.devices add column if not exists last_push_on date;
alter table public.devices add column if not exists push_baseline_at timestamptz;
alter table public.notification_log add column if not exists kind text not null default 'sent';
alter table public.notification_log drop constraint if exists notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check check (kind in ('sent', 'baseline'));
alter table public.push_subscriptions add column if not exists failing_since timestamptz;
create index if not exists devices_dispatch_idx on public.devices (notify_hour, last_push_on) where notify_enabled;

-- ---------- 표 ----------
create table if not exists public.push_test_log (
  device_id  uuid not null references public.devices (id) on delete cascade,
  sent_at    timestamptz not null default now()
);
create index if not exists push_test_log_device_idx on public.push_test_log (device_id, sent_at desc);

create table if not exists public.dispatch_runs (
  id                     uuid primary key default gen_random_uuid(),
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  hour                   smallint not null check (hour between 0 and 23),
  devices                integer not null default 0,
  sent                   integer not null default 0,
  skipped_empty          integer not null default 0,
  skipped_claimed        integer not null default 0,
  skipped_budget         integer not null default 0,
  failed                 integer not null default 0,
  removed_subscriptions  integer not null default 0,
  recomputed             integer not null default 0,
  time_budget_exceeded   boolean not null default false,
  error                  text
);
create index if not exists dispatch_runs_started_at_idx on public.dispatch_runs (started_at desc);

alter table public.push_test_log enable row level security;
alter table public.dispatch_runs enable row level security;
revoke all on public.push_test_log, public.dispatch_runs from anon, authenticated;

-- ---------- 대상 기기 + 구독 (P-9 ①) ----------
create or replace function public.dispatch_candidates(p_hour integer, p_today date)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(c order by c ->> 'device_id'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'device_id', d.id,
      'profile_version', p.profile_version,
      'subscriptions', jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth) order by s.created_at)
    ) as c
    from public.devices d
    join public.push_subscriptions s on s.device_id = d.id
    left join public.device_profiles p on p.device_id = d.id
    where d.notify_enabled
      and d.notify_hour = p_hour
      and d.last_push_on is distinct from p_today
    group by d.id, p.profile_version
  ) x;
$$;

-- ---------- 기기 묶음의 판정(1차 거름)·알림 기록·통계 (P-9 ②) ----------
-- 최종 노출은 TS isVisible이 정한다(피드와 같은 코드). 여기서는 미충족·지구 밖·마감을 먼저 거른다.
create or replace function public.dispatch_device_rows(p_device_ids uuid[], p_today date)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(dev::text, jsonb_build_object(
    'rows', coalesce(r.rows, '[]'::jsonb),
    'notified', coalesce(l.ids, '[]'::jsonb),
    'count', coalesce(st.cnt, 0),
    'min_version', st.minv
  )), '{}'::jsonb)
  from unnest(p_device_ids) as dev
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'verdict', j.verdict,
      'in_district', j.in_district,
      'score', j.score,
      'detail', j.detail,
      'notice', jsonb_build_object(
        'id', n.id, 'title', n.title, 'complex_name', n.complex_name, 'tenure', n.tenure,
        'apply_start', n.apply_start, 'apply_end', n.apply_end, 'first_seen_at', n.first_seen_at),
      'districts', coalesce((
        select jsonb_agg(jsonb_build_object('id', ds.id, 'name', ds.name, 'sort_order', ds.sort_order))
        from public.notice_districts nd join public.districts ds on ds.id = nd.district_id
        where nd.notice_id = n.id), '[]'::jsonb)
    )) as rows
    from public.judgements j
    join public.notices n on n.id = j.notice_id
    where j.device_id = dev
      and j.verdict <> 'ineligible'
      and j.in_district
      and (n.apply_end is null or n.apply_end >= p_today)
  ) r on true
  left join lateral (
    select jsonb_agg(nl.notice_id) as ids from public.notification_log nl where nl.device_id = dev
  ) l on true
  left join lateral (
    select count(*)::int as cnt, min(j.profile_version) as minv from public.judgements j where j.device_id = dev
  ) st on true;
$$;

-- ---------- 하루 몫 잡기·되돌리기 (P-1) ----------
create or replace function public.claim_daily_push(p_device uuid, p_today date)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_prev date;
begin
  select last_push_on into v_prev from public.devices where id = p_device for update;
  if not found or v_prev is not distinct from p_today then
    return jsonb_build_object('claimed', false);
  end if;
  update public.devices set last_push_on = p_today where id = p_device;
  return jsonb_build_object('claimed', true, 'previous', v_prev);
end;
$$;

-- 아직 오늘 값일 때만 되돌린다 (그 사이 다른 실행이 보냈으면 그대로)
create or replace function public.release_daily_push(p_device uuid, p_today date, p_previous date)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.devices set last_push_on = p_previous where id = p_device and last_push_on = p_today;
$$;

-- ---------- 보낸 직후 기록 (P-6·7) — 한 트랜잭션 ----------
create or replace function public.record_push_result(
  p_device uuid, p_notice_ids uuid[], p_success text[], p_failed text[], p_gone text[])
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- 기준선이 이미 있으면 그대로 둔다 (P-2)
  insert into public.notification_log (device_id, notice_id, kind)
  select p_device, x, 'sent' from unnest(coalesce(p_notice_ids, '{}')) as x
  where exists (select 1 from public.notices n where n.id = x)
  on conflict (device_id, notice_id) do nothing;

  update public.push_subscriptions set last_success_at = now(), failing_since = null
  where device_id = p_device and endpoint = any (coalesce(p_success, '{}'));

  update public.push_subscriptions set failing_since = coalesce(failing_since, now())
  where device_id = p_device and endpoint = any (coalesce(p_failed, '{}'));

  delete from public.push_subscriptions where device_id = p_device and endpoint = any (coalesce(p_gone, '{}'));
end;
$$;

-- ---------- 구독 저장 + 첫 구독 기준선 (BR-U6-10~13·53·54, P-8) ----------
-- p_baseline_ids: 지금 이 기기 피드에 보이는 공고 (TS가 피드와 같은 코드로 계산해 넘김)
create or replace function public.save_push_subscription(
  p_device uuid, p_endpoint text, p_p256dh text, p_auth text, p_baseline_ids uuid[])
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_baseline_at timestamptz;
  v_baselined boolean := false;
begin
  select push_baseline_at into v_baseline_at from public.devices where id = p_device for update;
  if not found then
    return jsonb_build_object('saved', false);
  end if;

  insert into public.push_subscriptions (endpoint, device_id, p256dh, auth)
  values (p_endpoint, p_device, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set device_id = excluded.device_id, p256dh = excluded.p256dh, auth = excluded.auth, failing_since = null;

  -- 기기당 5개 (오래된 것부터 지움)
  delete from public.push_subscriptions
  where device_id = p_device
    and endpoint in (
      select endpoint from public.push_subscriptions where device_id = p_device
      order by created_at desc, endpoint offset 5);

  if v_baseline_at is null then
    insert into public.notification_log (device_id, notice_id, kind)
    select p_device, x, 'baseline' from unnest(coalesce(p_baseline_ids, '{}')) as x
    where exists (select 1 from public.notices n where n.id = x)
    on conflict (device_id, notice_id) do nothing;
    update public.devices set push_baseline_at = now() where id = p_device;
    v_baselined := true;
  end if;
  return jsonb_build_object('saved', true, 'baselined', v_baselined);
end;
$$;

-- ---------- 시험 알림 한도: 최근 1시간 3번 (BR-U6-66) ----------
create or replace function public.try_test_push(p_device uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  perform 1 from public.devices where id = p_device for update;
  if not found then
    return false;
  end if;
  select count(*) into v_count from public.push_test_log
  where device_id = p_device and sent_at > now() - interval '1 hour';
  if v_count >= 3 then
    return false;
  end if;
  insert into public.push_test_log (device_id) values (p_device);
  return true;
end;
$$;

-- ---------- 매일 정리 (P-6, Q5=A 조정) ----------
-- 7일 넘게 **계속 실패한** 구독만 지운다 (보낼 일이 없던 구독은 failing_since가 비어 있어 남는다)
create or replace function public.run_cleanup_push()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_started timestamptz := now();
  v_subs integer;
  v_tests integer;
  v_runs integer;
begin
  delete from public.push_subscriptions where failing_since < now() - interval '7 days';
  get diagnostics v_subs = row_count;
  delete from public.push_test_log where sent_at < now() - interval '1 day';
  get diagnostics v_tests = row_count;
  delete from public.dispatch_runs where started_at < now() - interval '30 days';
  get diagnostics v_runs = row_count;
  insert into public.collect_runs (source, ok, deleted_count, warning, started_at, finished_at)
  values ('dispatch', true, v_subs + v_tests + v_runs,
          format('cleanup_push: 구독 %s, 시험 기록 %s, 발송 기록 %s', v_subs, v_tests, v_runs), v_started, now());
exception when others then
  insert into public.collect_runs (source, ok, error, started_at, finished_at)
  values ('dispatch', false, 'cleanup_push: ' || sqlerrm, v_started, now());
end;
$$;

-- ---------- 권한: service_role만 ----------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.dispatch_candidates(integer, date)',
    'public.dispatch_device_rows(uuid[], date)',
    'public.claim_daily_push(uuid, date)',
    'public.release_daily_push(uuid, date, date)',
    'public.record_push_result(uuid, uuid[], text[], text[], text[])',
    'public.save_push_subscription(uuid, text, text, text, uuid[])',
    'public.try_test_push(uuid)',
    'public.run_cleanup_push()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------- 예약 작업 (UTC) ----------
select cron.unschedule('dispatch-hourly') where exists (select 1 from cron.job where jobname = 'dispatch-hourly');
select cron.unschedule('cleanup-push') where exists (select 1 from cron.job where jobname = 'cleanup-push');

-- 매시 정각 (KST = UTC + 9, 서머타임 없음). Vault dispatch_url이 없으면 호출하지 않고 기록만 (U3)
select cron.schedule('dispatch-hourly', '0 * * * *', $$select public.invoke_edge_function('dispatch')$$);
-- 매일 KST 04:10 = UTC 19:10
select cron.schedule('cleanup-push', '10 19 * * *', $$select public.run_cleanup_push()$$);
