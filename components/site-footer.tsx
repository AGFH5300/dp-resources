export function SiteFooter() {
  const currentYear = new Date().getFullYear()

  const links = [
    { href: 'https://anshgupta.cc/#about', label: 'About' },
    { href: 'https://anshgupta.cc/#competition', label: 'Experience' },
    { href: 'https://anshgupta.cc/#projects', label: 'Projects' },
  ]

  return (
    <footer className="bg-[#050b16] py-8 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div>
            <a href="https://anshgupta.cc/" className="text-2xl font-bold text-[#d6a84f] transition-colors duration-300 hover:text-[#f0c86a]">
              Ansh <span className="text-white">Gupta</span>
            </a>
          </div>

          <div className="text-sm text-slate-400">
            &copy; {currentYear} Ansh Gupta. All rights reserved.
          </div>

          <nav aria-label="Ansh Gupta website sections" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-slate-400 transition-colors duration-300 hover:text-[#d6a84f]"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}
