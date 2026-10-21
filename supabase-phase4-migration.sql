-- Safe additive upgrade for existing Phase 3 databases.
-- Run in Supabase Dashboard -> SQL Editor. Existing scan and issue data is preserved.

alter table public.website_scans add column if not exists site_host text;
update public.website_scans
set site_host = lower(regexp_replace(split_part(split_part(regexp_replace(site_url, '^https?://', '', 'i'), '/', 1), '?', 1), '^www\.', ''))
where site_host is null;
alter table public.website_scans alter column site_host set not null;
create index if not exists website_scans_site_host_checked_idx
  on public.website_scans (site_host, checked_at desc);

create table if not exists public.website_issue_tracking (
  id uuid primary key default gen_random_uuid(),
  site_host text not null,
  issue_key text not null,
  issue_title text not null,
  category text not null check (category in ('availability', 'links', 'seo', 'performance', 'accessibility', 'best-practices')),
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  url text not null default '',
  status text not null default 'open' check (status in ('open', 'in_progress', 'fixed', 'ignored')),
  owner text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_host, issue_key)
);
create index if not exists website_issue_tracking_site_status_idx
  on public.website_issue_tracking (site_host, status);
create index if not exists website_issue_tracking_updated_at_idx
  on public.website_issue_tracking (updated_at desc);
alter table public.website_issue_tracking enable row level security;

create table if not exists public.monitored_sites (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  name text not null default '',
  is_active boolean not null default true,
  crawl_limit integer not null default 30 check (crawl_limit between 10 and 500),
  check_interval_minutes integer not null default 1440 check (check_interval_minutes >= 1440),
  alert_email text not null default '',
  last_status text not null default 'unknown' check (last_status in ('healthy', 'issues', 'down', 'unknown')),
  last_status_code integer,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists monitored_sites_active_checked_idx
  on public.monitored_sites (is_active, last_checked_at, created_at);

-- Vercel Hobby executes the configured cron once daily. Preserve records while
-- correcting unsupported historical sub-daily settings to the supported daily interval.
update public.monitored_sites set check_interval_minutes = 1440 where check_interval_minutes < 1440;
alter table public.monitored_sites drop constraint if exists monitored_sites_check_interval_minutes_check;
alter table public.monitored_sites add constraint monitored_sites_check_interval_minutes_check check (check_interval_minutes >= 1440);
alter table public.monitored_sites enable row level security;
-- No anon policies created: all operations run server-side with SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.cron_scan_runs (
  run_key text primary key,
  run_date date not null,
  site_host text not null,
  claimed_at timestamptz not null default now()
);
create index if not exists cron_scan_runs_site_date_idx
  on public.cron_scan_runs (site_host, run_date desc);
alter table public.cron_scan_runs enable row level security;
