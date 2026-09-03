export type ResourceMembership = {
  id: string;
  email: string;
  username?: string | null;
  full_name?: string | null;
  role: 'user' | 'admin';
  is_approved: boolean;
  created_at: string;
  approved_at: string | null;
  is_suspended: boolean;
  suspended_at: string | null;
  suspended_by: string | null;
  suspension_reason: string | null;
};
export type ActivityLog = {
  id: string;
  user_id: string;
  user_email: string;
  file_id: string | null;
  file_name: string;
  action: 'folder_opened' | 'file_opened' | 'download_started';
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
};
export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  isFolder: boolean;
  path?: string;
  featuredLabel?: string;
  featuredPriority?: number;
  estimatedSize?: number;
  attribution?: ResourceAttribution;
};
export type PublicContentSource = {
  slug: string;
  displayName: string;
  shortLabel: string;
  attributionLabel: string;
  reviewStatus: 'reviewed' | 'under_review';
};
export type ResourceAttribution = {
  sources: Array<
    PublicContentSource & {
      relationship: 'primary' | 'adapted_from' | 'compiled_from' | 'contributed_by' | 'hosted_from';
      isPrimary: boolean;
    }
  >;
  resourceType: {
    slug: string;
    displayName: string;
    reviewStatus: 'reviewed' | 'under_review';
  } | null;
};
export type ResourceIndex = {
  id?: string;
  drive_file_id: string;
  parent_drive_file_id: string | null;
  name: string;
  normalized_name: string;
  path: string;
  mime_type: string;
  is_folder: boolean;
  size_bytes: number | null;
  modified_at: string | null;
  indexed_at: string;
  featuredLabel?: string;
  featuredPriority?: number;
  estimatedSize?: number;
};
export type ResourceFavorite = {
  id: string;
  user_id: string;
  drive_file_id: string;
  created_at: string;
};
export type ResourceReport = {
  id: string;
  user_id: string;
  user_email: string;
  drive_file_id: string;
  resource_name: string;
  resource_path: string;
  reason: string;
  details: string | null;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};
export type ResourceSuggestion = {
  id: string;
  user_id: string;
  user_email: string;
  title: string;
  url: string | null;
  notes: string | null;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};
