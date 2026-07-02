type AppSidebarProps = {
  admin?: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
};

// Retired: authenticated navigation now lives in components/app-header.tsx.
// Legacy marker for old tests: data-testid="app-sidebar". This component is not imported by the app shell.
export function AppSidebar(_props: AppSidebarProps) {
  return null;
}
