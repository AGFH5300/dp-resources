import Link from 'next/link';

export function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-[#e5dccd] bg-[#f6f1e8] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl text-center">
        <p className="text-xs text-slate-500 sm:text-sm">
          &copy; {currentYear} DP Resources. All rights reserved.
        </p>
        <p className="mt-1.5 text-xs text-slate-500 sm:text-sm">
          <Link
            href="/changelog"
            className="font-medium text-[#0759ff] transition-colors duration-300 hover:text-[#061a34] hover:underline"
          >
            Changelog
          </Link>
          <span aria-hidden="true" className="mx-2 text-slate-300">
            ·
          </span>
          Made by{' '}
          <a
            href="https://anshgupta.cc"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#0759ff] transition-colors duration-300 hover:text-[#061a34] hover:underline"
          >
            Ansh Gupta
          </a>
        </p>
      </div>
    </footer>
  );
}
