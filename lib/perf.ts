import 'server-only';

export function nowMs() { return performance.now(); }
export function devTiming(label: string, fields: Record<string, number | string | boolean | null | undefined>) {
  if (process.env.NODE_ENV !== 'production') console.log(JSON.stringify({ scope: 'dp-perf', label, ...fields }));
}
export function serverTiming(name: string, durationMs: number) { return `${name};dur=${durationMs.toFixed(1)}`; }
export function etagFor(parts: Array<string | number | null | undefined>) {
  const value = parts.map((p) => String(p ?? '')).join(':').replace(/"/g, '');
  return `"${Buffer.from(value).toString('base64url')}"`;
}
