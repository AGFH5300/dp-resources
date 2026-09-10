'use client';

import {
  AlertCircle,
  Bell,
  BookOpenCheck,
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Mail,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Spinner } from '@/components/ui/spinner';
import {
  DEFAULT_ACCOUNT_PREFERENCES,
  normalizeAccountPreferences,
  type AccountPreferences,
} from '@/lib/account-settings';
import { publishAccountPreferences } from '@/lib/account-preferences-client';

type AccountSettingsPayload = {
  profile: {
    username: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
  preferences: AccountPreferences;
};

type AvailabilityResponse = {
  status?: 'available' | 'unavailable' | 'invalid' | 'error';
  available?: boolean;
  reason?: string;
  message?: string;
};

type UsernameCheckState = {
  status:
    | 'current'
    | 'typing'
    | 'checking'
    | 'available'
    | 'invalid'
    | 'unavailable'
    | 'error';
  message: string | null;
};

type TabId = 'profile' | 'preferences' | 'security';

const tabs: Array<{
  id: TabId;
  label: string;
  description: string;
  icon: typeof UserRound;
}> = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Name, username and avatar',
    icon: UserRound,
  },
  {
    id: 'preferences',
    label: 'Preferences',
    description: 'Sources and notifications',
    icon: Settings2,
  },
  {
    id: 'security',
    label: 'Security & privacy',
    description: 'Email, password and privacy',
    icon: ShieldCheck,
  },
];

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;
const USERNAME_EDGE_UNDERSCORE_PATTERN = /^_|_$/;
const USERNAME_REPEATED_UNDERSCORE_PATTERN = /__/;
const USERNAME_DEBOUNCE_MS = 600;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const fieldClass =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-950';

function initials(name: string, username: string) {
  const source = name.trim() || username.trim() || 'DP';
  return (
    source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'DP'
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
      <h2 className="text-lg font-semibold text-[color:var(--dp-navy)] dark:text-slate-100">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
        {description}
      </p>
    </div>
  );
}

function SaveButton({
  busy,
  disabled = false,
  children = 'Save changes',
}: {
  busy: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[color:var(--dp-navy)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Check className="size-4" />
      )}
      {busy ? 'Saving…' : children}
    </button>
  );
}

function PreferenceSwitch({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </p>
        <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
          checked ? 'bg-blue-700' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function SettingsCentre() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [data, setData] = useState<AccountSettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheckState>({
    status: 'current',
    message: null,
  });
  const [preferences, setPreferences] = useState<AccountPreferences>(
    DEFAULT_ACCOUNT_PREFERENCES,
  );
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const originalUsernameRef = useRef('');
  const usernameRequestId = useRef(0);
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (usernameDebounceRef.current) {
        clearTimeout(usernameDebounceRef.current);
      }
    };
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const response = await fetch('/api/account/settings', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const payload = (await response.json().catch(() => null)) as
        | AccountSettingsPayload
        | { error?: string }
        | null;
      if (!response.ok || !payload || !('profile' in payload)) {
        throw new Error(
          payload && 'error' in payload ? payload.error : 'Unable to load settings.',
        );
      }

      setData(payload);
      setDisplayName(payload.profile.displayName);
      setUsername(payload.profile.username);
      originalUsernameRef.current = payload.profile.username;
      setUsernameCheck({ status: 'current', message: null });

      const nextPreferences = normalizeAccountPreferences(payload.preferences);
      setPreferences(nextPreferences);
      publishAccountPreferences(nextPreferences);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to load account settings.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function validateUsername(value: string, requestId: number) {
    const trimmed = value.trim();
    const current = originalUsernameRef.current.trim();

    if (trimmed.toLowerCase() === current.toLowerCase()) {
      if (requestId === usernameRequestId.current) {
        setUsernameCheck({ status: 'current', message: null });
      }
      return true;
    }

    if (
      !USERNAME_PATTERN.test(trimmed) ||
      USERNAME_EDGE_UNDERSCORE_PATTERN.test(trimmed) ||
      USERNAME_REPEATED_UNDERSCORE_PATTERN.test(trimmed)
    ) {
      if (requestId === usernameRequestId.current) {
        setUsernameCheck({
          status: 'invalid',
          message: 'Use 3-24 characters: letters, numbers, or underscore.',
        });
      }
      return false;
    }

    setUsernameCheck({ status: 'checking', message: null });

    try {
      const response = await fetch(
        `/api/auth/availability?type=username&value=${encodeURIComponent(trimmed)}`,
        { cache: 'no-store', credentials: 'same-origin' },
      );
      const payload = (await response.json().catch(() => ({}))) as AvailabilityResponse;

      if (requestId !== usernameRequestId.current) return false;

      const message =
        payload.reason || payload.message || 'Could not validate username right now.';

      if (!response.ok || payload.status === 'error') {
        setUsernameCheck({ status: 'error', message });
        return false;
      }

      if (payload.status === 'invalid') {
        setUsernameCheck({ status: 'invalid', message });
        return false;
      }

      if (!payload.available || payload.status === 'unavailable') {
        setUsernameCheck({
          status: 'unavailable',
          message: message || 'That username is already taken.',
        });
        return false;
      }

      setUsernameCheck({
        status: 'available',
        message: payload.message || 'Username is available.',
      });
      return true;
    } catch {
      if (requestId !== usernameRequestId.current) return false;
      setUsernameCheck({
        status: 'error',
        message: 'Could not validate username right now.',
      });
      return false;
    }
  }

  function handleUsernameChange(value: string) {
    setUsername(value);
    usernameRequestId.current += 1;
    const requestId = usernameRequestId.current;

    if (usernameDebounceRef.current) {
      clearTimeout(usernameDebounceRef.current);
      usernameDebounceRef.current = null;
    }

    if (
      value.trim().toLowerCase() === originalUsernameRef.current.trim().toLowerCase()
    ) {
      setUsernameCheck({ status: 'current', message: null });
      return;
    }

    setUsernameCheck({ status: 'typing', message: null });
    usernameDebounceRef.current = setTimeout(() => {
      void validateUsername(value, requestId);
    }, USERNAME_DEBOUNCE_MS);
  }

  function validateUsernameNow() {
    if (usernameDebounceRef.current) {
      clearTimeout(usernameDebounceRef.current);
      usernameDebounceRef.current = null;
    }
    usernameRequestId.current += 1;
    void validateUsername(username, usernameRequestId.current);
  }

  async function patchSettings(payload: Record<string, unknown>, label: string) {
    setSaving(label);
    try {
      const response = await fetch('/api/account/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as
        | (AccountSettingsPayload & { ok?: boolean })
        | { error?: string }
        | null;

      if (!response.ok || !result || !('profile' in result)) {
        if (label === 'profile' && response.status === 409) {
          setUsernameCheck({
            status: 'unavailable',
            message:
              result && 'error' in result && result.error
                ? result.error
                : 'That username is already taken.',
          });
        }
        throw new Error(
          result && 'error' in result ? result.error : 'Unable to save changes.',
        );
      }

      setData(result);
      if (label === 'profile') {
        setDisplayName(result.profile.displayName);
        setUsername(result.profile.username);
        originalUsernameRef.current = result.profile.username;
        setUsernameCheck({ status: 'current', message: null });
      }

      const nextPreferences = normalizeAccountPreferences(result.preferences);
      setPreferences(nextPreferences);
      publishAccountPreferences(nextPreferences);
      window.dispatchEvent(new Event('dp:profile-changed'));
      toast.success('Settings saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save changes.');
    } finally {
      setSaving(null);
    }
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;

    if (!AVATAR_TYPES.has(file.type)) {
      toast.error('Use a JPG, PNG, or WebP image.');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }
    if (file.size < 1 || file.size > AVATAR_MAX_BYTES) {
      toast.error('Profile images must be 2 MB or smaller.');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    setSaving('avatar');
    try {
      const response = await fetch('/api/account/avatar', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        credentials: 'same-origin',
        body: file,
      });
      const result = (await response.json().catch(() => null)) as
        | { avatarUrl?: string | null; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to upload profile image.');
      }

      setData((current) =>
        current
          ? {
              ...current,
              profile: {
                ...current.profile,
                avatarUrl: result?.avatarUrl || null,
              },
            }
          : current,
      );
      window.dispatchEvent(new Event('dp:profile-changed'));
      toast.success('Profile image updated.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to upload profile image.',
      );
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      setSaving(null);
    }
  }

  async function removeAvatar() {
    setSaving('avatar');
    try {
      const response = await fetch('/api/account/avatar', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to remove profile image.');
      }
      setData((current) =>
        current
          ? { ...current, profile: { ...current.profile, avatarUrl: null } }
          : current,
      );
      window.dispatchEvent(new Event('dp:profile-changed'));
      toast.success('Profile image removed.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to remove profile image.',
      );
    } finally {
      setSaving(null);
    }
  }

  async function changeEmail(event: React.FormEvent) {
    event.preventDefault();
    setSaving('email');
    try {
      const response = await fetch('/api/account/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'change_email',
          email: newEmail,
          currentPassword: emailPassword,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; confirmationRequired?: boolean; email?: string }
        | null;
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to update email.');
      }
      if (result?.confirmationRequired) {
        toast.success('Check your email to confirm the new address.');
      } else {
        toast.success('Email address updated.');
        await loadSettings();
      }
      setNewEmail('');
      setEmailPassword('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update email.');
    } finally {
      setSaving(null);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('The new passwords do not match.');
      return;
    }

    setSaving('password');
    try {
      const response = await fetch('/api/account/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'change_password',
          currentPassword,
          password: newPassword,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to update password.');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to update password.',
      );
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[26rem] items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Loading your account…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Your account settings could not be loaded.
        </p>
        <button
          type="button"
          onClick={() => void loadSettings()}
          className="mt-4 rounded-md bg-[color:var(--dp-navy)] px-4 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  const usernameHasError =
    usernameCheck.status === 'invalid' ||
    usernameCheck.status === 'unavailable' ||
    usernameCheck.status === 'error';
  const usernameIsChecking = usernameCheck.status === 'checking';
  const usernameIsAvailable = usernameCheck.status === 'available';
  const profileCanSave =
    displayName.trim().length > 0 &&
    username.trim().length > 0 &&
    (usernameCheck.status === 'current' || usernameCheck.status === 'available');

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="h-fit rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950 lg:sticky lg:top-20">
        <nav
          aria-label="Account settings sections"
          className="grid gap-1 sm:grid-cols-3 lg:grid-cols-1"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-start gap-3 rounded-lg px-3 py-3 text-left transition ${
                  active
                    ? 'bg-blue-50 text-blue-950 dark:bg-blue-950/60 dark:text-blue-100'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900'
                }`}
              >
                <Icon className="mt-0.5 size-4.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{tab.label}</span>
                  <span className="mt-0.5 hidden text-xs opacity-70 lg:block">
                    {tab.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/40 p-5 dark:border-slate-800 dark:bg-slate-900/40 sm:p-6">
        {activeTab === 'profile' && (
          <div>
            <SectionHeading
              title="Profile"
              description="Choose how your identity appears inside DP Resources."
            />

            <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative size-24 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-blue-50 dark:border-slate-700 dark:bg-blue-950">
                {data.profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.profile.avatarUrl}
                    alt="Your profile"
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-2xl font-semibold text-blue-800 dark:text-blue-200">
                    {initials(displayName, username)}
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Profile picture
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  JPG, PNG or WebP. Maximum 2 MB.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    className="sr-only"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      void uploadAvatar(event.target.files?.[0])
                    }
                  />
                  <button
                    type="button"
                    disabled={saving === 'avatar'}
                    onClick={() => avatarInputRef.current?.click()}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    {saving === 'avatar' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Camera className="size-4" />
                    )}
                    Upload image
                  </button>
                  {data.profile.avatarUrl && (
                    <button
                      type="button"
                      disabled={saving === 'avatar'}
                      onClick={() => void removeAvatar()}
                      className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="size-4" /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <form
              className="mt-7 grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!profileCanSave) return;
                void patchSettings(
                  { profile: { displayName, username: username.trim() } },
                  'profile',
                );
              }}
            >
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Display name
                </span>
                <input
                  className={fieldClass}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={120}
                  autoComplete="name"
                />
                <span className="text-xs text-slate-500">
                  Shown in your account interface.
                </span>
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Username
                </span>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
                    @
                  </span>
                  <input
                    className={`${fieldClass} pl-7 pr-10 ${
                      usernameIsAvailable
                        ? 'border-emerald-500'
                        : usernameHasError
                          ? 'border-red-500'
                          : ''
                    }`}
                    value={username}
                    onChange={(event) => handleUsernameChange(event.target.value)}
                    onBlur={validateUsernameNow}
                    maxLength={24}
                    autoComplete="username"
                    spellCheck={false}
                  />
                  <div className="pointer-events-none absolute right-2 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center">
                    {usernameIsChecking && (
                      <Spinner className="size-4 text-[#00152a] dark:text-slate-100" />
                    )}
                    {usernameIsAvailable && (
                      <CheckCircle2 className="size-4 text-[#0c7a43]" />
                    )}
                    {usernameHasError && (
                      <AlertCircle className="size-4 text-red-600" />
                    )}
                  </div>
                </div>
                {usernameIsAvailable ? (
                  <span className="text-xs text-emerald-700 dark:text-emerald-300">
                    {usernameCheck.message || 'Username is available.'}
                  </span>
                ) : usernameHasError ? (
                  <span className="text-xs text-red-700 dark:text-red-300">
                    {usernameCheck.message}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    3–24 letters, numbers or underscores. Availability is checked automatically.
                  </span>
                )}
              </label>

              <div className="flex justify-end">
                <SaveButton
                  busy={saving === 'profile'}
                  disabled={!profileCanSave || usernameIsChecking}
                />
              </div>
            </form>
          </div>
        )}

        {activeTab === 'preferences' && (
          <div>
            <SectionHeading
              title="Display & notification preferences"
              description="Control how source attribution appears and which account updates DP Resources surfaces to you."
            />

            <form
              className="mt-6 grid gap-7"
              onSubmit={(event) => {
                event.preventDefault();
                void patchSettings({ preferences }, 'preferences');
              }}
            >
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <BookOpenCheck className="size-4 text-blue-700 dark:text-blue-300" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Source labels
                  </h3>
                </div>
                <div className="grid gap-2">
                  <PreferenceSwitch
                    checked={preferences.showLibrarySourceTags}
                    onChange={(value) =>
                      setPreferences((current) => ({
                        ...current,
                        showLibrarySourceTags: value,
                      }))
                    }
                    title="Library source tags"
                    description="Show the source/provider badge on Library resources when attribution is applicable."
                  />
                  <PreferenceSwitch
                    checked={preferences.showLibraryResourceTypeLabels}
                    onChange={(value) =>
                      setPreferences((current) => ({
                        ...current,
                        showLibraryResourceTypeLabels: value,
                      }))
                    }
                    title="Library resource-type labels"
                    description="Show labels such as textbook, notes or past paper beside Library resources."
                  />
                  <PreferenceSwitch
                    checked={preferences.showQuestionBankSourceTags}
                    onChange={(value) =>
                      setPreferences((current) => ({
                        ...current,
                        showQuestionBankSourceTags: value,
                      }))
                    }
                    title="Question Bank source tags"
                    description="Show source badges on Question Bank questions and question history cards."
                  />
                  <PreferenceSwitch
                    checked={preferences.showExpandedSourceAttribution}
                    onChange={(value) =>
                      setPreferences((current) => ({
                        ...current,
                        showExpandedSourceAttribution: value,
                      }))
                    }
                    title="Expanded source attribution"
                    description="Show the expandable source-information section beneath questions when available."
                  />
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Bell className="size-4 text-blue-700 dark:text-blue-300" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Notifications & updates
                  </h3>
                </div>
                <div className="grid gap-2">
                  <PreferenceSwitch
                    checked={preferences.supportNotifications}
                    onChange={(value) =>
                      setPreferences((current) => ({
                        ...current,
                        supportNotifications: value,
                      }))
                    }
                    title="Support ticket notifications"
                    description="Show replies and status changes for your support requests in the notification centre."
                  />
                  <PreferenceSwitch
                    checked={preferences.showWhatsNew}
                    onChange={(value) =>
                      setPreferences((current) => ({
                        ...current,
                        showWhatsNew: value,
                      }))
                    }
                    title="Show What’s new after releases"
                    description="Automatically open the release highlights once after a new DP Resources update. You can still open What’s new manually from your account menu."
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <SaveButton busy={saving === 'preferences'} />
              </div>
            </form>
          </div>
        )}

        {activeTab === 'security' && (
          <div>
            <SectionHeading
              title="Security & privacy"
              description="Sensitive account changes require your current password."
            />

            <div className="mt-6 grid gap-6">
              <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 size-5 text-blue-700 dark:text-blue-300" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                      Email address
                    </h3>
                    <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">
                      Current email: {data.profile.email}
                    </p>
                    <form className="mt-4 grid gap-3" onSubmit={changeEmail}>
                      <input
                        type="text"
                        name="username"
                        value={data.profile.email}
                        autoComplete="username"
                        readOnly
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          New email
                        </span>
                        <input
                          className={fieldClass}
                          type="email"
                          value={newEmail}
                          onChange={(event) => setNewEmail(event.target.value)}
                          autoComplete="email"
                          required
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Current password
                        </span>
                        <input
                          className={fieldClass}
                          type="password"
                          value={emailPassword}
                          onChange={(event) => setEmailPassword(event.target.value)}
                          autoComplete="current-password"
                          required
                        />
                      </label>
                      <div className="flex justify-end">
                        <SaveButton busy={saving === 'email'}>Change email</SaveButton>
                      </div>
                    </form>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-start gap-3">
                  <LockKeyhole className="mt-0.5 size-5 text-blue-700 dark:text-blue-300" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                      Password
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Use at least 8 characters and choose a password you do not reuse elsewhere.
                    </p>
                    <form className="mt-4 grid gap-3" onSubmit={changePassword}>
                      <input
                        type="text"
                        name="username"
                        value={data.profile.email}
                        autoComplete="username"
                        readOnly
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Current password
                        </span>
                        <input
                          className={fieldClass}
                          type="password"
                          value={currentPassword}
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          autoComplete="current-password"
                          required
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            New password
                          </span>
                          <input
                            className={fieldClass}
                            type="password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            required
                          />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Confirm new password
                          </span>
                          <input
                            className={fieldClass}
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            required
                          />
                        </label>
                      </div>
                      <div className="flex justify-end">
                        <SaveButton busy={saving === 'password'}>
                          Change password
                        </SaveButton>
                      </div>
                    </form>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-5 text-emerald-700 dark:text-emerald-300" />
                  <div>
                    <h3 className="font-semibold text-emerald-950 dark:text-emerald-100">
                      Account privacy
                    </h3>
                    <p className="mt-1 text-sm leading-5 text-emerald-900/80 dark:text-emerald-200/80">
                      Your profile and preferences are account data, not a public profile. They are
                      used inside DP Resources and remain subject to the existing administrator access
                      needed to operate and secure the service.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
