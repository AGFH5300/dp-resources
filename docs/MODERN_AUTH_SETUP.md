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

If the Replit public hostname changes, update both `DP_AUTH_ORIGIN` and every provider's registered test callback.

## Provider environment variables

### Google

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Requested scopes: `openid email profile` only.

### Microsoft

- `MICROSOFT_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_SECRET`

Requested scopes: `openid profile email User.Read`.

Microsoft can still show **Maintain access to data you have given it access to** on its consent page. DP Resources does not explicitly request `offline_access` and does not retain refresh tokens. Microsoft documents that offline access is implicitly represented whenever delegated permissions are granted. DP Resources only uses the short-lived access token during the callback and never persists provider tokens.

Microsoft email and UPN values are mutable and are not used to authorize an existing DP Resources account. A Microsoft identity that is not already mapped must be connected explicitly from Settings while the user is authenticated. This prevents an email attribute controlled by another Microsoft tenant from becoming an account-linking credential.

### GitHub

- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`

Requested scopes: `read:user user:email`. DP Resources accepts only an email marked verified by GitHub's `/user/emails` endpoint; it does not fall back to free-form profile email text.

### Transaction-signing secret

- `DP_SOCIAL_AUTH_SECRET`

A dedicated random value is strongly recommended for production so OAuth handoff-cookie signing is separated from Supabase credentials. If omitted, the server falls back to the existing `SUPABASE_SERVICE_ROLE_KEY`; that value remains server-only and is never sent to the browser.

Generate a production value locally, keep it out of source control, and store it only in the runtime secret manager, for example:

`openssl rand -hex 32`

## Provider registrations

### Google

Use a Google OAuth **Web application** branded `DP Resources` with only the scopes above. Register the Replit callback for testing and the production callback before rollout. Homepage, privacy and terms should point to the DP Resources production pages.

### Microsoft

Use the DP Resources-owned Microsoft Entra tenant and multitenant + personal Microsoft account audience. The tenant has the verified publisher domain `anshgupta.cc`. Register both the Replit and production Web callbacks, upload the DP Resources logo, and configure homepage/privacy/terms/support URLs.

The Microsoft consent screen can legitimately show `unverified` because Microsoft Verified Publisher is a separate legal-organization/Partner Center program. DP Resources is currently a personal project, so this badge is not required for the OAuth flow to function. Some tightly managed school/company tenants may still require administrator consent for unverified third-party apps.

### GitHub

Use the DP Resources OAuth app with both Replit and production callback URLs configured. The app must request only `read:user user:email` and should use the DP Resources homepage and branding.

## Account and duplicate-prevention model

`public.dp_resource_social_identities` maps each provider's stable account subject to one existing DP Resources `auth.users.id`.

Rules:

- A provider subject can belong to only one DP Resources user.
- A DP Resources user can connect at most one account from each provider.
- Google and GitHub may attach to an existing account when their explicitly verified provider email matches the existing DP Resources email.
- Microsoft never authorizes an existing account by email/UPN alone; an unmapped Microsoft identity must be linked from the authenticated Settings flow.
- Display names and usernames are never used to infer account ownership.
- Explicit linking from Settings is bound to the already authenticated DP Resources user.
- If a provider email already belongs to a different DP Resources user, linking is rejected rather than merging accounts.
- Social access tokens are used only during the callback and are not stored.

## First-time social signup

For a brand-new provider identity, DP Resources does **not** create an incomplete Supabase user before onboarding. Instead:

1. The provider verifies the user.
2. DP Resources stores a short-lived, signed, HttpOnly onboarding handoff.
3. If the user entered through Log in, DP Resources shows a modal explaining that no account exists and offers to create one without repeating OAuth.
4. The user completes the same DP Resources username/full-name form style used by normal signup, including the automatic username availability checker.
5. Existing username, identity and disposable-email checks run.
6. The complete Supabase user/profile is created with the same validation rules as the existing site.
7. The provider identity is attached and DP Resources establishes the normal Supabase session server-side.

For Microsoft, if that email already belongs to an existing DP Resources account, signup is stopped and the user is told to sign in normally and connect Microsoft from Settings instead of linking by email.

This avoids weakening the existing `auth.users` validation trigger.

## Connected Accounts

Settings reads DP Resources' own provider mappings, not Supabase social identities. Connect uses the same DP Resources callback route in `mode=link`. Disconnect removes only the DP Resources mapping; provider access tokens are not retained.

`public.dp_resource_auth_methods` records whether an account has a DP Resources password so a social-only account cannot disconnect its last usable social sign-in method.

The active Connected Accounts UI is intentionally limited to Google, Microsoft and GitHub. Apple and future school SSO placeholders are not shown.

## Database migration

`20260910103500_social_auth_identity_compatibility.sql` adds the two server-only tables needed for direct social identity mappings and password-method tracking. It does not change Supabase OAuth provider configuration and does not relax the existing identity validation trigger.

The migration has already been applied to the existing Supabase project used by Replit testing. Do not rework the existing auth-user validation trigger as part of production rollout.

## End-to-end testing checklist

For each enabled provider:

1. New signup -> provider -> DP Resources profile completion -> Library.
2. Existing password user with a trusted verified Google/GitHub email -> provider -> same existing DP Resources user/data.
3. Existing Microsoft user -> Settings -> Connect Microsoft -> same DP Resources user ID; an unlinked Microsoft email must not auto-attach from the login page.
4. Login with an unregistered provider identity -> account-creation flow works without repeating provider OAuth.
5. Existing user -> Settings -> Connect provider -> same DP Resources user ID.
6. Attempt to connect a provider account already owned by another DP Resources user -> blocked.
7. Disconnect provider while another usable sign-in method remains.
8. Social-only account cannot remove its final provider.
9. Suspended account cannot bypass suspension through social sign-in.
10. Cancelled/failed OAuth returns to DP Resources without exposing provider tokens or internal errors.
11. State mismatch/expired handoff fails closed.
12. `next` redirects cannot leave DP Resources.
13. Provider access tokens are not persisted in cookies, local storage or database rows.
14. GitHub requires a provider-verified email and Microsoft never uses email/UPN as an authorization credential.

## Production rollout checklist

Before the manual Render deployment:

1. Keep Render Auto-Deploy disabled.
2. Confirm `DP_AUTH_ORIGIN=https://dp.resources.anshgupta.cc` in Render.
3. Add the production Google, GitHub and Microsoft client IDs/secrets to Render.
4. Add a dedicated `DP_SOCIAL_AUTH_SECRET` to Render and keep it private.
5. Confirm each provider registration contains the exact production callback listed above.
6. Confirm Google branding/consent is published for intended users, GitHub app metadata is correct, and Microsoft branding uses the DP Resources-owned tenant and `anshgupta.cc` publisher domain.
7. Verify the social-auth database migration is already present and the two identity tables remain service-role-only.
8. Pull the final `main` commit into Replit and repeat login, signup, same-account linking, unlink protection and suspended-account tests.
9. Require green CI: install, typecheck, full tests, lint, production build, client-bundle secret scan, and high-severity production dependency audit.
10. Only after explicit approval, manually promote the exact verified `main` SHA to Render and verify the deployed SHA.

## Later phases

- TOTP authenticator MFA and stronger verification for sensitive account operations.
- Session/device management and sign-out controls.
- ManageBac/Faria SSO only after partner/SSO credentials and terms are confirmed, without showing a placeholder before it is real.
