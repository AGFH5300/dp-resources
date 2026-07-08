import { Nav } from '@/components/nav'

const sections = [
  {
    title: 'What DP Resources stores',
    body: 'We store the account details needed to run the platform, including your email, username, display name, saved resources, support messages, resource reports, and basic resource usage records.',
  },
  {
    title: 'Resource usage analytics',
    body: 'When you open or download a resource, DP Resources may record the file, the account used, the time of access, and active viewing duration. This helps maintain the library, understand which resources are useful, and investigate broken links or abuse.',
  },
  {
    title: 'What we do not record',
    body: 'DP Resources does not record keystrokes, screenshots, screen recordings, cursor paths, private browser activity, or exact scroll trails.',
  },
  {
    title: 'Admin access',
    body: 'Platform administrators can review account, support, report, saved-resource, and usage data for maintenance, security, abuse prevention, and platform improvement.',
  },
  {
    title: 'Account help and deletion',
    body: 'You can contact a DP Resources administrator to ask privacy questions, request account help, or request account deletion.',
  },
]

export default function PrivacyPage(){
  return <>
    <Nav/>
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--dp-blue)]">Privacy</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--dp-navy)] sm:text-4xl">Clear, limited platform records.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">DP Resources is a private school resource platform. Users need an account to access protected resources. The platform keeps only the records needed to operate the library, support users, and keep resources safe and reliable.</p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {sections.map((section)=>(
          <article key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[color:var(--dp-navy)]">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{section.body}</p>
          </article>
        ))}
      </section>
    </main>
  </>
}
