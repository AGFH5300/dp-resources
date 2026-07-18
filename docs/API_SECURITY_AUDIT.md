# API Security Audit

Scope: `app/api/**/route.ts`. This is an internal audit of server-side access control, sensitive backend access, write protections, and abuse controls. The in-memory rate limiter noted below is process-local only and is not globally distributed protection.

## `app/api/admin/activity/export/route.ts`

- Methods: GET
- Classification: Admin-only
- Guard: requireAdmin()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Supabase/RPC
- Security change made: Audited; no code change required.

## `app/api/admin/featured-resource/route.ts`

- Methods: POST, DELETE
- Classification: Admin-only
- Guard: requireAdmin()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: No
- Drive/Supabase/service-role access: Supabase/RPC, Drive
- Security change made: same-origin write check

## `app/api/admin/index/route.ts`

- Methods: GET, POST
- Classification: Admin-only
- Guard: requireAdmin()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: No
- Drive/Supabase/service-role access: Supabase/RPC, Drive
- Security change made: same-origin write check

## `app/api/admin/reports/[id]/route.ts`

- Methods: PATCH
- Classification: Admin-only
- Guard: requireAdmin()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Supabase/RPC
- Security change made: same-origin write check

## `app/api/admin/support/[id]/messages/route.ts`

- Methods: POST
- Classification: Admin-only
- Guard: requireAdmin()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Supabase/RPC
- Security change made: same-origin write check

## `app/api/admin/support/[id]/route.ts`

- Methods: PATCH
- Classification: Admin-only
- Guard: requireAdmin()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Supabase/RPC
- Security change made: same-origin write check

## `app/api/admin/users/search/route.ts`

- Methods: GET
- Classification: Admin-only
- Guard: requireAdmin()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Supabase/RPC
- Security change made: Audited; no code change required.

## `app/api/auth/availability/route.ts`

- Methods: GET
- Classification: Public
- Guard: Public auth/signup endpoint
- Rate-limit status: Yes
- Reads/writes user data: No
- Drive/Supabase/service-role access: Supabase/RPC
- Security change made: uses SQL username status

## `app/api/auth/signout/route.ts`

- Methods: POST
- Classification: Public
- Guard: Public auth/signup endpoint
- Rate-limit status: No
- Reads/writes user data: No
- Drive/Supabase/service-role access: No direct sensitive backend access
- Security change made: same-origin write check

## `app/api/auth/start-signup/route.ts`

- Methods: POST
- Classification: Public
- Guard: Public auth/signup endpoint
- Rate-limit status: Yes
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Supabase/RPC
- Security change made: same-origin write check, uses SQL username status

## `app/api/favorites/route.ts`

- Methods: GET, POST, DELETE
- Classification: Authenticated member
- Guard: requireMember()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Supabase/RPC, Drive
- Security change made: same-origin write check

## `app/api/files/[fileId]/download/route.ts`

- Methods: GET
- Classification: Authenticated member
- Guard: requireMember()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Drive
- Security change made: Audited; no code change required.

## `app/api/files/[fileId]/open/route.ts`

- Methods: GET
- Classification: Authenticated member
- Guard: requireMember()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Drive
- Security change made: Audited; no code change required.

## `app/api/library/folder-summaries/route.ts`

- Methods: POST
- Classification: Authenticated member
- Guard: requireMember()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: No
- Drive/Supabase/service-role access: No direct sensitive backend access
- Security change made: same-origin write check

## `app/api/library/open-folder/route.ts`

- Methods: POST
- Classification: Authenticated member
- Guard: requireMember()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Drive
- Security change made: same-origin write check

## `app/api/reports/route.ts`

- Methods: POST
- Classification: Authenticated member
- Guard: requireMember()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Supabase/RPC, Drive
- Security change made: same-origin write check

## `app/api/resource/[fileId]/content/route.ts`

- Methods: GET
- Classification: Authenticated member
- Guard: requireMember()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Drive
- Security change made: Audited; no code change required.

## `app/api/resource/[fileId]/presentation-pdf/route.ts`

- Methods: GET
- Classification: Authenticated member
- Guard: requireMember()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: No
- Drive/Supabase/service-role access: Drive
- Security change made: Audited; no code change required.

## `app/api/search/route.ts`

- Methods: GET
- Classification: Authenticated member
- Guard: requireMember()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: No
- Drive/Supabase/service-role access: Supabase/RPC, Drive
- Security change made: Audited; no code change required.

## `app/api/support/[id]/route.ts`

- Methods: GET
- Classification: Authenticated member
- Guard: requireMember()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Supabase/RPC
- Security change made: Audited; no code change required.

## `app/api/support/route.ts`

- Methods: POST
- Classification: Authenticated member
- Guard: requireMember()
- Rate-limit status: No; protected by session/admin scope
- Reads/writes user data: Yes
- Drive/Supabase/service-role access: Supabase/RPC
- Security change made: same-origin write check

## Global findings and changes

- Public username availability now relies on `dp_resource_username_availability_status`, which returns only `available`, `unavailable`, or `invalid` and never exposes moderation reasons or matched terms.
- Production signup debug output is gated by `NODE_ENV === development` only; `NEXT_PUBLIC_SIGNUP_DEBUG` no longer enables production debug payloads.
- State-changing cookie-session routes audited in this pass now reject cross-origin writes using Origin/Host validation before authorization and body handling.
- Service-role usage remains in server-only modules (`lib/supabase-admin.ts`, `lib/supabase.ts`, and activity/indexing helpers) and is not exposed through `NEXT_PUBLIC_*` variables.
- Resource/file/folder routes require membership and verify Drive items with `assertInsideRoot(...)` before serving media, downloads, conversions, or activity writes.
- Production security headers include CSP, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`; Google Drive/Sheets frames and PDF.js workers remain allowed.
