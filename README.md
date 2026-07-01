# DP Resources

Production Next.js portal for approved users to browse a private Google Drive library without exposing raw Drive URLs.

## Stack

- Next.js 15 App Router, React server components, TypeScript, Tailwind CSS
- Supabase Auth, Supabase Postgres profiles, and durable activity logs
- Google Drive API via a server-only service account
- Deployable to Vercel

## Environment variables

Copy `.env.example` to `.env.local` and fill in values:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role key for admin operations and activity writes.
- `GOOGLE_DRIVE_FOLDER_ID`: root private Drive folder ID.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google service account email.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: service account private key, using `\n` for newlines in env storage.
- `ADMIN_EMAILS`: comma-separated admin emails; server code treats these as admin and approved.

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Set Auth email/password signups as desired.
4. Configure a site URL and redirect URLs for local development and Vercel.
5. For database-side admin detection, set `app.admin_emails` to the same comma-separated emails used in `ADMIN_EMAILS` if you need direct SQL/RLS admin behavior. The application also enforces admin status server-side from `ADMIN_EMAILS`.

New signups receive a `profiles` row automatically and are unapproved unless their email is included in `ADMIN_EMAILS`.

## Google Cloud and Drive setup

1. Create or choose a Google Cloud project.
2. Enable the Google Drive API.
3. Create a service account and generate a JSON key.
4. Copy the service account email and private key into environment variables.
5. Share the private Drive folder with the service account email as a viewer.
6. Set `GOOGLE_DRIVE_FOLDER_ID` to the folder ID.

The app never sends raw Google Drive URLs to users. File open, folder open, and download requests go through authenticated Next.js route handlers and write `activity_logs`.

## Local run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

## Vercel deployment

1. Import this repository into Vercel.
2. Set every variable from `.env.example` in Vercel Project Settings.
3. Ensure the Supabase Auth Site URL and redirect URLs include the Vercel production URL.
4. Deploy with the default Next.js build command `npm run build`.

## Behavior when Drive is not configured

- Admins see a clear Google Drive configuration warning.
- Approved users see “Resources are not yet available.”
- The app still builds successfully.
