# DP Resources Production Deployment Checklist

## Required environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `RESOURCE_LIBRARY_GOOGLE_SHEET_EMBED_URL` when the master workbook embed is enabled
- Render/Next.js runtime variables required by the deployment environment

## Migration order
1. Apply existing migrations in timestamp order.
2. Apply `supabase/migrations/20260708090000_persistent_rate_limit_and_diagnostics.sql`.
3. Apply `supabase/migrations/20260708091000_resource_usage_analytics.sql`.
4. Confirm RPC grants and RLS are present before public traffic.

## Supabase backup/restore checklist
- Take a full database backup before applying migrations.
- Export auth users and storage settings if managed separately.
- Record current migration version and deployment commit.
- Test restore into a staging project before launch.
- Verify service-role keys are rotated if exposed during an incident.

## Smoke tests
- Verify the homepage loads.
- Verify `/privacy` and `/terms` are reachable and accurate.
- Sign up with a new test account.
- Confirm a safe username says available.
- Confirm a taken username says taken.
- Confirm a blocked or reserved username asks the user to choose a different username.
- Verify the new account can reach the Library after OTP verification and password setup.
- Verify an admin account can sign in and sees Admin.
- Search for a known indexed resource.
- Open a resource preview.
- Download a resource.
- Open a PDF resource and confirm preview.
- Open a PPTX resource and confirm PDF conversion preview.
- Seek in an audio/video file and confirm byte-range playback.
- Submit a support ticket and a resource report.
- Run API security smoke tests for unauthenticated, member, and admin roles.
- Confirm rate limits return generic 429 messages after repeated public requests.
- Confirm no service-role key appears in client bundles or `NEXT_PUBLIC_*` settings.

## Admin analytics verification
- Open Admin → Usage analytics.
- Confirm active viewing time appears after viewing a resource for at least one heartbeat interval.
- Confirm normal users cannot call admin usage RPCs or open `/admin`.

## Rollback steps
1. Disable public traffic or roll back the Render deployment.
2. Restore the pre-migration Supabase backup if schema rollback is required.
3. Re-apply only migrations known to be compatible with the rollback commit.
4. Verify admin login, signup, search, preview, PPTX, media seeking, support, reports, and analytics.


## Disposable Email and User Suspension Deployment

Codex can prepare the application code and migration file, but it cannot perform the Supabase Dashboard or production data steps because they require access to the connected Supabase project and live users. Deploy in this order so the application never calls missing database functions. Deploying the application code before `dp_resource_email_domain_policy` exists will make signup fail closed.

1. Review the Codex diff.
2. Run tests, typecheck, lint, and build locally (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`).
3. Apply the corrected `20260710153000_disposable_email_and_user_suspension.sql` migration to the `dp-resources` Supabase project.
4. Verify `public.dp_resource_email_domain_policy` directly with allowed and blocked addresses, including `anything@epaynine.com` and a normal allowed provider or school-domain address.
5. Deploy the application code.
6. In Supabase Dashboard, open Authentication → Hooks, configure Before User Created as a Postgres Function hook, select `public.dp_before_user_created`, save, and enable the hook.
7. Perform actual signup tests: confirm `anything@epaynine.com` is rejected before account creation, and confirm Gmail, Outlook, iCloud, and a school-domain signup continue through the existing verification flow.
8. Open Admin → Users and suspend the existing disposable-email account. Optionally block its domain if it is not a protected mainstream provider domain.
9. Confirm the suspended account cannot open, preview, or download resources.
10. Confirm its historical activity and download events remain visible.
11. Unsuspend a test account and verify access is restored.
12. Verify no manual approval step appears anywhere.
