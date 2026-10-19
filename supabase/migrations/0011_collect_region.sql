-- 변경 2 운영 보완: GH·SH 크롤링 묶음을 서울 리전에서 실행 (2026-10-20)
-- 운영 프로젝트가 ap-south-1(뭄바이)라 pg_net 호출을 받은 Edge Function도 그 근처에서 실행된다.
-- 국내 공공기관 사이트(GH)는 해외 접속에 응답하지 않아 10-17~19 매일 "gh 시간 상한 초과"였다.
-- Supabase 지역 지정 호출(x-region 헤더)로 crawl 묶음만 ap-northeast-2(서울)에서 실행한다.
-- api 묶음(청약홈·LH 공공데이터 API)은 지금도 정상이라 그대로 둔다 (DB 왕복이 늘지 않게).

drop function if exists public.invoke_edge_function(text, jsonb);
create or replace function public.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb, p_region text default null)
returns bigint
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_secret text;
  v_headers jsonb;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = p_name || '_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    insert into public.collect_runs (source, ok, error, started_at, finished_at)
    values ('all', false, format('Vault 값 없음: %s_url 또는 cron_secret (%s 호출 안 함)', p_name, p_name), now(), now());
    return null;
  end if;
  v_headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret);
  if p_region is not null then
    v_headers := v_headers || jsonb_build_object('x-region', p_region);
  end if;
  return net.http_post(
    url := v_url,
    body := coalesce(p_body, '{}'::jsonb),
    headers := v_headers,
    timeout_milliseconds := 150000
  );
end;
$$;

revoke all on function public.invoke_edge_function(text, jsonb, text) from public, anon, authenticated, service_role;

-- KST 05:10 = UTC 20:10 — GH·SH, 서울에서 실행
select cron.unschedule('collect-crawl') where exists (select 1 from cron.job where jobname = 'collect-crawl');
select cron.schedule('collect-crawl', '10 20 * * *', $q$select public.invoke_edge_function('collect', '{"group":"crawl"}'::jsonb, 'ap-northeast-2')$q$);
