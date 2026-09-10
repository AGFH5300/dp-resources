import { safeInternalReturnPath } from '@/lib/auth-redirect';
import { SITE_URL } from '@/lib/seo';
import {
  socialAuthModeFromInput,
  socialAuthProviderFromInput,
} from '@/lib/social-auth';
import { createClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

function callbackOrigin(request: NextRequest) {
  return process.env.NODE_ENV === 'production'
    ? SITE_URL
    : request.nextUrl.origin;
}

function socialFailureRedirect(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = callbackOrigin(request);
  const flow = searchParams.get('flow');
  const provider = socialAuthProviderFromInput(searchParams.get('provider'));
  const mode = socialAuthModeFromInput(searchParams.get('mode'));

  if (flow === 'link') {
    const target = new URL('/settings', origin);
    target.searchParams.set('social_error', 'link_failed');
    if (provider) target.searchParams.set('social_provider', provider.key);
    target.hash = 'connected-accounts';
    return NextResponse.redirect(target);
  }

  const target = new URL(
    mode === 'signup' ? '/auth/sign-up' : '/auth/login',
    origin,
  );
  target.searchParams.set('social_error', 'failed');
  if (provider) target.searchParams.set('social_provider', provider.key);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = callbackOrigin(request);
  const code = searchParams.get('code');
  const next = safeInternalReturnPath(searchParams.get('next'), '/library');
  const flow = searchParams.get('flow');
  const socialProvider = socialAuthProviderFromInput(searchParams.get('provider'));

  if (code) {
    const supabase = await createClient();
    const flowId = searchParams.get('sb_flow_id');
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );

    if (!error) {
      if (flow === 'link') {
        const target = new URL('/settings', origin);
        target.searchParams.set('linked', socialProvider?.key || 'provider');
        target.hash = 'connected-accounts';
        return NextResponse.redirect(target);
      }

      if (flow === 'social') {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id || !user.email) {
          return socialFailureRedirect(request);
        }

        const [{ data: membership }, { data: profile }] = await Promise.all([
          supabase
            .from('dp_resource_memberships')
            .select('is_suspended')
            .eq('id', user.id)
            .maybeSingle<{ is_suspended: boolean | null }>(),
          supabase
            .from('dp_resource_profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle<{ id: string }>(),
        ]);

        if (membership?.is_suspended) {
          return NextResponse.redirect(new URL('/account-suspended', origin));
        }

        if (!profile) {
          const target = new URL('/auth/finish-profile', origin);
          target.searchParams.set('next', next);
          if (socialProvider) {
            target.searchParams.set('provider', socialProvider.key);
          }
          return NextResponse.redirect(target);
        }
      }

      return NextResponse.redirect(new URL(next, origin));
    }

    console.error('Unable to exchange authentication code.', {
      flow,
      provider: socialProvider?.key || null,
      message: error.message,
    });
  }

  if (flow === 'social' || flow === 'link') {
    return socialFailureRedirect(request);
  }

  if (next === '/auth/update-password') {
    return NextResponse.redirect(
      new URL('/auth/forgot-password?error=invalid_link', origin),
    );
  }

  return NextResponse.redirect(new URL('/auth/login', origin));
}
