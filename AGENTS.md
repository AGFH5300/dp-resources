# DP Resources — Agent Instructions

## Coding approach

1. Think before coding.

   * State material assumptions and surface meaningful tradeoffs.
   * Choose the simplest correct approach.
   * Do not silently invent missing requirements.

2. Simplicity first.

   * Build only what was requested.
   * Avoid speculative features, one-off abstractions, and unnecessary dependencies.
   * Prefer a small clear implementation over an elaborate framework.

3. Make surgical changes.

   * Change only what the task requires.
   * Preserve existing patterns and formatting.
   * Remove only code or imports made unused by your own changes.
   * Do not refactor unrelated areas.

4. Verify outcomes.

   * Turn requests into concrete success conditions.
   * Run lint, type checks, and a production build before finishing.
   * When a check cannot run, report the exact blocker.

## DP Resources security rules

* Never commit `.env.local`, credentials, API keys, service-account JSON, Supabase service-role keys, or production secrets.
* Use environment variables for all private configuration.
* Never expose raw Google Drive file or folder URLs to browser users.
* Validate authentication and approval status server-side for every library, preview, open, and download route.
* Validate admin permissions server-side for every admin page and mutation.
* Do not rely solely on client-side authorization checks.
* Record folder opens, file opens, and download starts through protected backend routes.
* Use `download_started`, never `download_completed`, because the server cannot confirm a completed browser download.

## Product rules

* New users are unapproved by default.
* Unapproved users see an awaiting-approval screen.
* Approved users access files only through the portal.
* Normal users can see only their own profile and activity.
* Only admins can approve or revoke users, view all activity logs, and export activity data.
