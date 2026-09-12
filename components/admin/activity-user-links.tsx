'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CloseButton } from '@/components/ui/close-button';

const secondaryBtn =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60';

type ActivityUser = {
  id: string;
  email: string;
  role: string;
  username: string | null;
  fullName: string | null;
  alias: string | null;
};

type ActivityResource = {
  file_id: string;
  resource_name: string;
  resource_path?: string | null;
  total_active_seconds?: number | string | null;
  session_count?: number | string | null;
  last_used_at?: string | null;
};

type ActivityDetail = {
  user: ActivityUser;
  range: string;
  resources: ActivityResource[];
};

function fmtSeconds(value: number) {
  if (!value) return '0 sec';
  if (value < 60) return `${Math.round(value)} sec`;
  if (value < 3600) return `${Math.round(value / 60)} min`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);
  return `${hours} hr${minutes ? ` ${minutes} min` : ''}`;
}

function findActivitySection() {
  return Array.from(document.querySelectorAll('section')).find((section) =>
    Array.from(section.querySelectorAll('h2')).some(
      (heading) => heading.textContent?.trim() === 'Activity',
    ),
  );
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function activityUserCell(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLTableCellElement>(
    'td[data-dp-activity-user-link="true"]',
  );
}

export function AdminActivityUserLinksBridge() {
  const searchParams = useSearchParams();
  const section = searchParams.get('section') || 'index';
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const [range, setRange] = useState('all');
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (section !== 'activity') {
      setOpenEmail(null);
      setDetail(null);
      return;
    }

    let disposed = false;
    const enhance = () => {
      if (disposed) return;
      const activitySection = findActivitySection();
      const rows = activitySection?.querySelectorAll('tbody tr');
      if (!rows) return;

      rows.forEach((row) => {
        const userCell = row.children.item(1) as HTMLTableCellElement | null;
        if (userCell && userCell.dataset.dpActivityUserLink !== 'true') {
          const email = userCell.textContent?.trim() || '';
          if (isEmail(email)) {
            userCell.dataset.dpActivityUserLink = 'true';
            userCell.dataset.dpActivityEmail = email;
            userCell.tabIndex = 0;
            userCell.setAttribute('role', 'button');
            userCell.setAttribute('aria-label', `Open admin user details for ${email}`);
            userCell.title = `Open ${email} without leaving Activity`;
            userCell.classList.add(
              'cursor-pointer',
              'text-[color:var(--dp-blue)]',
              'hover:underline',
              'focus-visible:outline-none',
              'focus-visible:ring-2',
              'focus-visible:ring-[color:var(--dp-blue)]',
              'focus-visible:ring-inset',
            );
          }
        }

        const actionCell = row.children.item(2) as HTMLTableCellElement | null;
        if (
          actionCell &&
          actionCell.textContent?.trim() === 'question_opened' &&
          actionCell.dataset.dpActivityQuestionLabel !== 'true'
        ) {
          actionCell.dataset.dpActivityQuestionLabel = 'true';
          actionCell.setAttribute('aria-label', 'Opened Question Bank question');
          actionCell.title = 'Opened Question Bank question';
          actionCell.classList.add('dp-admin-question-activity-label');
        }
      });
    };

    const onClick = (event: MouseEvent) => {
      const cell = activityUserCell(event.target);
      if (!cell) return;
      const email = cell.dataset.dpActivityEmail || cell.textContent?.trim() || '';
      if (!isEmail(email)) return;
      setOpenEmail(email);
      setRange('all');
      setDetail(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const cell = activityUserCell(event.target);
      if (!cell) return;
      event.preventDefault();
      const email = cell.dataset.dpActivityEmail || cell.textContent?.trim() || '';
      if (!isEmail(email)) return;
      setOpenEmail(email);
      setRange('all');
      setDetail(null);
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [section]);

  useEffect(() => {
    if (!openEmail) return;
    const controller = new AbortController();
    setLoading(true);
    void fetch(
      `/api/admin/users/activity-detail?email=${encodeURIComponent(openEmail)}&range=${encodeURIComponent(range)}`,
      { cache: 'no-store', signal: controller.signal },
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            typeof payload.error === 'string'
              ? payload.error
              : 'Could not load this user.',
          );
        setDetail(payload as ActivityDetail);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        toast.error(
          error instanceof Error ? error.message : 'Could not load this user.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [openEmail, range]);

  useEffect(() => {
    if (!openEmail) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenEmail(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openEmail]);

  const totals = useMemo(() => {
    const resources = detail?.resources || [];
    return {
      files: resources.length,
      seconds: resources.reduce(
        (sum, resource) => sum + Number(resource.total_active_seconds || 0),
        0,
      ),
      sessions: resources.reduce(
        (sum, resource) => sum + Number(resource.session_count || 0),
        0,
      ),
      lastViewed: resources.reduce<string | null>(
        (latest, resource) =>
          !latest || (resource.last_used_at && resource.last_used_at > latest)
            ? resource.last_used_at || latest
            : latest,
        null,
      ),
    };
  }, [detail]);

  return (
    <>
      <style>{`
        .dp-admin-question-activity-label { font-size: 0; }
        .dp-admin-question-activity-label::after {
          content: 'Opened Question Bank question';
          font-size: 0.875rem;
        }
      `}</style>
      {openEmail ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="activity-user-modal-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpenEmail(null);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Admin user details
                </p>
                <h3
                  id="activity-user-modal-title"
                  className="truncate text-lg font-semibold text-[color:var(--dp-navy)]"
                >
                  {detail?.user.alias ||
                    (detail?.user.username ? `@${detail.user.username}` : openEmail)}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {[
                    detail?.user.fullName,
                    detail?.user.username ? `@${detail.user.username}` : null,
                    openEmail,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <CloseButton
                label="Close admin user details"
                onClick={() => setOpenEmail(null)}
              />
            </header>

            <div className="overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2">
                {[
                  ['today', 'Today'],
                  ['7d', '7 days'],
                  ['30d', '30 days'],
                  ['all', 'All time'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`${secondaryBtn} ${range === value ? 'border-[color:var(--dp-blue)] text-[color:var(--dp-blue)]' : ''}`}
                    onClick={() => setRange(value)}
                    disabled={loading && range === value}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {loading && !detail ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  Loading user details…
                </div>
              ) : (
                <>
                  <dl className="mt-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-slate-500">Files viewed</dt>
                      <dd className="font-semibold">{totals.files}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Total active time</dt>
                      <dd className="font-semibold">{fmtSeconds(totals.seconds)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Sessions</dt>
                      <dd className="font-semibold">{totals.sessions}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Last viewed</dt>
                      <dd className="font-semibold">
                        {totals.lastViewed
                          ? new Date(totals.lastViewed).toLocaleString()
                          : '—'}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                    {detail?.resources?.length ? (
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
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
                          {detail.resources.map((resource) => (
                            <tr key={resource.file_id} className="border-t border-slate-100">
                              <td className="p-2 font-medium">{resource.resource_name}</td>
                              <td className="p-2 text-slate-600">
                                {resource.resource_path || '—'}
                              </td>
                              <td className="whitespace-nowrap p-2">
                                {fmtSeconds(Number(resource.total_active_seconds || 0))}
                              </td>
                              <td className="p-2">{Number(resource.session_count || 0)}</td>
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
                      <p className="p-4 text-sm text-slate-600">
                        No Library resource usage recorded for this user in this range.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
