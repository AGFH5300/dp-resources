import { requireApproved } from '@/lib/auth';
import { recordActivity } from '@/lib/activity';
import { redirect } from 'next/navigation';
export async function POST(req:Request){const {user}=await requireApproved(); const form=await req.formData(); const folderId=String(form.get('folderId')); const folderName=String(form.get('folderName')||'Folder'); await recordActivity({userId:user.id,userEmail:user.email!,fileId:folderId,fileName:folderName,action:'folder_opened'}); redirect(`/library?folder=${encodeURIComponent(folderId)}`)}
