'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CloseButton } from '@/components/ui/close-button';

type AdminAliasUser = {
  id: string;
  email: string;
  role: string;
  username: string | null;
  fullName: string | null;
  alias: string | null;
  aliasUpdatedAt: string | null;
};

const inputClass =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:border-slate-400';
const secondaryBtn =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const primaryBtn =
  'rounded-md border border-[color:var(--dp-blue)] bg-[color:var(--dp-blue)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60';

function normalized(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase();
}

function decorateAliases(users: AdminAliasUser[]) {
  const aliased = users.filter((user) => user.alias?.trim());
  const root = document.querySelector('main');
  if (!root || !aliased.length) return;

  root.querySelectorAll<HTMLElement>('[data-dp-admin-alias]').forEach((element) => {
    element.removeAttribute('data-dp-admin-alias');
    element.removeAttribute('data-dp-admin-alias-user');
    element.removeAttribute('title');
  });

  const candidates = root.querySelectorAll<HTMLElement>(
    'td,dd,a,button,h1,h2,h3,h4,p,span',
  );
  const claimedRows = new WeakSet<Element>();

  candidates.forEach((element) => {
    if (element.closest('[data-dp-admin-alias-manager="true"]')) return;
    if (element.children.length > 0) return;
    const text = normalized(element.textContent);
    if (!text) return;
    const user = aliased.find((candidate) => {
      const email = normalized(candidate.email);
      const username = candidate.username
        ? normalized(`@${candidate.username}`)
        : '';
      const fullName = normalized(candidate.fullName);
      return (
        text === email ||
        (username && text === username) ||
        (fullName && text === fullName) ||
        (email && text.includes(email))
      );
    });
    if (!user?.alias) return;

    const row = element.closest('tr');
    if (row && claimedRows.has(row)) return;
    if (row) claimedRows.add(row);

    element.dataset.dpAdminAlias = user.alias;
    element.dataset.dpAdminAliasUser = user.id;
    element.title = `Admin alias: ${user.alias}`;
  });
}

function AliasEditor({
  user,
  onSaved,
}: {
  user: AdminAliasUser;
  onSaved: (userId: string, alias: string | null) => void;
}) {
  const [value, setValue] = useState(user.alias || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(user.alias || ''), [user.alias]);

  async function save(nextAlias = value) {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/users/aliases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, alias: nextAlias.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof payload.error === 'string' ? payload.error : 'Could not save alias.',
        );
      const alias = typeof payload.alias === 'string' ? payload.alias : null;
      setValue(alias || '');
      onSaved(user.id, alias);
      toast.success(alias ? 'Admin alias saved.' : 'Admin alias cleared.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save alias.');
    } finally {
      setSaving(false);
    }
  }

  const changed = value.trim() !== (user.alias || '');
  return (
    <div className="flex min-w-[22rem] items-center gap-2">
      <input
        className={inputClass}
        value={value}
        maxLength={80}
        placeholder="Private admin alias"
        aria-label={`Private admin alias for ${user.email}`}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && changed && !saving) void save();
        }}
      />
      <button
        type="button"
        className={primaryBtn}
        disabled={saving || !changed}
        onClick={() => void save()}
      >
        Save
      </button>
      {user.alias ? (
        <button
          type="button"
          className={secondaryBtn}
          disabled={saving}
          onClick={() => void save('')}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

export function AdminUserAliasesBridge() {
  const searchParams = useSearchParams();
  const section = searchParams.get('section') || 'index';
  const [users, setUsers] = useState<AdminAliasUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/admin/users/aliases', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error('Could not load admin aliases.');
        setUsers(Array.isArray(payload.users) ? payload.users : []);
        setLoaded(true);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error('Could not load admin aliases.', error);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    let queued = false;
    const run = () => {
      queued = false;
      decorateAliases(users);
    };
    run();
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(run);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [loaded, users, section]);

  useEffect(() => {
    if (section !== 'users') setOpen(false);
  }, [section]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = normalized(query);
    if (!needle) return users;
    return users.filter((user) =>
      [user.alias, user.fullName, user.username, user.email, user.role]
        .map(normalized)
        .some((value) => value.includes(needle)),
    );
  }, [query, users]);

  function updateAlias(userId: string, alias: string | null) {
    setUsers((current) =>
      current.map((user) => (user.id === userId ? { ...user, alias } : user)),
    );
  }

  return (
    <>
      <style>{`
        [data-dp-admin-alias]::before {
          content: attr(data-dp-admin-alias) ' · ';
          font-weight: 700;
        }
      `}</style>

      {section === 'users' && loaded ? (
        <button
          type="button"
          className="fixed bottom-6 right-6 z-30 rounded-full border border-[color:var(--dp-blue)] bg-[color:var(--dp-blue)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-95"
          onClick={() => setOpen(true)}
        >
          Manage private aliases
        </button>
      ) : null}

      {open ? (
        <div
          data-dp-admin-alias-manager="true"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-alias-manager-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <h3
                  id="admin-alias-manager-title"
                  className="text-lg font-semibold text-[color:var(--dp-navy)]"
                >
                  Private user aliases
                </h3>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  Admin-only labels for recognising users quickly. They are stored
                  separately from user profiles and are never returned by member,
                  profile, settings or public APIs.
                </p>
              </div>
              <CloseButton label="Close alias manager" onClick={() => setOpen(false)} />
            </header>

            <div className="border-b border-slate-200 p-4">
              <input
                autoFocus
                className={inputClass}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search alias, name, username or email"
                aria-label="Search users to manage aliases"
              />
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3">User</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Private alias</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr key={user.id} className="border-t border-slate-100">
                      <td className="p-3">
                        <p className="font-semibold text-slate-800">
                          {user.fullName || user.alias || '—'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {user.username ? `@${user.username}` : 'No username'}
                        </p>
                      </td>
                      <td className="p-3 font-medium text-slate-700">{user.email}</td>
                      <td className="p-3 text-slate-600">{user.role}</td>
                      <td className="p-3">
                        <AliasEditor user={user} onSaved={updateAlias} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length ? (
                <p className="p-6 text-center text-sm text-slate-600">No users match this search.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
