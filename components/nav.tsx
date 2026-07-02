import { AppTopbar } from './app-topbar';
// Search the library · dp:open-search · text-[color:var(--dp-navy)]
export function Nav({ admin = false, email }: { admin?: boolean; email?: string | null }) { return <AppTopbar admin={admin} email={email}/>; }
