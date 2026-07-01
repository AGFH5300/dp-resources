# DP Resources — Agent Instructions

## Actual stack

- Next.js 15+ with App Router and TypeScript.
- Tailwind CSS via `app/globals.css`.
- Supabase Auth using `@supabase/ssr` and `@supabase/supabase-js`.
- Supabase Postgres tables are defined in `supabase/schema.sql`.
- Google Drive API access uses `googleapis` from server-only utilities.
- Vercel is the deployment target.

## Coding approach

1. Think before coding: state assumptions, keep tradeoffs visible, and do not invent missing requirements.
2. Simplicity first: avoid speculative features, unnecessary dependencies, and elaborate abstractions.
3. Make surgical changes: preserve existing patterns and avoid unrelated refactors.
4. Verify outcomes: run `npm run lint`, `npm run typecheck`, and `npm run build` before finishing.

## Security rules

- Never commit `.env.local`, credentials, API keys, service-account JSON, Supabase service-role keys, or production secrets.
- Use environment variables for all private configuration.
- Never expose raw Google Drive file or folder URLs to browser users.
- Validate authentication and approval status server-side for every library, preview/open, download, and profile route.
- Validate admin permissions server-side for every admin page, mutation, and CSV export.
- Do not rely solely on client-side authorization checks.
- Record folder opens, file opens, and download starts through protected backend routes.
- Use `download_started`, never `download_completed`.
- Keep service-account credentials and Supabase service-role usage in server-only code.

## Product rules

- New users are unapproved by default.
- Unapproved users see an awaiting-approval screen.
- Approved users access files only through the portal.
- Normal users can see only their own profile and activity.
- Only admins can approve or revoke users, view all activity logs, and export activity data.
