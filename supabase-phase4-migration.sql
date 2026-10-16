-- Phase 4A: Multi-Website Monitoring
-- In Supabase Dashboard -> SQL Editor -> New Query -> paste and run this script.
-- Existing tables and data are preserved.

create table if not exists public.monitored_sites (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  name text not null default '',
  is_active boolean not null default true,
  crawl_limit integer not null default 30 check (crawl_limit between 10 and 500),
  check_interval_minutes integer not null default 60 check (check_interval_minutes >= 5),
  alert_email text not null default '',
  last_status text not null default 'unknown' check (last_status in ('healthy', 'issues', 'down', 'unknown')),
  last_status_code integer,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists monitored_sites_active_checked_idx
  on public.monitored_sites (is_active, last_checked_at);

alter table public.monitored_sites enable row level security;
-- No anon policies created: all operations run server-side with SUPABASE_SERVICE_ROLE_KEY.

