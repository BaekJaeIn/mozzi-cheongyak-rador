-- U1: 확장 기능 (infrastructure-design.md §3)
-- pgcrypto: gen_random_uuid / pg_cron: 일일 정리(U1), 수집·발송 호출(U3·U6)
-- pg_net: cron에서 Edge Function HTTP 호출(U3·U6) / supabase_vault: cron용 URL·키 보관(U3·U6)
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;
