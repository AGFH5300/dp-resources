# DP Resources social authentication — production readiness

This checklist covers the production rollout for DP Resources-owned OAuth with Google, Microsoft and GitHub. Provider access tokens are used only during the callback and are not stored.

## Architecture

- Browser-facing OAuth callbacks are owned by DP Resources.
- Supabase remains the account/session/database backend.
- OAuth start uses state + PKCE.
- OAuth transaction state is stored in a short-lived signed HttpOnly cookie.
- Social identity mappings are server-only in `public.dp_resource_social_identities`.
- One provider subject can map to only one DP Resources user.
- One DP Resources user can connect at most one identity from each provider.
- Existing accounts are matched only by provider subject or provider-authenticated email; display name and username are never used for merging.
- Provider access tokens are not persisted.

## Production provider callbacks

- Google: `https://dp.resources.anshgupta.cc/api/auth/social/google/callback`
- Microsoft: `https://dp.resources.anshgupta.cc/api/auth/social/microsoft/callback`
- GitHub: `https://dp.resources.anshgupta.cc/api/auth/social/github/callback`

All production provider registrations must include the exact HTTPS callback above for that provider.

## Minimum requested permissions

### Google

`openid email profile`

No Gmail, Drive, Calendar or other Google API scopes are requested.

### Microsoft

`openid profile email User.Read`

DP Resources does **not** request `offline_access` and does not use or retain Microsoft refresh tokens. Microsoft may still display the consent text “Maintain access to data you have given it access to” when delegated permissions are granted; that consent-screen wording does not mean DP Resources requested or stores a refresh token.

### GitHub

`read:user user:email`

`user:email` is required so DP Resources can resolve a verified email even when the profile email is hidden.

## Required Render environment variables

Production must have:

- `DP_AUTH_ORIGIN=https://dp.resources.anshgupta.cc`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `MICROSOFT_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_SECRET`
- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`

Recommended hardening:

- `DP_SOCIAL_AUTH_SECRET` — a dedicated random secret used only to sign the short-lived OAuth handoff cookies. If omitted, the server currently falls back to the existing Supabase service-role secret; production should prefer a separate secret for key separation.

Never place provider secrets in GitHub, browser code, public environment variables or screenshots.

## Google production checks

Before production deployment:

- Audience is External.
- Publishing status is **In production**, not Testing.
- DP Resources name and logo are configured.
- Homepage, Privacy and Terms point to the production DP Resources domain.
- Authorized production domain is owned/verified.
- Production OAuth client contains the production callback.
- Only `openid`, `email` and `profile` are requested by DP Resources.

Google recommends separate OAuth projects/clients for testing and production. A production client should not depend on a Replit/test-only redirect.

## Microsoft production checks

Current intended production registration:

- App name: DP Resources
- Tenant controlled by the DP Resources owner, not a school tenant.
- Publisher domain: `anshgupta.cc`
- Supported audience: any Entra ID tenant + personal Microsoft accounts.
- DP Resources logo uploaded.
- Homepage, Privacy, Terms and Support URLs configured.
- Production callback registered.
- Delegated Microsoft Graph permission limited to `User.Read` plus OIDC sign-in scopes.

The Microsoft consent screen can show **unverified** because Microsoft Verified Publisher is a separate Partner Center/legal-organization verification program. This does not prevent the OAuth implementation itself from functioning, although restrictive organization tenants may require admin approval for unverified multitenant apps.

## GitHub production checks

- OAuth app name is DP Resources.
- Homepage uses the production DP Resources domain.
- Production callback is registered exactly.
- Client ID/secret are stored only server-side.
- Device Flow is not required for the web login implementation.

## Database checks

Migration `20260910103500_social_auth_identity_compatibility.sql` must be applied before social authentication is enabled.

Verify:

- `dp_resource_social_identities` exists.
- `dp_resource_auth_methods` exists.
- RLS is enabled on both.
- public/anon/authenticated roles cannot read or mutate either table.
- existing password accounts are marked `password_enabled=true`.

## End-to-end release tests

Run these on the release candidate before production promotion:

1. Existing password account → Google login → same DP Resources user/data.
2. Existing password account → GitHub login → same DP Resources user/data.
3. Existing password account → Microsoft login → same DP Resources user/data.
4. Settings → Connect each provider directly while already signed in.
5. Settings → Disconnect a provider while another sign-in method remains.
6. Social-only account cannot disconnect its final usable provider.
7. Brand-new social email → create-account prompt → profile completion → Library.
8. Username availability checker behaves exactly like normal signup.
9. Duplicate provider subject cannot attach to a second DP Resources account.
10. Provider email belonging to another DP Resources account is rejected during explicit linking.
11. Suspended account cannot bypass suspension through social sign-in.
12. Cancelled provider consent returns safely to DP Resources.
13. Altered/expired state fails closed.
14. `next` redirect cannot leave the DP Resources origin.
15. No provider access token or refresh token appears in cookies, local storage, database rows, logs or client bundles.
16. Saved resources, Recent, profile/avatar and Settings remain attached to the original DP Resources UUID after social login.

## CI release gate

Before merging the production-readiness branch, CI must pass:

- install
- TypeScript typecheck
- full test suite
- lint
- production build
- client-bundle secret scan
- production dependency audit at high severity

## Deployment policy

Render Auto-Deploy remains disabled. Merging to `main` does not authorize production deployment.

Only after provider configuration, Render environment variables and the release tests above are complete should the exact tested `main` SHA be manually promoted to Render.
