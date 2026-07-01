# DP Resources

Production Next.js portal for approved users to browse a private Google Drive library without exposing raw Drive URLs.

## Stack

- Next.js 15 App Router, React server components, TypeScript, Tailwind CSS
- Supabase Auth shared with MYP Atlas, plus separate DP Resources membership and activity tables
- Google Drive API via a server-only service account
- Deployable to Render

## Environment variables

Copy `.env.example` to `.env.local` and fill in values:

- `NEXT_PUBLIC_SUPABASE_URL`: existing Supabase project URL used by MYP Atlas.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role key for admin operations, bootstrap admin sync, and activity writes.
- `GOOGLE_DRIVE_FOLDER_ID`: root private Drive folder ID.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google service account email.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: service account private key, using `\n` for newlines in env storage.
- `ADMIN_EMAILS`: comma-separated bootstrap admin emails stored as a Render server-side environment variable. When one of these users signs in, server-only service-role code creates or updates only that user's `dp_resource_memberships` row to `role = 'admin'`, `is_approved = true`, and sets `approved_at` only when approval is first granted.

## Supabase setup for the shared MYP Atlas project

DP Resources intentionally shares the existing MYP Atlas Supabase Auth accounts so MYP Atlas users can log in with the same email/password account. DP Resources does **not** use, alter, or depend on MYP Atlas `public.profiles`, `profiles.role`, MYP tables, MYP triggers, or MYP policies for DP Resources permissions.

1. Use the existing Supabase project that powers MYP Atlas.
2. Open the Supabase SQL Editor and run the new DP Resources migration in `supabase/schema.sql` once.
3. Do not run any SQL that drops, recreates, renames, or changes MYP Atlas tables, `public.profiles`, the existing MYP `handle_new_user()` function, or the existing MYP `on_auth_user_created` trigger.
4. Configure Supabase Auth email/password signups as desired.
5. Add the Render deployment URL to both the Supabase Auth Site URL and Redirect URLs. Also keep local development URLs there if needed.

The migration creates only DP Resources-owned objects:

- `public.dp_resource_memberships`
- `public.dp_resource_activity_logs`
- `public.dp_resources_is_admin()`
- `public.dp_resources_handle_new_user()`
- `dp_resources_on_auth_user_created`

Existing MYP auth users are backfilled into `public.dp_resource_memberships` as pending DP Resources users. Admins approve those users only inside DP Resources. New signups also receive a pending DP Resources membership through the separate DP Resources trigger, while the existing MYP trigger remains untouched.

### SQL verification

After running the migration, confirm the DP Resources tables exist and are populated as expected:

```sql
select * from public.dp_resource_memberships;
select * from public.dp_resource_activity_logs;
```

### Admin bootstrap and recovery

Set `ADMIN_EMAILS` in the Render environment before the first DP Resources admin signs in. On sign-in, the server verifies the authenticated email against this allowlist and uses the Supabase service-role key server-side to approve and promote only that user's DP Resources membership. It does not touch the MYP Atlas profile table.

If `ADMIN_EMAILS` was not configured and no approved DP Resources admin exists, recover by running this SQL in Supabase SQL Editor, replacing the email first:

```sql
update public.dp_resource_memberships
set role = 'admin',
    is_approved = true,
    approved_at = coalesce(approved_at, now())
where lower(email) = lower('admin@example.com');
```

## Google Cloud and Drive setup

1. Create or choose a Google Cloud project.
2. Enable the Google Drive API.
3. Create a service account and generate a JSON key.
4. Copy the service account email and private key into environment variables.
5. Share the private Drive root folder with the service account email as a viewer.
6. Set `GOOGLE_DRIVE_FOLDER_ID` to that root folder ID.

The app never sends raw Google Drive URLs to users. Folder navigation, file open, and download requests go through authenticated Next.js route handlers. Requested Drive IDs are accepted only after the server walks parent folders and confirms containment under `GOOGLE_DRIVE_FOLDER_ID`; outside IDs return `404` and are not logged.

Google Docs export as PDF, Google Sheets export as XLSX, and Google Slides export as PDF. Unsupported Google-native MIME types return a clear unavailable response.

## Local run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

## Render deployment

1. Create a Render Web Service from this repository.
2. Use Node 20 or newer.
3. Set build command to `npm run build`.
4. Set start command to `npm run start`. Next.js respects Render's `PORT` automatically.
5. Set every variable from `.env.example` in Render Environment. Store secrets only in Render-managed environment variables.
6. Add the Render public URL to Supabase Auth Site URL and redirect URLs.
7. Deploy.

A `render.yaml` blueprint is included with secret values marked `sync: false`; it does not hardcode credentials.

## Behavior when Drive is not configured

- Admins see a clear Google Drive configuration warning.
- Approved users see “Resources are not yet available.”
- The app still builds successfully.
