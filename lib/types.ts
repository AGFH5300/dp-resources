export type ResourceMembership={id:string;email:string;role:'user'|'admin';is_approved:boolean;created_at:string;approved_at:string|null};
export type ActivityLog={id:string;user_id:string;user_email:string;file_id:string|null;file_name:string;action:'folder_opened'|'file_opened'|'download_started';created_at:string;ip_address:string|null;user_agent:string|null};
export type DriveItem={id:string;name:string;mimeType:string;size?:string;modifiedTime?:string;isFolder:boolean;featuredLabel?:string;featuredPriority?:number};
export type ResourceIndex={id?:string;drive_file_id:string;parent_drive_file_id:string|null;name:string;normalized_name:string;path:string;mime_type:string;is_folder:boolean;size_bytes:number|null;modified_at:string|null;indexed_at:string;featuredLabel?:string;featuredPriority?:number};
export type ResourceFavorite={id:string;user_id:string;drive_file_id:string;created_at:string};
export type ResourceReport={id:string;reporter_id:string;reporter_email:string;drive_file_id:string|null;resource_name:string|null;resource_path:string|null;category:string;message:string;status:'open'|'in_review'|'resolved';created_at:string;updated_at:string};
export type SupportTicket={id:string;reporter_id:string;reporter_email:string;category:string;subject:string;message:string;status:'open'|'in_review'|'resolved';created_at:string;updated_at:string};
