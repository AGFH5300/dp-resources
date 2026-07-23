'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect as AdminSelect } from '@/components/ui/app-select';
import { CloseButton } from '@/components/ui/close-button';
import { EmailSearchInput } from '@/components/ui/email-search-input';
import { formatMimeType } from '@/lib/file-type-labels';
import {
  markNotificationCategory,
  NotificationBadge,
  useNotificationFeed,
} from '@/components/notification-center';
import type {
  ActivityLog,
  ResourceMembership,
  ResourceReport,
  SupportTicket,
} from '@/lib/types';

const statuses = ['open', 'in_review', 'resolved', 'closed'];
const statusOptions = [
  { value: '', label: 'Any status' },
  ...statuses.map((s) => ({ value: s, label: s.replace('_', ' ') })),
];
const caseStatusOptions = statuses.map((s) => ({
  value: s,
  label: s.replace('_', ' '),
}));
const pageSizeOptions = ['25', '50', '100'].map((v) => ({
  value: v,
  label: v,
}));
const inputClass =
  'mt-1 h-9 w-full rounded-md border border-slate-300 bg-[color:var(--dp-warm-surface)] px-3 text-sm text-slate-800 outline-none focus-visible:border-slate-400 focus-visible:bg-white';
const secondaryBtn =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const primaryBtn =
  'rounded-md border border-[color:var(--dp-blue)] bg-[color:var(--dp-blue)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60';

function badge(s: string) {
  const m: Record<string, string> = {
    open: 'bg-amber-50 text-amber-800 border-amber-200',
    in_review: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    resolved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    closed: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 text-xs font-medium capitalize ${m[s] || m.closed}`}
    >
      {s.replace('_', ' ')}
    </span>
  );
}
function sectionHref(sp: Record<string, string | undefined>, section: string) {
  return { query: { ...sp, section } };
}
function pager(
  base: Record<string, string | undefined>,
  key: string,
  page: number,
  total: number,
  per: number,
) {
  const pages = Math.max(1, Math.ceil(total / per));
  return (
    <div className="flex items-center justify-end gap-2 p-2 text-xs text-slate-500">
      <span>
        Page {page} of {pages}
      </span>
      {page > 1 && (
        <Link
          href={{ query: { ...base, [key]: String(page - 1) } }}
          className={secondaryBtn}
        >
          Previous
        </Link>
      )}
      {page < pages && (
        <Link
          href={{ query: { ...base, [key]: String(page + 1) } }}
          className={secondaryBtn}
        >
          Next
        </Link>
      )}
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      {children}
    </label>
  );
}
export function buildLiveParamsUrl(
  pathname: string,
  sp: Record<string, string | undefined>,
  section: string,
  patch: Record<string, string>,
  resetKeys: string[],
) {
  const current = new URLSearchParams();
  Object.entries({ ...sp, section }).forEach(([k, v]) => {
    if (v) current.set(k, v);
  });
  let changed = false;
  Object.entries(patch).forEach(([k, v]) => {
    const next = v || '';
    const prev = current.get(k) || '';
    if (next !== prev) changed = true;
  });
  if (!changed) return null;
  const q = new URLSearchParams(current);
  Object.entries(patch).forEach(([k, v]) => (v ? q.set(k, v) : q.delete(k)));
  resetKeys.forEach((k) => q.set(k, '1'));
  const query = q.toString();
  return query ? `${pathname}?${query}` : pathname;
}
function useLiveParams(
  sp: Record<string, string | undefined>,
  section: string,
) {
  const router = useRouter();
  const pathname = usePathname();
  return (patch: Record<string, string>, resetKeys: string[]) => {
    const nextUrl = buildLiveParamsUrl(pathname, sp, section, patch, resetKeys);
    if (!nextUrl) return;
    const currentUrl = `${pathname}${window.location.search}`;
    if (nextUrl === currentUrl) return;
    router.replace(nextUrl);
  };
}
function LiveFilters({
  prefix,
  sp,
  section,
}: {
  prefix: string;
  sp: Record<string, string | undefined>;
  section: string;
}) {
  const apply = useLiveParams(sp, section);
  const [email, setEmail] = useState(sp[`${prefix}Email`] || ''),
    [search, setSearch] = useState(sp[`${prefix}Search`] || '');
  useEffect(() => {
    const t = setTimeout(
      () =>
        apply({ [`${prefix}Email`]: email, [`${prefix}Search`]: search }, [
          `${prefix}Page`,
        ]),
      300,
    );
    return () => clearTimeout(t);
  }, [email, search]);
  return (
    <div className="mb-3 mt-3 grid gap-3 md:grid-cols-6">
      <Field label="Status">
        <AdminSelect
          value={sp[`${prefix}Status`] || ''}
          onValueChange={(v) =>
            apply({ [`${prefix}Status`]: v }, [`${prefix}Page`])
          }
          options={statusOptions}
        />
      </Field>
      <EmailSearchInput
        label="Reporter email"
        value={email}
        onChange={setEmail}
      />
      <Field label={prefix === 'report' ? 'Resource / path' : 'Subject'}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="From date">
        <input
          type="date"
          value={sp[`${prefix}From`] || ''}
          onChange={(e) =>
            apply({ [`${prefix}From`]: e.target.value }, [`${prefix}Page`])
          }
          className={inputClass}
        />
      </Field>
      <Field label="To date">
        <input
          type="date"
          value={sp[`${prefix}To`] || ''}
          onChange={(e) =>
            apply({ [`${prefix}To`]: e.target.value }, [`${prefix}Page`])
          }
          className={inputClass}
        />
      </Field>
      <button
        type="button"
        onClick={() =>
          apply(
            {
              [`${prefix}Status`]: '',
              [`${prefix}Email`]: '',
              [`${prefix}Search`]: '',
              [`${prefix}From`]: '',
              [`${prefix}To`]: '',
            },
            [`${prefix}Page`],
          )
        }
        className="self-end text-left text-sm font-medium text-[color:var(--dp-blue)]"
      >
        Clear filters
      </button>
    </div>
  );
}
function UserFilters({
  sp,
  sizes,
}: {
  sp: Record<string, string | undefined>;
  sizes: any;
}) {
  const apply = useLiveParams(sp, 'users');
  const [email, setEmail] = useState(sp.userEmail || '');
  useEffect(() => {
    const t = setTimeout(() => apply({ userEmail: email }, ['userPage']), 300);
    return () => clearTimeout(t);
  }, [email]);
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-4">
      <EmailSearchInput label="User email" value={email} onChange={setEmail} />
      <Field label="Role">
        <AdminSelect
          value={sp.role || ''}
          onValueChange={(v) => apply({ role: v }, ['userPage'])}
          options={[
            { value: '', label: 'Any role' },
            { value: 'user', label: 'user' },
            { value: 'admin', label: 'admin' },
          ]}
        />
      </Field>
      <Field label="Results per page">
        <AdminSelect
          value={String(sizes.user)}
          onValueChange={(v) => apply({ userSize: v }, ['userPage'])}
          options={pageSizeOptions}
        />
      </Field>
      <button
        type="button"
        onClick={() =>
          apply({ userEmail: '', role: '', userSize: '' }, ['userPage'])
        }
        className="self-end text-left text-sm font-medium text-[color:var(--dp-blue)]"
      >
        Clear filters
      </button>
    </div>
  );
}
function ActivityFilters({ sp }: { sp: Record<string, string | undefined> }) {
  const apply = useLiveParams(sp, 'activity');
  const [email, setEmail] = useState(sp.email || ''),
    [file, setFile] = useState(sp.file || '');
  useEffect(() => {
    const t = setTimeout(() => apply({ email, file }, ['activityPage']), 300);
    return () => clearTimeout(t);
  }, [email, file]);
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-6">
      <EmailSearchInput label="User email" value={email} onChange={setEmail} />
      <Field label="Resource">
        <input
          value={file}
          onChange={(e) => setFile(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Activity">
        <AdminSelect
          value={sp.action || ''}
          onValueChange={(v) => apply({ action: v }, ['activityPage'])}
          options={[
            { value: '', label: 'Any activity' },
            { value: 'folder_opened', label: 'Opened folder' },
            { value: 'file_opened', label: 'Opened file' },
            { value: 'download_started', label: 'Started download' },
          ]}
        />
      </Field>
      <Field label="From date">
        <input
          type="date"
          value={sp.from || ''}
          onChange={(e) => apply({ from: e.target.value }, ['activityPage'])}
          className={inputClass}
        />
      </Field>
      <Field label="To date">
        <input
          type="date"
          value={sp.to || ''}
          onChange={(e) => apply({ to: e.target.value }, ['activityPage'])}
          className={inputClass}
        />
      </Field>
      <button
        type="button"
        onClick={() =>
          apply({ email: '', file: '', action: '', from: '', to: '' }, [
            'activityPage',
          ])
        }
        className="self-end text-left text-sm font-medium text-[color:var(--dp-blue)]"
      >
        Clear filters
      </button>
    </div>
  );
}
function CaseInspector({
  kind,
  item,
  admins,
  onClose,
}: {
  kind: 'report' | 'ticket';
  item: ResourceReport | SupportTicket;
  admins: ResourceMembership[];
  onClose: () => void;
}) {
  const router = useRouter();
  const isReport = kind === 'report';
  const report = isReport ? (item as ResourceReport) : null;
  const reportedQuestionHref =
    report?.resource_path?.startsWith('/question-bank/')
      ? report.resource_path
      : null;
  const [draft, setDraft] = useState<any>({
    status: item.status,
    assigned_to: (item as any).assigned_to || '',
    internal_notes: (item as any).internal_notes || '',
    ...(isReport
      ? { resolution_note: (item as ResourceReport).resolution_note || '' }
      : {}),
  });
  const [saving, setSaving] = useState(false),
    [err, setErr] = useState('');
  const [reply, setReply] = useState('');
  const [messages, setMessages] = useState<any[]>((item as any).messages || []);
  async function save(final?: string) {
    setSaving(true);
    setErr('');
    const status = final || draft.status;
    const res = await fetch(
      `/api/admin/${kind === 'report' ? 'reports' : 'support'}/${item.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          status,
          assigned_to: draft.assigned_to || null,
        }),
      },
    );
    const json = await res
      .json()
      .catch(() => ({ error: 'Could not update case' }));
    setSaving(false);
    if (!res.ok) {
      setErr(json.error || 'Could not update case');
      toast.error(
        kind === 'report'
          ? 'Could not update report'
          : 'Could not update support ticket',
      );
      return;
    }
    toast.success(
      kind === 'report' ? 'Report updated' : 'Support ticket updated',
    );
    setDraft({ ...draft, status });
    router.refresh();
  }
  async function sendReply(visibility: 'user' | 'internal' = 'user') {
    if (!reply.trim()) return;
    setSaving(true);
    setErr('');
    const res = await fetch(`/api/admin/support/${item.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: reply, visibility }),
    });
    const json = await res
      .json()
      .catch(() => ({ error: 'Could not send reply' }));
    setSaving(false);
    if (!res.ok) {
      setErr(json.error || 'Could not send reply');
      toast.error('Could not send reply');
      return;
    }
    setMessages((prev) => [...prev, json.message]);
    setReply('');
    toast.success(visibility === 'user' ? 'Reply sent' : 'Internal note saved');
    router.refresh();
  }
  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full overflow-auto border-l border-slate-200 bg-white shadow-xl md:top-[72px] md:w-[420px]">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {isReport ? 'Resource report' : 'Support ticket'}
          </p>
          <h3 className="text-lg font-semibold text-[color:var(--dp-navy)]">
            {isReport
              ? (item as ResourceReport).resource_name || 'Resource report'
              : (item as SupportTicket).subject}
          </h3>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="p-5">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium">
              {isReport ? 'Resource path' : 'Category'}
            </dt>
            <dd className="text-slate-600">
              {isReport
                ? (item as ResourceReport).resource_path || '—'
                : (item as SupportTicket).category}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Reporter</dt>
            <dd className="text-slate-600">{item.reporter_email}</dd>
          </div>
          <div>
            <dt className="font-medium">Submitted</dt>
            <dd className="text-slate-600">
              {new Date(item.created_at).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Assigned admin</dt>
            <dd className="text-slate-600">
              {(item as any).assigned_to
                ? admins.find((a) => a.id === (item as any).assigned_to)
                    ?.email || 'Assigned'
                : 'Unassigned'}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Original message</dt>
            <dd className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-slate-700">
              {item.message}
            </dd>
          </div>
        </dl>
        {!isReport && (
          <section className="mt-4">
            <h4 className="text-sm font-semibold">Visible conversation</h4>
            <div className="mt-2 space-y-2">
              {messages
                .filter((m) => m.visibility !== 'internal')
                .map((m) => (
                  <div
                    key={m.id}
                    className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm"
                  >
                    <b>Admin reply</b>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
            </div>
          </section>
        )}
        {isReport && (report?.drive_file_id || reportedQuestionHref) && (
          <div className="mt-4">
            <Link
              target="_blank"
              href={
                report?.drive_file_id
                  ? `/resource/${report.drive_file_id}`
                  : reportedQuestionHref!
              }
              className={secondaryBtn}
            >
              {report?.drive_file_id
                ? 'Open resource in new tab'
                : 'Open reported question'}
            </Link>
          </div>
        )}
        <div className="mt-4 grid gap-3">
          <Field label="Status">
            <AdminSelect
              disabled={saving}
              value={draft.status}
              onValueChange={(v) => setDraft({ ...draft, status: v })}
              options={caseStatusOptions}
            />
          </Field>
          <Field label="Assign to">
            <AdminSelect
              disabled={saving}
              value={draft.assigned_to || 'unassigned'}
              onValueChange={(v) =>
                setDraft({ ...draft, assigned_to: v === 'unassigned' ? '' : v })
              }
              options={[
                { value: 'unassigned', label: 'Unassigned' },
                ...admins.map((a) => ({ value: a.id, label: a.email })),
              ]}
            />
          </Field>
          <label className="text-xs font-semibold text-slate-600">
            Internal notes
            <textarea
              disabled={saving}
              value={draft.internal_notes}
              onChange={(e) =>
                setDraft({ ...draft, internal_notes: e.target.value })
              }
              className={`${inputClass} min-h-24 py-2`}
            />
          </label>
          {isReport && (
            <label className="text-xs font-semibold text-slate-600">
              Resolution note
              <textarea
                disabled={saving}
                value={draft.resolution_note}
                onChange={(e) =>
                  setDraft({ ...draft, resolution_note: e.target.value })
                }
                className={`${inputClass} min-h-20 py-2`}
              />
            </label>
          )}
          {!isReport && (
            <label className="text-xs font-semibold text-slate-600">
              User-visible reply
              <textarea
                disabled={saving}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                className={`${inputClass} min-h-20 py-2`}
              />
            </label>
          )}
          {err && (
            <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">
              {err}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!isReport && (
              <button
                disabled={saving || !reply.trim()}
                onClick={() => sendReply('user')}
                className={primaryBtn}
              >
                Send reply
              </button>
            )}
            <button
              disabled={saving}
              onClick={() => save()}
              className={primaryBtn}
            >
              Save changes
            </button>
            <button
              disabled={saving}
              onClick={() => save('in_review')}
              className={secondaryBtn}
            >
              Mark in review
            </button>
            <button
              disabled={saving}
              onClick={() => save('resolved')}
              className={secondaryBtn}
            >
              Mark resolved
            </button>
            <button
              disabled={saving}
              onClick={() => save('closed')}
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
            >
              Close case
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
function fmtSeconds(v: number) {
  if (!v) return '0 sec';
  if (v < 60) return `${v} sec`;
  if (v < 3600) return `${Math.round(v / 60)} min`;
  const h = Math.floor(v / 3600),
    m = Math.round((v % 3600) / 60);
  return `${h} hr${m ? ` ${m} min` : ''}`;
}

export type DomainPolicyStatus = {
  allowed: boolean | null;
  matched_domain: string | null;
  error?: string | null;
};
function domainFromEmail(email: string) {
  return email.toLowerCase().split('@').pop() ?? '';
}
function domainPolicyMessage(policy: DomainPolicyStatus | undefined) {
  if (!policy || policy.error)
    return 'Domain policy could not be verified. Only the individual account can be suspended right now.';
  if (policy.allowed === true && policy.matched_domain)
    return 'This domain has an explicit allow rule and cannot be blocked. Only the individual account will be suspended.';
  if (policy.allowed === false && policy.matched_domain)
    return 'This email domain is already blocked.';
  return null;
}
function domainPolicyBlocksCheckbox(policy: DomainPolicyStatus | undefined) {
  return (
    !policy ||
    Boolean(policy.error) ||
    (policy.matched_domain !== null &&
      (policy.allowed === true || policy.allowed === false))
  );
}
function UserSuspensionControls({
  user,
  currentAdminId,
  domainPolicy,
}: {
  user: ResourceMembership;
  currentAdminId: string;
  domainPolicy?: DomainPolicyStatus;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [blockDomain, setBlockDomain] = useState(false);
  const [busy, setBusy] = useState(false);
  const domain = domainFromEmail(user.email);
  const checkboxDisabled = domainPolicyBlocksCheckbox(domainPolicy);
  const policyMessage = domainPolicyMessage(domainPolicy);
  const canSuspend =
    user.id !== currentAdminId && user.role !== 'admin' && !user.is_suspended;
  const canUnsuspend = user.role !== 'admin' && user.is_suspended;
  async function patchUser(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/suspension`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof result.error === 'string'
            ? result.error
            : 'Could not update suspension.',
        );
      toast.success(
        payload.suspended === false ? 'User unsuspended.' : 'User suspended.',
      );
      if (Array.isArray(result.warnings))
        result.warnings.forEach(
          (warning: unknown) =>
            typeof warning === 'string' && toast.warning(warning),
        );
      setOpen(false);
      setReason('');
      setBlockDomain(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not update suspension.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-64 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded border px-2 py-0.5 text-xs font-medium ${user.is_suspended ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
        >
          {user.is_suspended ? 'Suspended' : 'Active'}
        </span>
        {canSuspend ? (
          <button
            className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            onClick={() => setOpen(true)}
          >
            Suspend
          </button>
        ) : null}
        {canUnsuspend ? (
          <button
            className="rounded border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
            disabled={busy}
            onClick={() => {
              if (confirm(`Unsuspend ${user.email}?`))
                void patchUser({ suspended: false });
            }}
          >
            Unsuspend
          </button>
        ) : null}
      </div>
      {user.suspended_at ? (
        <p className="text-xs text-slate-500">
          Suspended {new Date(user.suspended_at).toLocaleString()}
        </p>
      ) : null}
      {user.suspension_reason ? (
        <p className="text-xs text-red-700">Reason: {user.suspension_reason}</p>
      ) : null}
      {open ? (
        <form
          className="space-y-2 rounded bg-slate-50 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void patchUser({
              suspended: true,
              reason,
              blockDomain: blockDomain && !checkboxDisabled,
            });
          }}
        >
          <label className="block text-xs font-semibold text-slate-600">
            Suspension reason
            <textarea
              className={`${inputClass} min-h-20 py-2`}
              value={reason}
              minLength={3}
              maxLength={500}
              required
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={blockDomain && !checkboxDisabled}
              disabled={checkboxDisabled}
              onChange={(event) => setBlockDomain(event.target.checked)}
            />
            Also block this email domain
          </label>
          {domain && policyMessage ? (
            <p className="text-xs text-amber-700">{policyMessage}</p>
          ) : domain ? (
            <p className="text-xs text-slate-500">
              The server will preserve any explicit allow rule for {domain}.
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
              disabled={busy}
            >
              Confirm suspension
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function AdminConsole({
  currentAdminId,
  sp,
  reports,
  tickets,
  memberships,
  domainPolicies = {},
  logs,
  usage = [],
  usageResource = null,
  usageUsers = [],
  usageUserResources = [],
  usageSelectedUser = null,
  diagnostics = [],
  counts,
  pages,
  sizes,
  indexPanel,
  configuredWarnings,
  exportQuery,
}: {
  sp: Record<string, string | undefined>;
  reports: ResourceReport[];
  tickets: SupportTicket[];
  memberships: ResourceMembership[];
  domainPolicies?: Record<string, DomainPolicyStatus>;
  logs: ActivityLog[];
  usage?: any[];
  usageResource?: any;
  usageUsers?: any[];
  usageUserResources?: any[];
  usageSelectedUser?: ResourceMembership | null;
  diagnostics?: any[];
  counts: any;
  pages: any;
  sizes: any;
  indexPanel: React.ReactNode;
  configuredWarnings: React.ReactNode;
  exportQuery: string;
  currentAdminId: string;
}) {
  const section = sp.section || 'index';
  const notificationFeed = useNotificationFeed(true);
  const [selected, setSelected] = useState<{
    kind: 'report' | 'ticket';
    item: any;
  } | null>(null);
  const admins = useMemo(
    () => memberships.filter((m) => m.role === 'admin'),
    [memberships],
  );
  useEffect(() => {
    if (section === 'reports') void markNotificationCategory('admin_reports');
    if (section === 'tickets') void markNotificationCategory('admin_tickets');
  }, [section]);
  useEffect(() => {
    const selectedId =
      section === 'reports'
        ? sp.reportId
        : section === 'tickets'
          ? sp.ticketId
          : null;
    if (!selectedId) return;
    const rows = section === 'reports' ? reports : tickets;
    const item = rows.find((row) => row.id === selectedId);
    if (item)
      setSelected({ kind: section === 'reports' ? 'report' : 'ticket', item });
  }, [reports, section, sp.reportId, sp.ticketId, tickets]);
  const tabs: Array<[string, string, number]> = [
    ['index', 'Library index', 0],
    ['question-bank', 'Question bank', 0],
    ['reports', 'Resource reports', notificationFeed.summary.adminReports],
    ['tickets', 'Support tickets', notificationFeed.summary.adminTickets],
    ['users', 'Users', 0],
    ['activity', 'Activity', 0],
    ['analytics', 'Usage analytics', 0],
    ['diagnostics', 'Diagnostics', 0],
  ];
  const activityLabel = (a: string) =>
    ({
      folder_opened: 'Opened folder',
      file_opened: 'Opened file',
      download_started: 'Started download',
    })[a] || a;
  return (
    <>
      <nav
        className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 text-sm"
        aria-label="Admin sections"
      >
        {tabs.map(([id, label, unread]) => (
          <Link
            key={id}
            href={id === 'question-bank' ? '/admin/question-bank' : sectionHref(sp, id)}
            className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 ${section === id ? 'bg-slate-100 font-semibold text-[color:var(--dp-navy)]' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {label}
            <NotificationBadge count={unread} />
          </Link>
        ))}
      </nav>
      {configuredWarnings}
      {section === 'index' && <section className="mt-5">{indexPanel}</section>}
      {section === 'reports' && (
        <section className="mt-5">
          <h2 className="text-base font-semibold">Resource reports</h2>
          <LiveFilters prefix="report" sp={sp} section="reports" />
          <QueueTable
            rows={reports}
            kind="report"
            onInspect={(item) => setSelected({ kind: 'report', item })}
          />
          {pager(sp, 'reportPage', pages.report, counts.report, sizes.page)}
        </section>
      )}
      {section === 'tickets' && (
        <section className="mt-5">
          <h2 className="text-base font-semibold">Support tickets</h2>
          <LiveFilters prefix="ticket" sp={sp} section="tickets" />
          <QueueTable
            rows={tickets}
            kind="ticket"
            onInspect={(item) => setSelected({ kind: 'ticket', item })}
          />
          {pager(sp, 'ticketPage', pages.ticket, counts.ticket, sizes.page)}
        </section>
      )}
      {section === 'users' && (
        <section className="mt-5">
          <h2 className="text-base font-semibold">Users</h2>
          <UserFilters sp={sp} sizes={sizes} />
          <div className="mt-3 overflow-x-auto border-y border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-2">Full name</th>
                  <th className="p-2">Username</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Joined</th>
                  <th className="p-2">Last activity</th>
                  <th className="p-2">Suspension</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap p-2 font-medium">
                      <Link
                        className="text-[color:var(--dp-blue)] hover:underline"
                        href={{
                          query: {
                            ...sp,
                            section: 'users',
                            userUsageId: u.id,
                            userUsageRange: sp.userUsageRange || 'all',
                          },
                        }}
                      >
                        {u.full_name || '—'}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap p-2 font-medium">
                      <Link
                        className="text-[color:var(--dp-blue)] hover:underline"
                        href={{
                          query: {
                            ...sp,
                            section: 'users',
                            userUsageId: u.id,
                            userUsageRange: sp.userUsageRange || 'all',
                          },
                        }}
                      >
                        {u.username ? `@${u.username}` : '—'}
                      </Link>
                    </td>
                    <td className="p-2 font-medium">
                      <Link
                        className="text-[color:var(--dp-blue)] hover:underline"
                        href={{
                          query: {
                            ...sp,
                            section: 'users',
                            userUsageId: u.id,
                            userUsageRange: sp.userUsageRange || 'all',
                          },
                        }}
                      >
                        {u.email}
                      </Link>
                    </td>
                    <td className="p-2">{u.role}</td>
                    <td className="p-2 text-slate-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-2 text-slate-500">
                      {(u as any).latest_activity_at
                        ? new Date(
                            (u as any).latest_activity_at,
                          ).toLocaleString()
                        : '—'}
                    </td>
                    <td className="p-2 align-top">
                      <UserSuspensionControls
                        user={u}
                        currentAdminId={currentAdminId}
                        domainPolicy={domainPolicies[domainFromEmail(u.email)]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pager(sp, 'userPage', pages.user, counts.user, sizes.user)}
          </div>
        </section>
      )}
      {section === 'activity' && (
        <section className="mt-5">
          <h2 className="text-base font-semibold">Activity</h2>
          <ActivityFilters sp={sp} />
          <a
            className="mt-3 inline-block text-sm font-medium text-[color:var(--dp-blue)]"
            href={`/api/admin/activity/export?${exportQuery}`}
          >
            Export CSV
          </a>
          <div className="mt-3 overflow-x-auto border-y border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-2">Time</th>
                  <th className="p-2">User</th>
                  <th className="p-2">Activity</th>
                  <th className="p-2">Resource</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100">
                    <td className="p-2 text-slate-500">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="p-2 font-medium">{log.user_email}</td>
                    <td className="p-2">{activityLabel(log.action)}</td>
                    <td className="p-2">{log.file_name || 'Resource'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pager(sp, 'activityPage', pages.activity, counts.activity, 50)}
          </div>
        </section>
      )}
      {section === 'analytics' && (
        <section className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                Resource usage leaderboard
              </h2>
              <p className="text-sm text-slate-600">
                Active viewing time only; not keystrokes, screen recording, or
                perfect study time.
              </p>
            </div>
            <div className="flex gap-2">
              {['today', '7d', '30d', 'all'].map((r) => (
                <Link
                  key={r}
                  href={{ query: { ...sp, section: 'analytics', range: r } }}
                  className={secondaryBtn}
                >
                  {r}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-3 overflow-x-auto border-y border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-2">Rank</th>
                  <th className="p-2">Resource name</th>
                  <th className="p-2">Subject/path</th>
                  <th className="p-2">File type</th>
                  <th className="p-2">Total active time</th>
                  <th className="p-2">Unique users</th>
                  <th className="p-2">Sessions</th>
                  <th className="p-2">Average/session</th>
                  <th className="p-2">Last used</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {usage.length ? (
                  usage.map((r: any) => (
                    <tr key={r.file_id} className="border-t border-slate-100">
                      <td className="p-2 font-semibold">{r.rank}</td>
                      <td className="p-2 font-medium">
                        <Link
                          className="text-[color:var(--dp-blue)]"
                          href={{
                            query: {
                              ...sp,
                              section: 'analytics',
                              range: sp.range || '30d',
                              resourceId: r.file_id,
                            },
                          }}
                        >
                          {r.resource_name}
                        </Link>
                      </td>
                      <td className="p-2 text-slate-600">{r.resource_path}</td>
                      <td className="whitespace-nowrap p-2">
                        {formatMimeType(r.mime_type, r.resource_name)}
                      </td>
                      <td className="p-2">
                        {fmtSeconds(Number(r.total_active_seconds))}
                      </td>
                      <td className="p-2">{r.unique_users}</td>
                      <td className="p-2">{r.session_count}</td>
                      <td className="p-2">
                        {fmtSeconds(Number(r.average_seconds_per_session))}
                      </td>
                      <td className="whitespace-nowrap p-2">
                        {r.last_used_at
                          ? new Date(r.last_used_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="p-2">
                        <div className="flex min-w-36 flex-wrap gap-2">
                          <Link
                            className="font-medium text-[color:var(--dp-blue)]"
                            target="_blank"
                            rel="noreferrer"
                            href={`/resource/${r.file_id}`}
                          >
                            Open preview
                          </Link>
                          <Link
                            className="font-medium text-[color:var(--dp-blue)]"
                            href={{
                              query: {
                                ...sp,
                                section: 'analytics',
                                range: sp.range || '30d',
                                resourceId: r.file_id,
                              },
                            }}
                          >
                            View stats
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={10}
                      className="p-6 text-center text-sm text-slate-600"
                    >
                      No usage data yet. Open a resource as an approved user and
                      wait at least one heartbeat interval.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {usageResource && (
            <ResourceUsageModal
              sp={sp}
              usageResource={usageResource}
              usageUsers={usageUsers}
              usageUserResources={usageUserResources}
            />
          )}
        </section>
      )}
      {section === 'diagnostics' && (
        <section className="mt-5">
          <h2 className="text-base font-semibold">Production diagnostics</h2>
          <p className="text-sm text-slate-600">
            Admin-only sanitized recent server errors.
          </p>
          <div className="mt-3 overflow-x-auto border-y border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <tbody>
                {diagnostics.map((d: any, i: number) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="p-2 text-slate-500">
                      {new Date(d.occurred_at).toLocaleString()}
                    </td>
                    <td className="p-2 font-medium">{d.area}</td>
                    <td className="p-2">{d.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {selected && (
        <CaseInspector
          kind={selected.kind}
          item={selected.item}
          admins={admins}
          onClose={() => setSelected(null)}
        />
      )}
      {section === 'users' && usageSelectedUser && (
        <UserUsageModal
          sp={sp}
          user={usageSelectedUser}
          resources={usageUserResources}
        />
      )}
    </>
  );
}

function UserUsageModal({
  sp,
  user,
  resources,
}: {
  sp: Record<string, string | undefined>;
  user: ResourceMembership;
  resources: any[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const closeQuery = {
    ...sp,
    section: 'users',
    userUsageId: undefined,
    userUsageRange: undefined,
  };
  const close = () => {
    const query = new URLSearchParams();
    Object.entries(closeQuery).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const suffix = query.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
  };
  const totalActiveSeconds = resources.reduce(
    (total, resource) => total + Number(resource.total_active_seconds || 0),
    0,
  );
  const totalSessions = resources.reduce(
    (total, resource) => total + Number(resource.session_count || 0),
    0,
  );
  const lastViewedAt = resources.reduce<string | null>(
    (latest, resource) =>
      !latest || (resource.last_used_at && resource.last_used_at > latest)
        ? resource.last_used_at
        : latest,
    null,
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-usage-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h3
              id="user-usage-modal-title"
              className="text-lg font-semibold text-[color:var(--dp-navy)]"
            >
              Resource analytics for{' '}
              {user.username ? `@${user.username}` : user.email}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {[user.full_name, user.email].filter(Boolean).join(' · ')}
            </p>
          </div>
          <CloseButton label="Close user resource analytics" onClick={close} />
        </header>
        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            {[
              ['today', 'Today'],
              ['7d', '7 days'],
              ['30d', '30 days'],
              ['all', 'All time'],
            ].map(([range, label]) => (
              <Link
                key={range}
                className={`${secondaryBtn} ${(sp.userUsageRange || 'all') === range ? 'border-[color:var(--dp-blue)] text-[color:var(--dp-blue)]' : ''}`}
                href={{
                  query: {
                    ...sp,
                    section: 'users',
                    userUsageId: user.id,
                    userUsageRange: range,
                  },
                }}
              >
                {label}
              </Link>
            ))}
          </div>
          <dl className="mt-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">Files viewed</dt>
              <dd className="font-semibold">{resources.length}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Total active time</dt>
              <dd className="font-semibold">
                {fmtSeconds(totalActiveSeconds)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Sessions</dt>
              <dd className="font-semibold">{totalSessions}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last viewed</dt>
              <dd className="font-semibold">
                {lastViewedAt ? new Date(lastViewedAt).toLocaleString() : '—'}
              </dd>
            </div>
          </dl>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            {resources.length ? (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Resource</th>
                    <th className="p-2">Subject/path</th>
                    <th className="p-2">Active time</th>
                    <th className="p-2">Sessions</th>
                    <th className="p-2">Last viewed</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((resource) => (
                    <tr
                      key={resource.file_id}
                      className="border-t border-slate-100"
                    >
                      <td className="p-2 font-medium">
                        {resource.resource_name}
                      </td>
                      <td className="p-2 text-slate-600">
                        {resource.resource_path || '—'}
                      </td>
                      <td className="whitespace-nowrap p-2">
                        {fmtSeconds(Number(resource.total_active_seconds))}
                      </td>
                      <td className="p-2">{resource.session_count}</td>
                      <td className="whitespace-nowrap p-2">
                        {resource.last_used_at
                          ? new Date(resource.last_used_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="p-2">
                        <Link
                          className="font-medium text-[color:var(--dp-blue)]"
                          href={`/resource/${resource.file_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open preview
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No resource views recorded for this user in this range.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceUsageModal({
  sp,
  usageResource,
  usageUsers,
  usageUserResources,
}: {
  sp: Record<string, string | undefined>;
  usageResource: any;
  usageUsers: any[];
  usageUserResources: any[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedUser = usageUsers.find((u: any) => u.user_id === sp.userId);
  const closeQuery = {
    ...sp,
    section: 'analytics',
    resourceId: undefined,
    userId: undefined,
  };
  const clearUserQuery = {
    ...sp,
    section: 'analytics',
    resourceId: usageResource.file_id,
    userId: undefined,
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const q = new URLSearchParams();
        Object.entries(closeQuery).forEach(([k, v]) => {
          if (v) q.set(k, v);
        });
        router.replace(`${pathname}?${q.toString()}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, pathname, sp.section, sp.range, sp.resourceId, sp.userId]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-usage-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          const q = new URLSearchParams();
          Object.entries(closeQuery).forEach(([k, v]) => {
            if (v) q.set(k, v);
          });
          router.replace(`${pathname}?${q.toString()}`);
        }
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h3
              id="resource-usage-modal-title"
              className="text-lg font-semibold text-[color:var(--dp-navy)]"
            >
              Resource usage leaderboard
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {usageResource.resource_name}
            </p>
            <p className="text-xs font-medium text-slate-500">
              {formatMimeType(
                usageResource.mime_type,
                usageResource.resource_name,
              )}
            </p>
            <p className="text-xs text-slate-500">
              {usageResource.resource_path}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className={secondaryBtn}
              target="_blank"
              rel="noreferrer"
              href={`/resource/${usageResource.file_id}`}
            >
              Open preview
            </Link>
            <CloseButton
              label="Close resource usage stats"
              onClick={() => {
                const q = new URLSearchParams();
                Object.entries(closeQuery).forEach(([k, v]) => {
                  if (v) q.set(k, v);
                });
                router.replace(`${pathname}?${q.toString()}`);
              }}
            />
          </div>
        </header>
        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto p-4">
          <dl className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-5">
            <div>
              <dt className="text-slate-500">Current rank</dt>
              <dd className="font-semibold">#{usageResource.rank}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Total active time</dt>
              <dd className="font-semibold">
                {fmtSeconds(Number(usageResource.total_active_seconds))}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Unique users</dt>
              <dd className="font-semibold">{usageResource.unique_users}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Sessions</dt>
              <dd className="font-semibold">{usageResource.session_count}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last used</dt>
              <dd className="font-semibold">
                {usageResource.last_used_at
                  ? new Date(usageResource.last_used_at).toLocaleString()
                  : '—'}
              </dd>
            </div>
          </dl>
          <h4 className="mt-4 text-sm font-semibold">
            Per-resource user breakdown
          </h4>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            {usageUsers.length ? (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Rank</th>
                    <th className="p-2">User email</th>
                    <th className="p-2">Total active time</th>
                    <th className="p-2">Sessions</th>
                    <th className="p-2">Last used</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {usageUsers.map((u: any, i: number) => (
                    <tr key={u.user_id} className="border-t border-slate-100">
                      <td className="p-2 font-semibold">{i + 1}</td>
                      <td className="p-2 font-medium">{u.user_email}</td>
                      <td className="p-2">
                        {fmtSeconds(Number(u.total_active_seconds))}
                      </td>
                      <td className="p-2">{u.session_count}</td>
                      <td className="whitespace-nowrap p-2">
                        {u.last_used_at
                          ? new Date(u.last_used_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="p-2">
                        <Link
                          className="font-medium text-[color:var(--dp-blue)]"
                          href={{
                            query: {
                              ...sp,
                              section: 'analytics',
                              resourceId: usageResource.file_id,
                              userId: u.user_id,
                            },
                          }}
                        >
                          View user usage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No user breakdown available for this range.
              </p>
            )}
          </div>
          {sp.userId && (
            <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-[color:var(--dp-navy)]">
                  Top resources used by{' '}
                  {selectedUser?.user_email || 'selected user'}
                </h4>
                <Link className={secondaryBtn} href={{ query: clearUserQuery }}>
                  Clear user
                </Link>
              </div>
              {usageUserResources.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="p-2">Resource name</th>
                        <th className="p-2">Total active time</th>
                        <th className="p-2">Sessions</th>
                        <th className="p-2">Last used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageUserResources.map((r: any) => (
                        <tr
                          key={r.file_id}
                          className="border-t border-slate-100"
                        >
                          <td className="p-2 font-medium">{r.resource_name}</td>
                          <td className="p-2">
                            {fmtSeconds(Number(r.total_active_seconds))}
                          </td>
                          <td className="p-2">{r.session_count}</td>
                          <td className="whitespace-nowrap p-2">
                            {r.last_used_at
                              ? new Date(r.last_used_at).toLocaleString()
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No usage data available for this user in this range.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
function QueueTable({
  rows,
  kind,
  onInspect,
}: {
  rows: any[];
  kind: 'report' | 'ticket';
  onInspect: (item: any) => void;
}) {
  return (
    <div className="overflow-x-auto border-y border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="p-2">Status</th>
            <th className="p-2">Category</th>
            <th className="p-2">
              {kind === 'report' ? 'Resource' : 'Subject'}
            </th>
            <th className="p-2">Reporter</th>
            <th className="p-2">Submitted</th>
            <th className="p-2">Assigned</th>
            <th className="p-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => onInspect(r)}
              className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
            >
              <td className="p-2">{badge(r.status)}</td>
              <td className="p-2">{r.category}</td>
              <td className="max-w-72 truncate p-2">
                {kind === 'report' ? r.resource_name : r.subject}
                <p className="text-xs text-slate-500">
                  {kind === 'report' ? r.resource_path : ''}
                </p>
              </td>
              <td className="p-2">{r.reporter_email}</td>
              <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
              <td className="p-2">
                {r.assigned_to ? 'Assigned' : 'Unassigned'}
              </td>
              <td className="p-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspect(r);
                  }}
                  className="font-medium text-[color:var(--dp-blue)]"
                >
                  Inspect
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
