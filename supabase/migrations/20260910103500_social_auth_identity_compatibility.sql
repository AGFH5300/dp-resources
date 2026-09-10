-- Allow trusted OAuth providers to create auth.users before a DP Resources
-- username/full name has been chosen. Email/password signups keep the existing
-- strict metadata requirements. Profile rows remain fully validated by
-- dp_identity_enforce_profile when social users finish onboarding.

create or replace function public.dp_identity_enforce_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reason text;
  auth_provider text;
  metadata_username text;
  metadata_full_name text;
begin
  auth_provider := coalesce(nullif(new.raw_app_meta_data->>'provider', ''), 'email');
  metadata_username := new.raw_user_meta_data->>'username';
  metadata_full_name := new.raw_user_meta_data->>'full_name';

  if auth_provider = 'email' then
    reason := public.dp_identity_validate_username(metadata_username);
    if reason is not null then
      raise exception 'identity_not_allowed' using errcode = '23514';
    end if;

    reason := public.dp_identity_validate_full_name(metadata_full_name);
    if reason is not null then
      raise exception 'identity_not_allowed' using errcode = '23514';
    end if;
  else
    -- OAuth providers create auth.users before DP Resources gets a chance to
    -- ask for its own username. Validate provider-supplied/user-supplied values
    -- when present, but do not require them until the profile row is created.
    if metadata_username is not null and length(trim(metadata_username)) > 0 then
      reason := public.dp_identity_validate_username(metadata_username);
      if reason is not null then
        raise exception 'identity_not_allowed' using errcode = '23514';
      end if;
    end if;

    if metadata_full_name is not null and length(trim(metadata_full_name)) > 0 then
      reason := public.dp_identity_validate_full_name(metadata_full_name);
      if reason is not null then
        raise exception 'identity_not_allowed' using errcode = '23514';
      end if;
    end if;
  end if;

  -- Every account, including OAuth accounts, must still have an acceptable
  -- email local part. Disposable-domain policy is enforced by the app before a
  -- new social profile can be completed.
  reason := public.dp_identity_validate_email_local_part(new.email);
  if reason is not null then
    raise exception 'identity_not_allowed' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.dp_identity_enforce_auth_user()
  from public, anon, authenticated;
