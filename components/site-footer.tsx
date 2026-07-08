export function SiteFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-[#050b16] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl border-t border-slate-800 pt-6 text-center sm:pt-8">
        <p className="text-xs text-slate-400 sm:text-sm">
          &copy; {currentYear} DP Resources. All rights reserved.
        </p>
        <p className="mt-2 text-xs text-slate-400 sm:text-sm">
          Made by{' '}
          <a
            href="https://anshgupta.cc"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#d6a84f] transition-colors duration-300 hover:text-[#f0c86a] hover:underline"
          >
            Ansh Gupta
          </a>
        </p>
      </div>
    </footer>
  )
}
