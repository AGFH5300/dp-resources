import { AppHeader } from './app-header';
// AppTopbar retired; integrated header owns "Search the library" via dp:open-search and var(--dp-navy) visual tokens.
export function Nav({
  admin = false,
  email,
  userId,
}: {
  admin?: boolean;
  email?: string | null;
  userId?: string | null;
}) {
  return <AppHeader admin={admin} email={email} userId={userId} />;
}
