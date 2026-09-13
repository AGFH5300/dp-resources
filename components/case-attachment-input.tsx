'use client';

import {
  FileText,
  Image as ImageIcon,
  Paperclip,
  PlaySquare,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CASE_ATTACHMENT_ACCEPT,
  CASE_ATTACHMENT_MAX_FILES,
  CASE_ATTACHMENT_MAX_TOTAL_BYTES,
  caseAttachmentKind,
  formatAttachmentSize,
  validateCaseAttachmentSelection,
} from '@/lib/case-attachment-rules';

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
};

function fileKey(file: File) {
  return [file.name, file.size, file.type, file.lastModified].join(':');
}

function Preview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const kind = caseAttachmentKind(file);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  if (kind === 'image') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
        aria-label={`Preview ${file.name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="h-full w-full object-cover" />
      </a>
    );
  }

  if (kind === 'video') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="grid h-14 w-14 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-500"
        aria-label={`Preview ${file.name}`}
      >
        <PlaySquare className="size-6" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="grid h-14 w-14 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-500"
      aria-label={`Preview ${file.name}`}
    >
      <FileText className="size-6" />
    </a>
  );
}

export function CaseAttachmentInput({
  files,
  onChange,
  disabled = false,
  compact = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (!incoming.length || disabled) return;
      const seen = new Set(files.map(fileKey));
      const merged = [...files];
      incoming.forEach((file) => {
        const key = fileKey(file);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(file);
        }
      });
      const issue = validateCaseAttachmentSelection(merged);
      if (issue) {
        setError(issue);
        return;
      }
      setError('');
      onChange(merged);
    },
    [disabled, files, onChange],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (disabled) return;
      const pasted = Array.from(event.clipboardData?.files || []).filter((file) =>
        file.type.toLowerCase().startsWith('image/'),
      );
      if (!pasted.length) return;
      event.preventDefault();
      addFiles(pasted);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles, disabled]);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className={compact ? 'mt-3' : 'mt-4'}>
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
        className={`rounded-md border border-dashed p-3 transition ${
          dragging
            ? 'border-[color:var(--dp-blue)] bg-blue-50'
            : 'border-slate-300 bg-slate-50/70'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={CASE_ATTACHMENT_ACCEPT}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            addFiles(Array.from(event.target.files || []));
            event.target.value = '';
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed"
          >
            <Paperclip className="size-4" />
            Add attachments
          </button>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Upload className="size-3.5" /> Drop files here or paste a screenshot
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Images, MP4/WebM/MOV, PDF, DOCX, XLSX, PPTX, TXT or CSV · up to{' '}
          {CASE_ATTACHMENT_MAX_FILES} files · {formatAttachmentSize(CASE_ATTACHMENT_MAX_TOTAL_BYTES)} total
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {files.length ? (
        <div className="mt-3 space-y-2">
          {files.map((file, index) => {
            const kind = caseAttachmentKind(file);
            const KindIcon =
              kind === 'image' ? ImageIcon : kind === 'video' ? PlaySquare : FileText;
            return (
              <div
                key={`${fileKey(file)}:${index}`}
                className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2"
              >
                <Preview file={file} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {file.name || 'Pasted image'}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <KindIcon className="size-3.5" />
                    {kind || 'file'} · {formatAttachmentSize(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const next = files.filter((_, itemIndex) => itemIndex !== index);
                    setError('');
                    onChange(next);
                  }}
                  className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-red-700 disabled:cursor-not-allowed"
                  aria-label={`Remove ${file.name}`}
                  title="Remove attachment"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
          <p className="text-right text-xs text-slate-500">
            {files.length}/{CASE_ATTACHMENT_MAX_FILES} files · {formatAttachmentSize(totalBytes)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
