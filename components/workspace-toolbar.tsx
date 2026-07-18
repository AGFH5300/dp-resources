export function WorkspaceToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-200 bg-[color:var(--dp-soft-sky)]/80 px-4 py-3 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
