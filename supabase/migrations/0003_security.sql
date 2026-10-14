-- U1: 접근 차단 (BR-U1-18, P-S1, NFR-U1-13)
-- 모든 테이블 RLS를 켜고 정책을 만들지 않는다 → anon·authenticated는 아무 행도 볼 수 없다.
-- 여기에 더해 권한 자체도 회수한다. 접근은 service_role(서버 전용 키)만.

do $$
declare
  t text;
begin
  foreach t in array array[
    'districts', 'supply_type_standards', 'income_asset_thresholds',
    'notices', 'source_notices', 'notice_districts', 'housing_units',
    'devices', 'device_profiles', 'push_subscriptions',
    'judgements', 'notification_log', 'collect_runs'
  ] loop
    -- force는 쓰지 않는다: pg_cron 정리 작업은 테이블 소유자(postgres)로 실행되며 RLS를 우회해야 한다
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- 이후 만들어지는 객체에도 기본 권한을 주지 않는다
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
