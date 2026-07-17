"use client"

import { BrandWordmark } from '@/components/brand-wordmark'
import { ThemeToggle } from '@/components/theme-toggle'

type AuthShellProps = {
  eyebrow: string
  title: string
  description: string
  quote?: string
  attribution?: string
  children: React.ReactNode
}

export function AuthShell({ eyebrow, title, description, quote, attribution, children }: AuthShellProps) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#f8f6f1] text-[#1b1c19]">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <aside className="relative hidden overflow-hidden border-r border-[#c3c6ce55] bg-[#ece7db] lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(115,91,43,0.15),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(0,21,42,0.10),transparent_40%)]" />
          <div className="relative flex h-full w-full flex-col justify-between p-12 xl:p-16">
            <div>
              <BrandWordmark className="text-3xl" />
              <p className="mt-8 font-label text-xs uppercase tracking-[0.18em] text-[#43474d]">{eyebrow}</p>
              <h2 className="mt-4 max-w-xl font-headline text-5xl leading-[1.08] text-[#00152a]">{title}</h2>
              <p className="mt-6 max-w-xl font-body text-lg leading-relaxed text-[#43474d]">{description}</p>
            </div>
            {quote && attribution ? (
              <div className="rounded-md border border-[#c3c6ce66] bg-white/70 p-7 backdrop-blur-sm">
                <p className="font-headline text-2xl leading-snug text-[#00152a]">“{quote}”</p>
                <p className="mt-4 font-body text-sm text-[#43474d]">{attribution}</p>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="flex min-h-screen items-center justify-center p-6 md:p-10 lg:p-12">
          <div className="w-full max-w-md rounded-md border border-[#c3c6ce66] bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)] md:p-10">
            <div className="mb-8 flex items-center justify-between">
              <BrandWordmark className="text-base sm:text-xl" />
              <ThemeToggle />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
