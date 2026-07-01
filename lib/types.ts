export type ResourceMembership={id:string;email:string;role:'user'|'admin';is_approved:boolean;created_at:string;approved_at:string|null};
export type ActivityLog={id:string;user_id:string;user_email:string;file_id:string|null;file_name:string;action:'folder_opened'|'file_opened'|'download_started';created_at:string;ip_address:string|null;user_agent:string|null};
export type DriveItem={id:string;name:string;mimeType:string;size?:string;modifiedTime?:string;isFolder:boolean};
