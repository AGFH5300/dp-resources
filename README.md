# DP Resources

Production Next.js portal for approved users to browse a private Google Drive library without exposing raw Drive URLs.

## Stack

- Next.js 15 App Router, React server components, TypeScript, Tailwind CSS
- Supabase Auth, Supabase Postgres profiles, and durable activity logs
- Google Drive API via a server-only service account
- Deployable to Render

## Environment variables

Copy `.env.example` to `.env.local` and fill in values:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role key for admin operations, bootstrap admin sync, and activity writes.
- `GOOGLE_DRIVE_FOLDER_ID`: root private Drive folder ID.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google service account email.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: service account private key, using `\n` for newlines in env storage.
- `ADMIN_EMAILS`: comma-separated bootstrap admin emails. When one of these users signs in, server-only service-role code updates their profile to `role = 'admin'`, `is_approved = true`, and a non-null `approved_at`.

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Set Auth email/password signups as desired.
4. Configure the Supabase Auth Site URL and redirect URLs for local development and your Render public URL.

New signups receive a `profiles` row automatically with `role = 'user'` and `is_approved = false`. Database authorization uses the authoritative `profiles.role` and `profiles.is_approved` values; it does not depend on database `current_setting` environment values.

### Admin bootstrap and recovery

Set `ADMIN_EMAILS` in the app environment before the first admin signs in. On sign-in, the server verifies the authenticated email against this allowlist and uses the Supabase service-role key server-side to approve and promote that profile.

If `ADMIN_EMAILS` was not configured and no approved admin exists, recover by running this SQL in Supabase SQL Editor, replacing the email first:

```sql
update public.profiles
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
npm run build
npm run test
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
