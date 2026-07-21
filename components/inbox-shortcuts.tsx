function EmailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6 shrink-0"
      fill="none"
    >
      <path d="M4.75 6.75h14.5v10.5H4.75V6.75Z" className="fill-white" />
      <path
        d="m5 7 7 5.4L19 7"
        stroke="#00152a"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.75 6.75h14.5v10.5H4.75V6.75Z"
        stroke="#00152a"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const shortcuts = [
  {
    href: 'https://mail.google.com/mail/u/0/#inbox',
    label: 'Open Gmail',
    description: 'Check your Gmail inbox',
    ariaLabel: 'Open Gmail inbox',
    icon: (
      <img
        src="/brand/gmail-icon.svg"
        alt=""
        className="size-7 object-contain"
      />
    ),
  },
  {
    href: 'https://outlook.live.com/mail/0/inbox',
    label: 'Open Outlook',
    description: 'Check your Outlook inbox',
    ariaLabel: 'Open Outlook inbox',
    icon: (
      <img
        src="/brand/outlook-icon.svg"
        alt=""
        className="size-7 object-contain"
      />
    ),
  },
  {
    href: 'mailto:',
    label: 'Open email app',
    description: 'Use your default email app',
    ariaLabel: 'Open default email app',
    icon: <EmailIcon />,
  },
];

export function InboxShortcuts({ message }: { message: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl border border-[#e4dbc9] bg-[#fffaf1] p-4 text-left sm:p-5">
      <p className="text-sm leading-6 text-[#43474d]">{message}</p>
      <div className="mt-4 grid gap-3">
        {shortcuts.map((shortcut) => (
          <a
            key={shortcut.label}
            href={shortcut.href}
            target={shortcut.href === 'mailto:' ? undefined : '_blank'}
            rel={shortcut.href === 'mailto:' ? undefined : 'noopener noreferrer'}
            className="flex w-full items-center gap-3 rounded-xl border border-[#e1d7c7] bg-white p-3 text-left text-[#00152a] shadow-sm transition-colors hover:border-[#00152a]/30 hover:bg-[#fffdf8]"
            aria-label={shortcut.ariaLabel}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-[#e1d7c7]">
              {shortcut.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {shortcut.label}
              </span>
              <span className="block text-xs text-[#6b7280]">
                {shortcut.description}
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
