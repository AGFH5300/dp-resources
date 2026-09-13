'use client';

import { ExternalLink, FileText, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatAttachmentSize } from '@/lib/case-attachment-rules';

type Attachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
};

export function CaseAttachmentViewer({
  kind,
  caseId,
  title = 'Attachments',
}: {
  kind: 'support' | 'report';
  caseId: string;
  title?: string;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/case-attachments/${kind}/${encodeURIComponent(caseId)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Could not load attachments');
        setAttachments(Array.isArray(payload?.attachments) ? payload.attachments : []);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError('Could not load attachments.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [caseId, kind]);

  if (loading) {
    return <p className="mt-4 text-sm text-slate-500">Loading attachments…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="mt-4 text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (!attachments.length) return null;

  return (
    <section className="mt-4" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
          <ShieldCheck className="size-3.5" /> Security scanned
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {attachments.map((attachment) => {
          const image = attachment.mimeType.startsWith('image/');
          const video = attachment.mimeType.startsWith('video/');
          return (
            <div
              key={attachment.id}
              className="overflow-hidden rounded-md border border-slate-200 bg-white"
            >
              {image ? (
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-video bg-slate-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.url}
                    alt={attachment.originalName}
                    className="h-full w-full object-contain"
                  />
                </a>
              ) : video ? (
                <video
                  controls
                  preload="metadata"
                  className="aspect-video w-full bg-slate-950"
                  src={attachment.url}
                >
                  <a href={attachment.url}>Open video</a>
                </video>
              ) : (
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="grid aspect-video place-items-center bg-slate-50 text-slate-500 hover:bg-slate-100"
                >
                  <FileText className="size-9" />
                </a>
              )}
              <div className="p-2.5">
                <p className="truncate text-sm font-medium text-slate-800" title={attachment.originalName}>
                  {attachment.originalName}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{formatAttachmentSize(attachment.sizeBytes)}</span>
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-[color:var(--dp-blue)]"
                  >
                    Open <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
