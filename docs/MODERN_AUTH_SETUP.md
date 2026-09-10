# DP Resources Modern Sign-In setup

DP Resources owns the browser-facing OAuth flow. Supabase stays on the existing plan and remains the account/session/database backend; provider callbacks do **not** use a `*.supabase.co` URL.

Do not store provider secrets in this repository.

## Public identity

- Product/app name: `DP Resources`
- Production website: `https://dp.resources.anshgupta.cc`
- Production callbacks:
  - Google: `https://dp.resources.anshgupta.cc/api/auth/social/google/callback`
  - Microsoft: `https://dp.resources.anshgupta.cc/api/auth/social/microsoft/callback`
  - GitHub: `https://dp.resources.anshgupta.cc/api/auth/social/github/callback`
- `DP_AUTH_ORIGIN` controls the callback origin for a test environment. If omitted, production falls back to the DP Resources site URL and development falls back to the request origin.

The provider sees DP Resources as the OAuth application. After provider verification, DP Resources creates the normal Supabase session server-side using the existing service-role secret. No Supabase Auth custom domain or paid add-on is required.

## Current Replit test origin

`https://1f806117-49b4-4e7c-b45c-e34372f0773b-00-2km0swa6qb34h.sisko.replit.dev`

Set this Replit secret/environment variable:

`DP_AUTH_ORIGIN=https://1f806117-49b4-4e7c-b45c-e34372f0773b-00-2km0swa6qb34h.sisko.replit.dev`

The current Google test callback is therefore:

`https://1f806117-49b4-4e7c-b45c-e34372f0773b-00-2km0swa6qb34h.sisko.replit.dev/api/auth/social/google/callback`

If the Replit public hostname changes, update both `DP_AUTH_ORIGIN` and the provider's registered test callback.

## Provider environment variables

### Google

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Requested scopes: `openid email profile` only.

### Microsoft

- `MICROSOFT_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_SECRET`

Requested scopes: `openid profile email User.Read`.

### GitHub

- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`

Requested scopes: `read:user user:email` so DP Resources can obtain a verified email even when the GitHub profile hides it.

### Optional transaction-signing secret

- `DP_SOCIAL_AUTH_SECRET`

If this is omitted, server-side OAuth handoff cookies are signed with the existing `SUPABASE_SERVICE_ROLE_KEY`. The service-role value is never sent to the browser.

## Google first

Create a Google OAuth **Web application** branded `DP Resources`.

For Replit testing register exactly:

`https://1f806117-49b4-4e7c-b45c-e34372f0773b-00-2km0swa6qb34h.sisko.replit.dev/api/auth/social/google/callback`

Use the production homepage/privacy/terms pages for branding:

- Homepage: `https://dp.resources.anshgupta.cc`
- Privacy: `https://dp.resources.anshgupta.cc/privacy`
- Terms: `https://dp.resources.anshgupta.cc/terms`

Keep the Google app in Testing while the Replit flow is being verified and add only intended test users. Put the returned client ID and client secret in Replit Secrets, never in GitHub.

For production, use a separate Google production OAuth client with the production callback URL.

## Microsoft and GitHub

The DP Resources code uses the same state + PKCE + server callback architecture for both providers. Once Google is proven, only their one-time provider registrations and environment variables need to be added.

For production, register the Microsoft and GitHub callback URLs shown above. Keep development/test credentials separate from production credentials where the provider permits it.

## Apple

Apple remains represented in the UI as a later provider. Web Sign in with Apple requires Apple Developer configuration and is intentionally not part of the zero-cost launch path.

## Account and duplicate-prevention model

`public.dp_resource_social_identities` maps each provider's stable account subject to one existing DP Resources `auth.users.id`.

Rules:

- A provider subject can belong to only one DP Resources user.
- A DP Resources user can connect at most one account from each provider.
- A verified provider email matching an existing DP Resources profile automatically attaches to that existing user instead of creating a duplicate.
- Display names and usernames are never used to infer account ownership.
- Explicit linking from Settings is bound to the already authenticated DP Resources user.
- If a provider email already belongs to a different DP Resources user, linking is rejected rather than merging accounts.
- Social access tokens are used only during the callback and are not stored.

## First-time social signup

For a brand-new provider email, DP Resources does **not** create an incomplete Supabase user before onboarding. Instead:

1. The provider verifies the user.
2. DP Resources stores a short-lived, signed, HttpOnly onboarding handoff.
3. The user chooses the normal DP Resources full name and username.
4. Existing username, identity and disposable-email checks run.
5. The complete Supabase user/profile is created with the same validation rules as the existing site.
6. The provider identity is attached and DP Resources establishes the normal Supabase session server-side.

This avoids weakening the existing `auth.users` validation trigger.

## Connected Accounts

Settings reads DP Resources' own provider mappings, not Supabase social identities. Connect uses the same DP Resources callback route in `mode=link`. Disconnect removes only the DP Resources mapping; provider access tokens are not retained.

`public.dp_resource_auth_methods` records whether an account has a DP Resources password so a social-only account cannot disconnect its last usable social sign-in method.

## Database migration

`20260910103500_social_auth_identity_compatibility.sql` now only adds the two server-only tables needed for direct social identity mappings and password-method tracking. It does not change Supabase OAuth provider configuration and does not relax the existing identity validation trigger.

Apply it only immediately before controlled Replit end-to-end testing.

## Testing checklist

For each enabled provider:

1. New signup -> provider -> DP Resources profile completion -> Library.
2. Existing password user with the same verified email -> provider -> same existing DP Resources user/data.
3. Login with an unregistered provider email -> clear `no account` message rather than silent signup.
4. Existing user -> Settings -> Connect provider -> same DP Resources user ID.
5. Attempt to connect a provider account already owned by another DP Resources user -> blocked.
6. Disconnect provider while another usable sign-in method remains.
7. Social-only account cannot remove its final provider.
8. Suspended account cannot bypass suspension through social sign-in.
9. Cancelled/failed OAuth returns to DP Resources without exposing provider tokens or internal errors.
10. State mismatch/expired handoff fails closed.
11. `next` redirects cannot leave DP Resources.
12. Provider access tokens are not persisted in cookies, local storage or database rows.

## Later phases

- Apple, if/when Apple Developer access is available.
- TOTP authenticator MFA and stronger verification for sensitive account operations.
- Session/device management and sign-out controls.
- ManageBac/Faria SSO after partner/SSO credentials and terms are confirmed.
