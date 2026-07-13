export type PreviewMode = 'folder' | 'pdf' | 'docx' | 'image' | 'master-xlsx' | 'xlsx' | 'audio' | 'video' | 'text' | 'pptx' | 'download-fallback';
export type ResourceCapability = { previewMode: PreviewMode; label: string; icon: 'folder'|'pdf'|'word'|'spreadsheet'|'presentation'|'image'|'audio'|'video'|'text'|'other'; needsRange: boolean; generic: boolean; mimeTypes: string[]; extensions: string[] };
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const MASTER_WORKBOOK_FILE_ID = '1T1VS7tOJMEmPa9NXYOXdegBzYsNOSUOE';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const resourceCapabilities: ResourceCapability[] = [
  { previewMode:'folder', label:'Folder', icon:'folder', needsRange:false, generic:false, mimeTypes:[FOLDER_MIME], extensions:[] },
  { previewMode:'pdf', label:'PDF', icon:'pdf', needsRange:true, generic:false, mimeTypes:['application/pdf'], extensions:['pdf'] },
  { previewMode:'docx', label:'Word document', icon:'word', needsRange:false, generic:false, mimeTypes:[DOCX], extensions:['docx'] },
  { previewMode:'xlsx', label:'Spreadsheet', icon:'spreadsheet', needsRange:false, generic:false, mimeTypes:[XLSX], extensions:['xlsx'] },
  { previewMode:'pptx', label:'Presentation', icon:'presentation', needsRange:false, generic:false, mimeTypes:[PPTX], extensions:['pptx'] },
  { previewMode:'audio', label:'Audio', icon:'audio', needsRange:true, generic:false, mimeTypes:['audio/mpeg'], extensions:['mp3'] },
  { previewMode:'video', label:'Video', icon:'video', needsRange:true, generic:false, mimeTypes:['video/mp4'], extensions:['mp4'] },
  { previewMode:'image', label:'Image', icon:'image', needsRange:false, generic:false, mimeTypes:['image/png'], extensions:['png'] },
  { previewMode:'text', label:'Text file', icon:'text', needsRange:false, generic:false, mimeTypes:['text/plain','text/csv'], extensions:['txt','csv'] },
];
export function getResourceCapability(mimeType='', name='', isFolder=false, fileId?:string): ResourceCapability {
  if (isFolder || mimeType === FOLDER_MIME) return resourceCapabilities[0];
  if (fileId === MASTER_WORKBOOK_FILE_ID && (mimeType === XLSX || /\.xlsx$/i.test(name))) return { ...resourceCapabilities[3], previewMode:'master-xlsx' };
  const lower = mimeType.toLowerCase();
  if (lower.startsWith('audio/')) return { ...resourceCapabilities[5], mimeTypes:[mimeType], label:'Audio' };
  if (lower.startsWith('video/')) return { ...resourceCapabilities[6], mimeTypes:[mimeType], label:'Video' };
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return resourceCapabilities.find(c => c.mimeTypes.includes(lower) || c.extensions.includes(ext)) || { previewMode:'download-fallback', label:'Other file', icon:'other', needsRange:false, generic:true, mimeTypes:[mimeType], extensions: ext?[ext]:[] };
}
export const typeLabel = (mimeType:string, isFolder=false, name='', fileId?:string) => getResourceCapability(mimeType,name,isFolder,fileId).label;
export const needsRangeSupport = (mimeType:string, name='') => getResourceCapability(mimeType,name).needsRange;
