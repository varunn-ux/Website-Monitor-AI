# Website Monitor AI — Complete Beginner-Friendly Project (Phase 1, 2 & 3)

A beginner-friendly monitoring dashboard for a website you own or are authorized to monitor. Built with Next.js App Router, TypeScript, Tailwind CSS, Cheerio, Google PageSpeed Insights, Gemini 3.8 Flash, Supabase Auth, Resend email alerts, and Supabase scan history.

## What is included in the complete release

- **Live timestamped scan activity:** view each server-side step as it happens, including homepage status, every inspected URL, SEO extraction, crawl progress, PageSpeed, AI analysis, and history saving.
- **Detailed issue explanations:** severity, affected URL, what was detected, why it matters, and a recommended fix.
- **More useful SEO inspection:** extracted title/description text, H1 text, canonical URL, and a capped list of image URLs missing alt attributes.
- **Lighthouse finding details:** captures failed audits from PageSpeed when the API provides them.
- **Gemini model update:** defaults to `gemini-3.8-flash` using the Google Gen AI SDK Interactions API.
- **Better Supabase diagnostics:** explains when credentials are missing, when the table is not yet created, and when the key appears invalid.
- **Persistent history:** one row per scan, with the full scan report stored in a `jsonb` column.
- **Phase 3 security:** Supabase Auth sign-in/sign-out and middleware protection for the dashboard and application APIs.
- **Critical alerts:** optional Resend email notification for new critical findings or a website-down transition.
- **Issue workflow:** persist Open / In progress / Fixed / Ignored status, owner/assignee, and team notes per issue.
- **Trend range controls:** display saved performance trends for 7 days, 30 days, 90 days, or all available scans.

## Scan any public website + view charts

- Enter a public website URL in **Website URL to scan**, then click **Scan this website**. The default value comes from `SITE_URL` in `.env.local`; if history exists, the most recently scanned website is preselected.
- Every scan is saved with its own `site_url`, so switching between websites does not mix their results. The previous-scan comparison and trend graphs only use scans from the same hostname.
- Choose a crawl limit (30, 50, 100, 250 or 500) and optionally enable sitemap discovery.
- The **Analytics & trends** section displays the current Lighthouse scores, issue counts by category and severity, score trends, and separate LCP / CLS / TBT trends. Values are taken from the selected scan and saved Supabase history, not hard-coded demo data.
- PDF and Excel exports include visual analytics as well as the underlying values. Excel opens on the Overview sheet and includes Analytics charts, separate Core Web Vitals charts, and a Score History data sheet with the exact values used by the trends.
- Public URL scanning uses server-side validation: HTTP/HTTPS only, no embedded credentials, private/local/reserved addresses blocked during URL and DNS checks, standard ports only, and same-site-only crawling/redirects. Only scan sites you own or are authorized to test. This validation is a defense-in-depth guard, not a replacement for authentication and rate-limiting before public deployment.

## Requirements

- Node.js 20.9+ (Node 22 recommended)
- A public website that you own/manage or have permission to monitor
- Gemini API key (optional but recommended): https://aistudio.google.com/apikey
- PageSpeed Insights API key (optional but recommended): https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com
- Supabase project (optional; required for history that persists between visits and scheduled runs)

## Install locally

Unzip the project, open a terminal in the `website-monitoring-agent` folder, then run:

```bash
npm install
```

Create `.env.local` from the example:

```powershell
Copy-Item .env.example .env.local
```

On macOS/Linux, use `cp .env.example .env.local`.

Edit `.env.local` with your own credentials. A starting example:

```env
SITE_URL=https://lnct.ac.in
GEMINI_API_KEY=your_new_gemini_api_key
GEMINI_MODEL=gemini-3.8-flash
PAGESPEED_API_KEY=your_pagespeed_api_key
CRON_SECRET=your_long_random_secret
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_server_side_secret_key
DASHBOARD_ALLOWED_EMAILS=admin@example.com,webteam@example.com
RESEND_API_KEY=
ALERT_EMAIL_TO=
ALERT_EMAIL_FROM="Website Monitor AI <alerts@your-verified-domain.com>"
```

**Environment-file rules:** no trailing backslashes; no `/rest/v1/` at the end of the Supabase URL; no quotes are normally required. The service-role/secret key must stay server-side and must never be named `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.

Run the app:

```bash
npm run dev
```

Then visit http://localhost:3000.

## Configure Supabase history (one-time manual database setup)

Setting the URL and secret key alone does **not** create a database table. The Supabase REST/Data API is for reading/writing existing tables; the app cannot create a table merely from its project URL and API key. Run the supplied SQL file once:

1. Open https://supabase.com/dashboard and select the same project used in `.env.local`.
2. In the left navigation, open **SQL Editor** and choose **New query**.
3. Open `supabase-schema.sql` from this project and copy the entire file into the SQL Editor.
4. Click **Run**. Confirm there is a `public.website_scans` table under **Table Editor**.
5. In **Project Settings → API Keys**, copy the project URL and the server-side secret key (`sb_secret_...`) or legacy `service_role` key. Use a key from the same project.
6. Set those values in `.env.local`, save the file, stop the dev server with `Ctrl + C`, and start it again using `npm run dev`.
7. Open the dashboard and run a fresh scan. The history status should report that the table is ready and the new report should appear under **Recent scan history**.

If you just created the table and Supabase says it cannot find it in the schema cache, refresh/reload the dashboard and retry. If the warning remains, check the table is exactly `public.website_scans` and that the API key belongs to the same project as the URL.

> Important: credentials shared in chat, screenshots, source code, or a public repository should be rotated. Do not commit `.env.local` to GitHub.

## During a scan

Click **Run scan**. The Live scan activity panel prints timestamped updates as the server executes each stage. It can show:

- The homepage HTTP request and response time
- Each URL being checked and any HTTP/network error
- SEO values and number of findings per HTML page
- Same-origin URLs discovered and crawl limits
- PageSpeed start/result or API error
- Detailed issue generation and Gemini AI result/fallback
- Supabase history save success/failure

The elapsed timer updates while waiting for slow requests such as Lighthouse. This is a genuine execution log, not a fabricated percentage/progress estimate. A PageSpeed request may not emit intermediate events while Google is processing it.

## Scan behavior and issue details

- Crawl limit: defaults to 30 URL requests; dashboard options are 30, 50, 100, 250 and 500. Sitemap scan is optional; discovery checks a bounded number of sitemap files.
- Request timeout: 12 seconds per page; maximum inspectable HTML payload is 2 MB.
- PageSpeed runs the mobile Lighthouse strategy and includes scores plus failed audits when available.
- SEO checks include title, description, H1 count, image alt text, canonical URL, and HTTP status.
- The issue report explains severity, evidence, impact, suggested action, and affected URL. Guidelines are not guarantees about search rankings.
- Monitoring is read-only: it does not edit WordPress pages or site files.
- A `429` from PageSpeed means the API rejected the request due to quota/rate limiting (or its specific response explanation). Check API enablement, quota, key restrictions, and avoid running repeated scans concurrently.
- PageSpeed timeout handling: by default, the app allows 75 seconds for the first mobile Lighthouse request and retries once with a 45-second timeout if the first attempt times out. Configure `PAGESPEED_TIMEOUT_MS` between 30,000 and 120,000 milliseconds if needed. A timeout after the retry is displayed as **Unavailable**, never as a guessed score. When saved history contains an earlier successful audit for the same website, the dashboard, PDF, and Excel label those values as **historical** and show their scan time.
- For a useful comparison, run scans with similar URL limits and sitemap settings. A scan that inspects fewer pages should not be assumed to have fixed all findings from a deeper crawl.
- Gemini is optional. If `GEMINI_MODEL=gemini-2.5-flash` is still present in an old `.env.local`, this version temporarily maps that specific old setting to `gemini-3.8-flash` and logs a warning. Update `.env.local` to `GEMINI_MODEL=gemini-3.8-flash` and restart `npm run dev`. If Gemini returns `403` or says the project was denied access, the API project/key needs valid access; changing the model string alone cannot grant access. Rule-based recommendations remain available.

## Phase 1 — Reports and comparison

The dashboard now includes the following Phase 1 features:

- **Landscape PDF audit report:** Click **Download PDF (Landscape)** below the current scan summary. The redesigned A4 landscape PDF has a branded header, score cards, a compact overview, a findings index, separate wide tables for evidence/impact/recommended fixes, WordPress/Elementor guidance, SEO metadata, redirects, request errors, comparison, warnings, AI recommendations, and timestamped activity. Long text wraps within defined column widths rather than being squeezed into portrait columns.
- **Formatted Excel workbook (.xlsx):** Click **Download Excel (.xlsx)**. This produces a real multi-sheet workbook with a styled **Overview**, **Analytics**, **Core Web Vitals**, **Score History**, **Detailed Findings**, **SEO Pages**, **Redirects**, **Request Errors**, **Scan Activity**, **Recommendations**, and (when a previous scan exists) **Previous Scan Comparison** sheets. Sheets have styled headers, sensible column widths, wrapped text, filters, frozen header rows, and severity highlighting. Start at Overview; use filters on Detailed Findings to prioritize items.
- **CSV export:** Click **CSV** when you need a simple, lightweight flat file. It remains available for systems that cannot read XLSX; for normal human review use the formatted Excel workbook.
- **Compare with previous scan:** The dashboard picks the most recent earlier saved scan for the same website. It compares performance/accessibility/best-practices/SEO scores, LCP, CLS, TBT, finding counts, new findings, and findings no longer detected. A missing finding is not a guarantee that the underlying issue has been permanently fixed.
- **Redirect-aware crawling:** HTTP 301/302/303/307/308 redirects are followed with an eight-hop safety limit, and final HTML URLs are inspected. Redirects to unrelated hosts are not followed. Only URLs on the configured hostname or its `www` variant are crawled.
- **Issue classification:** Lighthouse findings are mapped into performance, accessibility, SEO, links, availability, or best-practices categories. Severity is based on issue type and measured impact where available; a zero Lighthouse score alone is not treated as proof that an issue is high severity.

The report dependencies (`jspdf`, `jspdf-autotable`, and `exceljs`) are included in `package.json`; `npm install` installs them with the rest of the project. Exports are generated in the browser from the saved scan snapshot; there is no need to store a separate PDF/XLSX file in Supabase Storage. PDF, Excel, and CSV include practical WordPress / Elementor steps where relevant.

## Phase 2 — Crawling and issue triage

- **Configurable crawl limit:** Use the dashboard's Crawl configuration selector to choose 30, 50, 100, 250, or 500 URL requests for the next scan. The API clamps values to 10–500 for safety. Larger scans can take longer and increase requests to your site. Sitemap/robots discovery requests are in addition to the page limit.
- **Sitemap scan:** Enable the checkbox to inspect `robots.txt` and common WordPress/SEO sitemap locations (`/wp-sitemap.xml`, `/sitemap_index.xml`, and `/sitemap.xml`). Sitemap index files are followed up to a bounded number of sitemap documents; only same-site page URLs are used as crawl seeds. The configured limit applies to pages inspected; a bounded number of robots/sitemap discovery requests are additional. If no sitemap is readable, the internal-link crawl continues and the dashboard shows a warning.
- **Search, filter and sort:** In Issues explained in detail, search finding titles, categories, affected URLs, evidence, impact, and recommended fixes. Filter by category or severity and sort by severity, category, title or URL.
- **Duplicate grouping:** Similar findings with the same category and normalized title are grouped by default. Expand the group to inspect all occurrences and affected URLs. Uncheck the grouping box to review every finding individually. Grouping is a triage aid and does not delete details from the scan or exports.
- **WordPress / Elementor repair guidance:** Each issue card includes targeted admin/editor steps when a common CMS fix path exists. PDF, Excel, and CSV exports include these steps too. The app only provides guidance; it does not log into WordPress or change the site.


## Phase 3 — Alerts, dashboard protection, and issue ownership

### Login and dashboard protection

- The dashboard and application API routes require a Supabase Auth session. An unauthenticated visitor is sent to `/login`; the APIs return HTTP 401. The scheduled `/api/cron` endpoint uses its own `CRON_SECRET` bearer-token check.
- The login page uses Supabase email/password authentication. The app does not provide public sign-up; also disable **Allow new users to sign up** in Supabase Auth settings so strangers cannot register through the public Auth API. Create users yourself in Supabase Dashboard → **Authentication → Users → Add user**. `DASHBOARD_ALLOWED_EMAILS` can restrict the dashboard to a comma-separated allowlist; leave it empty only if you have disabled public sign-up and trust every Supabase Auth account in the project.
- Add both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`. Optionally set `DASHBOARD_ALLOWED_EMAILS=admin@example.com,webteam@example.com` to restrict access to those exact email addresses. `SUPABASE_SERVICE_ROLE_KEY` remains server-only and must never use the `NEXT_PUBLIC_` prefix. After setting auth variables, restart `npm run dev`.
- For deployment, set your deployed site URL in Supabase Authentication → URL Configuration and add localhost / production URLs as appropriate.

### Email alert for critical issues

- Uses Resend's email API. Configure `RESEND_API_KEY`, `ALERT_EMAIL_TO`, and `ALERT_EMAIL_FROM`. `ALERT_EMAIL_TO` can contain a comma-separated list of recipients; the sender address/domain must be verified with Resend.
- Sends an alert when a new critical finding appears or when a website transitions into a down state. It compares with the previous saved scan for the same hostname to avoid sending the same alert after every scan. When the email provider is not configured or rejects a message, the live activity log and scan warnings explain the reason.
- Alerts run after manual/streaming scans, the JSON scan endpoint, and the scheduled cron scan. For reliable duplicate suppression, keep Supabase scan history configured.
- Email is optional; scans still finish if alert delivery fails.

### Performance trends dashboard

- The Analytics & trends section includes **7 days**, **30 days**, **90 days**, and **All** filters. Charts use saved scans for the selected hostname only, up to the 50 most recent records in the selected period. Missing Lighthouse values are left unavailable and are not invented.
- The current scan summary is still shown separately from historical metrics. Performance, accessibility, best practices, SEO, LCP, CLS, and TBT use their own units and series.

### Issue status and ownership

- Each finding has an **Issue status & ownership** panel with status (Open, In progress, Fixed, Ignored), owner/assignee, and team notes. Save to keep the workflow data in Supabase across visits and future scans.
- Tracking keys are derived from category, normalized issue title and URL path, and are scoped to a normalized hostname. This gives repeat findings a persistent workflow record across scans without mixing separate sites. If the issue workflow table is missing, the dashboard shows a clear schema setup message.
- The updated `supabase-schema.sql` creates `public.website_issue_tracking` in addition to the existing scan history table. Run the **full updated SQL file** once in the Supabase SQL Editor. Re-running is safe for the provided `CREATE TABLE IF NOT EXISTS` statements and indexes.
- Owners are stored as labels (for example, `Web Team` or `Amit`) rather than automatically linked to an authenticated user account. The authenticated team members can view and edit workflow records; keep user creation restricted to trusted teammates.

### Phase 3 environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_server_side_secret_key
DASHBOARD_ALLOWED_EMAILS=admin@example.com,webteam@example.com
RESEND_API_KEY=re_your_resend_api_key
ALERT_EMAIL_TO=web-team@example.com
ALERT_EMAIL_FROM="Website Monitor AI <alerts@your-verified-domain.com>"
```

Do not expose the Supabase service-role key or Resend API key to the browser. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the public auth key; server-side data writes still use the private secret key.

## Deploy to Vercel

1. Push the project to a **private** GitHub repository.
2. Import it at https://vercel.com/new.
3. Add the environment variables from `.env.local` in **Project Settings → Environment Variables**. Use the project root Supabase URL and keep secret keys server-side.
4. Deploy; redeploy after changing environment variables.
5. The included cron schedule is `0 3 * * *` UTC (08:30 India Standard Time) in `vercel.json`. Cron frequency depends on your Vercel plan.
6. The daily job uses `Authorization: Bearer <CRON_SECRET>`. Keep the value private and identical in the deployment environment.

The scheduled job saves its report to Supabase when configured. Vercel cron does not run during local development.

## Project structure

```text
app/
  login/page.tsx             # Supabase email/password sign-in
  api/issues/route.ts        # Authenticated issue status, owner and notes API
  api/scan/route.ts          # Non-streaming scan endpoint (kept for integrations)
  api/scan/stream/route.ts   # Live NDJSON activity stream for the dashboard
  api/cron/route.ts          # Daily scheduled scan
  api/history/route.ts       # Scan history + table setup status
  page.tsx                   # Dashboard UI and live activity log
components/
  auth-controls.tsx         # Sign-out control
  analytics-dashboard.tsx   # Live score, category, severity and Core Web Vitals graphs
  report-tools.tsx           # Landscape PDF, formatted XLSX, CSV exports and previous-scan comparison
  issue-explorer.tsx         # Search/filter/sort, grouping, and issue cards
lib/
  alert-runner.ts            # De-duplicated alert evaluation against the previous scan
  email-alerts.ts            # Resend email notifications for critical findings/down events
  issue-tracking.ts          # Stable issue fingerprints across scans
  supabase-browser.ts        # Browser auth client (anon key only)
  config.ts                  # Site URL defaults + public URL / DNS safety checks
  cms-guidance.ts            # WordPress / Elementor issue-specific troubleshooting
  monitor.ts                 # Availability, configurable/sitemap crawl, SEO, PageSpeed, Gemini, categorized issue details
  storage.ts                 # Supabase persistence and diagnostics
types/index.ts               # Shared types
middleware.ts                # Protects dashboard/API; cron uses CRON_SECRET
supabase-schema.sql          # One-time history table setup (also in public/ for download)
vercel.json                  # Daily cron schedule
```

## How to understand the code (beginner map)

If you are learning Next.js, start with these files in this order:

1. `app/page.tsx` — dashboard screen, URL input, crawl options, live activity and recent history.
2. `components/analytics-dashboard.tsx` — all browser-side graphs. It uses the selected scan plus saved scans for the same website.
3. `components/issue-explorer.tsx` — issue search, category/severity filters, sorting, duplicate grouping and fix cards.
4. `components/report-tools.tsx` — PDF, formatted Excel workbook, CSV, report graphs, and previous-scan comparison.
5. `app/api/scan/stream/route.ts` — accepts the dashboard form, streams activity updates, and saves the completed report.
6. `lib/monitor.ts` — actual read-only website requests, redirect handling, sitemap crawl, SEO, PageSpeed and Gemini analysis.
7. `lib/config.ts` — URL validation and private/local network protections before a custom URL is scanned.
8. `lib/storage.ts` — Supabase connection, scan saving and history retrieval.
9. `types/index.ts` — shared TypeScript types that explain what each scan result contains.

Make a small change in one file at a time, then run `npm run dev` and test locally. Do not copy API keys into any `NEXT_PUBLIC_` variable, and do not deploy an unrestricted URL-scanning endpoint without authentication and rate limiting.

## Security and practical limits

- Dashboard and API authentication are implemented with Supabase Auth. Still add rate limiting (for example at a proxy/WAF or trusted API gateway) before unrestricted public deployment: the scan endpoint performs outbound requests and consumes external API quota.
- Only monitor sites you own or are authorized to test.
- The service-role/secret key bypasses Row Level Security; use it only on the server.
- Link checking covers crawlable same-origin links, not login-protected pages, JavaScript-only links, or every downloadable asset.
- PageSpeed/Lighthouse results are lab results and can vary between runs; they are not equivalent to real-user field data.
- WhatsApp alerts are not included. Optional Resend email alerts are included; see Phase 3 setup above.
