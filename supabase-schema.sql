-- ONE-TIME SETUP
-- Supabase Dashboard -> SQL Editor -> New query -> paste this complete file -> Run.
-- This creates the table used by Website Monitor AI to persist complete scan reports.
-- The app accesses it only from server routes using SUPABASE_SERVICE_ROLE_KEY.
-- Never put the service-role/secret key in a NEXT_PUBLIC_* variable.

create table if not exists public.website_scans (
  id text primary key,
  checked_at timestamptz not null,
  site_url text not null,
  overall_status text not null check (overall_status in ('healthy', 'issues', 'down')),
  result jsonb not null
);

create index if not exists website_scans_checked_at_idx
  on public.website_scans (checked_at desc);

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
