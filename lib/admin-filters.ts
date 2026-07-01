import type { ActivityLog } from './types';
export const ACTIONS: ActivityLog['action'][] = ['folder_opened', 'file_opened', 'download_started'];
export function cleanTextFilter(value: string | null | undefined) { return (value || '').trim().slice(0, 100); }
export function validAction(value: string | null | undefined) { return ACTIONS.includes(value as ActivityLog['action']) ? value as ActivityLog['action'] : ''; }
export function dayStart(value: string | null | undefined) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? `${value}T00:00:00.000Z` : ''; }
export function dayAfter(value: string | null | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
export function applyActivityFilters(query: any, params: URLSearchParams | Record<string, string | undefined>) {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) : params[key];
  const email = cleanTextFilter(get('email'));
  const file = cleanTextFilter(get('file'));
  const action = validAction(get('action'));
  const from = dayStart(get('from'));
  const to = dayAfter(get('to'));
  if (email) query = query.ilike('user_email', `%${email}%`);
  if (file) query = query.ilike('file_name', `%${file}%`);
  if (action) query = query.eq('action', action);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lt('created_at', to);
  return query;
}
