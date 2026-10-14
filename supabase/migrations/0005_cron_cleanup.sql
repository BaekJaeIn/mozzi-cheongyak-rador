-- U1: 일일 정리 작업 (BR-U1-13~15, P-R3·P-R4, infrastructure-design.md §4)
-- pg_cron 시각은 UTC. 기기·공고 정리를 따로 등록해 실패를 격리하고, 결과를 collect_runs에 남긴다.

create or replace function public.run_cleanup_devices()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_started timestamptz := now();
  v_count integer;
begin
  v_count := public.cleanup_expired_devices(now() - interval '180 days');
  insert into public.collect_runs (source, ok, deleted_count, started_at, finished_at)
  values ('cleanup_devices', true, v_count, v_started, now());
exception when others then
  insert into public.collect_runs (source, ok, error, started_at, finished_at)
  values ('cleanup_devices', false, sqlerrm, v_started, now());
end;
$$;

create or replace function public.run_cleanup_notices()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_started timestamptz := now();
  v_count integer;
begin
  -- 한국 날짜 기준 오늘 - 365일 (TS isNoticeExpired와 같은 경계)
  v_count := public.cleanup_expired_notices((now() at time zone 'Asia/Seoul')::date - 365);
  insert into public.collect_runs (source, ok, deleted_count, started_at, finished_at)
  values ('cleanup_notices', true, v_count, v_started, now());
exception when others then
  insert into public.collect_runs (source, ok, error, started_at, finished_at)
  values ('cleanup_notices', false, sqlerrm, v_started, now());
end;
$$;

revoke all on function public.run_cleanup_devices() from public, anon, authenticated;
revoke all on function public.run_cleanup_notices() from public, anon, authenticated;
grant execute on function public.run_cleanup_devices() to service_role;
grant execute on function public.run_cleanup_notices() to service_role;

-- 재실행 안전: 같은 이름이 있으면 지우고 다시 등록
select cron.unschedule('cleanup-devices') where exists (select 1 from cron.job where jobname = 'cleanup-devices');
select cron.unschedule('cleanup-notices') where exists (select 1 from cron.job where jobname = 'cleanup-notices');

-- 매일 KST 04:00 = UTC 19:00
select cron.schedule('cleanup-devices', '0 19 * * *', $$select public.run_cleanup_devices()$$);
-- 매일 KST 04:05 = UTC 19:05
select cron.schedule('cleanup-notices', '5 19 * * *', $$select public.run_cleanup_notices()$$);
