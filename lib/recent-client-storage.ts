import {
  mergeRecentResources,
  type RecentResource,
} from './recent-resources';

const STORAGE_KEY = 'dp_recent';

export function readRecentResources() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is RecentResource =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.at === 'number',
    );
  } catch {
    return [];
  }
}

export function rememberRecentResource(resource: RecentResource) {
  const recent = mergeRecentResources([resource], readRecentResources());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  window.dispatchEvent(new Event('dp:recent-updated'));
}
