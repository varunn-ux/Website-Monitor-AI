# Changelog

## 2.1.0 — audit reliability and unavailable metrics

- Added a configurable PageSpeed Insights timeout and one retry after timeout. The default first attempt is 75 seconds, followed by one retry of up to 45 seconds.
- If PageSpeed still fails, score and Core Web Vital fields stay unavailable instead of using guessed values. The dashboard explains common quota, access, and timeout causes.
- The dashboard, PDF, and Excel summary now label any earlier successful Lighthouse result as historical and show its scan time; they never present old values as the current scan's scores.
- Changed remaining `N/A` labels for missing comparison/status metrics to clearer `Unavailable` or `Unknown` text.
- Mapped an old `GEMINI_MODEL=gemini-2.5-flash` setting to `gemini-3.8-flash` for the current scan and added an activity warning to update `.env.local`. Gemini `403` permission errors still require an API key/project with valid access.
- Timeout-only internal URL failures are described as needing verification, not automatically as confirmed broken pages.
- Improved Lighthouse issue categories for heading order and browser DevTools issues.
- Fixed the AI-unavailable warning condition so denied/failed AI calls appear in the scan warnings.
- De-duplicated old saved activity rows in UI and exports, and used the cleaned activity list for report duration.


## 3.0.0 — Phase 3

- Added Supabase Auth login page and middleware protection for dashboard and application APIs; cron remains protected with CRON_SECRET.
- Added optional Resend email alerts for newly detected critical issues and website-down transitions.
- Added analytics time filters for 7, 30, 90 days, and all available scans for a hostname.
- Added persistent issue status, owner/assignee, and team notes.
- Extended Supabase SQL setup to create `website_issue_tracking`.
