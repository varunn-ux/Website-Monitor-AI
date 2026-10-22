-- ONE-TIME SETUP AND SAFE UPGRADES
-- Supabase Dashboard -> SQL Editor -> New query -> paste this complete file -> Run.
-- This single idempotent script supports fresh projects and upgrades existing data.
-- It creates the tables used for scan history, issue tracking, monitored sites,
-- and scheduled-run deduplication.
-- The app accesses it only from server routes using SUPABASE_SERVICE_ROLE_KEY.
-- Never put the service-role/secret key in a NEXT_PUBLIC_* variable.

create table if not exists public.website_scans (
  id text primary key,
  checked_at timestamptz not null,
  site_url text not null,
  site_host text not null,
  overall_status text not null check (overall_status in ('healthy', 'issues', 'down')),
  result jsonb not null
);

alter table public.website_scans add column if not exists site_host text;
update public.website_scans
set site_host = lower(regexp_replace(split_part(split_part(regexp_replace(site_url, '^https?://', '', 'i'), '/', 1), '?', 1), '^www\.', ''))
where site_host is null;
alter table public.website_scans alter column site_host set not null;

create index if not exists website_scans_checked_at_idx
  on public.website_scans (checked_at desc);

create index if not exists website_scans_site_url_checked_idx
  on public.website_scans (site_url, checked_at desc);

create index if not exists website_scans_site_host_checked_idx
  on public.website_scans (site_host, checked_at desc);

alter table public.website_scans enable row level security;

-- No anon/authenticated policies are created deliberately.
-- Server-side secret/service-role credentials bypass RLS. Do not expose that key to browsers.


-- ISSUE WORKFLOW (Phase 3)
-- Stores issue status, owner and team notes across scans for each website hostname.
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
-- No public policies: all issue workflow writes run through authenticated server routes.

-- MONITORED WEBSITES (Phase 4A)
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

-- Safe upgrade for databases that already have monitored_sites.
alter table public.monitored_sites add column if not exists claimed_at timestamptz;
alter table public.monitored_sites add column if not exists last_attempted_at timestamptz;
update public.monitored_sites set check_interval_minutes = 1440 where check_interval_minutes < 1440;
alter table public.monitored_sites drop constraint if exists monitored_sites_check_interval_minutes_check;
alter table public.monitored_sites add constraint monitored_sites_check_interval_minutes_check check (check_interval_minutes >= 1440);

alter table public.monitored_sites enable row level security;

-- Idempotency key for the fallback daily SITE_URL scan when no monitored sites exist.
create table if not exists public.cron_scan_runs (
  run_key text primary key,
  run_date date not null,
  site_host text not null,
  claimed_at timestamptz not null default now()
);
create index if not exists cron_scan_runs_site_date_idx
  on public.cron_scan_runs (site_host, run_date desc);
alter table public.cron_scan_runs enable row level security;

-- ADDITIVE SCHEDULE CLAIM LEASE
-- last_checked_at records completed checks; claimed_at prevents concurrent cron runs
-- and expires after 15 minutes in application code so interrupted attempts can retry.
create index if not exists monitored_sites_claimed_at_idx
  on public.monitored_sites (claimed_at) where claimed_at is not null;
create index if not exists monitored_sites_schedule_idx
  on public.monitored_sites (is_active, last_attempted_at, last_checked_at, created_at);

-- EMAIL NOTIFICATION AUDIT
-- "accepted" means Resend accepted the API request, not that the recipient received it.
create table if not exists public.email_notification_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  scan_id text,
  site_url text not null,
  site_host text not null,
  notification_type text not null check (notification_type in ('manual-alert', 'scheduled-digest', 'quiet-mode', 'test')),
  trigger_reason text not null,
  status text not null check (status in ('pending', 'accepted', 'failed', 'skipped')),
  provider_message_id text,
  error_reason text,
  created_at timestamptz not null default now()
);
alter table public.email_notification_events drop constraint if exists email_notification_events_status_check;
alter table public.email_notification_events
  add constraint email_notification_events_status_check
  check (status in ('pending', 'accepted', 'failed', 'skipped'));
create index if not exists email_notification_events_site_created_idx
  on public.email_notification_events (site_host, created_at desc);
create index if not exists email_notification_events_created_idx
  on public.email_notification_events (created_at desc);
alter table public.email_notification_events enable row level security;
