# DP Resources

Production Next.js portal for verified users to browse a private Google Drive library without exposing raw Drive URLs.

## Stack

- Next.js 15 App Router, React server components, TypeScript, Tailwind CSS
- Supabase Auth with DP Resources-only profile, membership, and activity tables
- Google Drive API via a server-only service account
- Deployable to Vercel or any Node 20+ host

## Environment variables

Copy `.env.example` to `.env.local` and fill in values:

- `NEXT_PUBLIC_SUPABASE_URL`: DP Resources Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role key for admin operations, bootstrap admin sync, and activity writes.
- `GOOGLE_DRIVE_FOLDER_ID`: root private Drive folder ID.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google service account email.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: service account private key, using `\n` for newlines in env storage.
- `ADMIN_EMAILS`: comma-separated bootstrap admin emails stored as a server-side environment variable. When one of these users signs in, server-only service-role code creates or updates only that user's `dp_resource_memberships` row to `role = 'admin'`. The legacy `is_approved` and `approved_at` fields may still be populated for backward compatibility, but they do not control access.

## Supabase setup for DP Resources authentication

DP Resources uses its own Supabase project and DP-only database objects. It does not depend on any external app tables, functions, triggers, migrations, or RPCs.

1. Open the Supabase SQL Editor for the DP Resources Supabase project.
2. Run the SQL in `supabase/schema.sql` or apply the migration in `supabase/migrations/20260701110000_dp_resource_profiles_auth.sql` together with the existing DP Resources schema.
3. In Supabase Auth, enable the Email provider.
4. DP Resources requests and verifies the email code with Supabase `signInWithOtp` and `verifyOtp`. In Supabase Auth email templates, edit the template labelled “Magic Link” so it visibly includes `{{ .Token }}`; Supabase renders this as the six-digit OTP code used by the MYP-style verification screen.
5. Use this exact HTML snippet in the Magic Link email template if you need a minimal OTP template:

```html
<h2>Verify your email</h2>
<p>Your verification code is: <strong>{{ .Token }}</strong></p>
```

6. Add the deployed app URL and `http://localhost:3000` to Supabase Auth Site URL / Redirect URLs as appropriate. Include callback URLs such as `/auth/callback` for each host.

The schema creates DP Resources-owned objects including:

- `public.dp_resource_profiles`
- `public.dp_resource_memberships`
- `public.dp_resource_activity_logs`
- `public.dp_resource_is_username_available(text)`
- `public.dp_resource_is_email_available(text)`
- `public.dp_resources_is_admin()`
- `public.dp_resources_handle_new_user()`
- `dp_resources_on_auth_user_created`

New users sign up with username, full name, and email, receive a six-digit Supabase signup OTP, verify it, set a password, and go directly to the library. The browser only receives the public anon key; the service-role key stays in server-only code.

### SQL verification

After running the migration, confirm the DP Resources tables exist and are populated as expected:

```sql
select * from public.dp_resource_profiles;
select * from public.dp_resource_memberships;
select * from public.dp_resource_activity_logs;
```

### Admin bootstrap and recovery

Set `ADMIN_EMAILS` before the first DP Resources admin signs in. On sign-in, the server verifies the authenticated email against this allowlist and uses the Supabase service-role key server-side to approve and promote only that user's DP Resources membership.

If `ADMIN_EMAILS` was not configured and no DP Resources admin exists, recover by running this SQL in Supabase SQL Editor, replacing the email first:

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
