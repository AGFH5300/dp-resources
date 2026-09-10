# DP Resources Modern Sign-In setup

This document covers the infrastructure that must be configured before the social-auth feature is promoted to production. Do not store provider secrets in this repository.

## Target public identity

- Product/app name: `DP Resources`
- Website: `https://dp.resources.anshgupta.cc`
- Target Auth domain: `https://auth.dp.resources.anshgupta.cc`
- OAuth callback after the custom domain is active: `https://auth.dp.resources.anshgupta.cc/auth/v1/callback`

Supabase remains the underlying Auth service but should not be the user-facing application identity.

## Order of operations

1. Upgrade the Supabase organization/project to a plan that supports Custom Domains and add the Custom Domain add-on.
2. Add `auth.dp.resources.anshgupta.cc` as the Supabase custom domain.
3. Add the DNS ownership records Supabase provides, verify them, and activate the custom domain.
4. Keep the original `https://vwreomwieplqqdrmjcuc.supabase.co/auth/v1/callback` registered temporarily during the cutover. Add the branded callback before removing the old one.
5. Configure the production DP Resources URL as the Auth Site URL and keep the required callback/preview URLs in Supabase's redirect allow list.
6. Enable manual identity linking in Supabase Authentication provider configuration before exposing Connected Accounts.
7. Create and brand the provider applications below as `DP Resources`.
8. Enter provider credentials into Supabase Authentication -> Providers. Never put client secrets in GitHub or browser environment variables.
9. Apply `20260910103500_social_auth_identity_compatibility.sql` only when the social flow is ready for controlled testing.
10. Test each provider with a new user, an existing same-email user, explicit different-email linking, unlinking, suspension, and sign-out before production promotion.

## Google

Create a Google OAuth web application/consent configuration branded `DP Resources` with the DP Resources logo, homepage, privacy policy and terms. Register the active Supabase Auth callback URL. Configure its client ID and secret in Supabase's Google provider.

Expected user-facing provider identity: Google should present DP Resources as the application requesting authentication/consent. The provider controls the exact wording of its screen.

## Microsoft

Create a Microsoft Entra application registration named `DP Resources`. Configure the web redirect URI to the active Supabase Auth callback and enter the client ID/secret in Supabase's Azure provider. DP Resources explicitly requests the `email` scope in addition to the provider defaults.

## GitHub

Create a GitHub OAuth App named `DP Resources`, set the homepage to the production DP Resources website, and register the active Supabase Auth callback. Configure the client ID/secret in Supabase's GitHub provider.

## Apple

Configure Sign in with Apple for the web using an App ID, Services ID and signing key. The Services ID should represent DP Resources and use the active Auth domain/callback. Apple OAuth client secrets require periodic rotation; keep the signing key secure and track the rotation deadline. DP Resources intentionally asks first-time Apple social users to finish their local profile because Apple web OAuth does not reliably provide a reusable full name.

## Account-linking rules

- Supabase automatic identity linking is relied on only for identities with the same verified email address.
- Different-email providers are linked only after the user is already authenticated and explicitly chooses Connect in Settings.
- DP Resources never merges accounts based on display name or username similarity.
- A user cannot unlink their only remaining identity.
- Existing DP Resources profile rows are never overwritten merely because a new OAuth identity is attached.

## First-time social signup

A successful social authentication can create the underlying `auth.users` record before the user has chosen a DP Resources username. The compatibility migration keeps the existing strict validation for email/password signups while allowing trusted OAuth users to reach the one-time DP Resources profile-completion screen. Profile-row validation remains strict.

## Testing checklist

For each enabled provider, verify:

1. New user -> provider -> DP Resources profile completion -> Library.
2. Existing password user with the same verified email -> provider -> same existing DP Resources account and data.
3. Existing user -> Settings -> Connect provider using a different email -> same DP Resources user ID.
4. Disconnect provider when another identity exists.
5. Attempt to remove the last identity is blocked.
6. Suspended account cannot bypass suspension through social sign-in.
7. Cancelled/failed OAuth returns a generic DP Resources error without exposing secrets or internal provider errors.
8. `next` redirects cannot leave DP Resources.

## Later phases

- TOTP authenticator MFA and AAL2 enforcement for sensitive account operations.
- Session/device management and sign-out controls.
- ManageBac/Faria SSO after partner/SSO credentials and product terms are confirmed.
