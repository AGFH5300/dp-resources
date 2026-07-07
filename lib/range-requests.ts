export type RangeDecision =
  | { kind: 'none' }
  | { kind: 'invalid'; total: number }
  | { kind: 'full' }
  | { kind: 'range'; header: string; start: number; end: number };

export function parseSingleByteRange(range: string | null, totalSize: string | number | undefined | null): RangeDecision {
  if (!range) return { kind: 'none' };
  const total = Number(totalSize);
  if (!Number.isSafeInteger(total) || total < 0) return { kind: 'invalid', total: 0 };
  if (range.includes(',')) return { kind: 'invalid', total };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return { kind: 'invalid', total };
  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return { kind: 'invalid', total };

  let start: number;
  let end: number;
  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { kind: 'invalid', total };
    if (total === 0) return { kind: 'invalid', total };
    start = Math.max(total - suffixLength, 0);
    end = total - 1;
  } else {
    start = Number(startRaw);
    if (!Number.isSafeInteger(start) || start < 0 || start >= total) return { kind: 'invalid', total };
    end = endRaw ? Number(endRaw) : total - 1;
    if (!Number.isSafeInteger(end) || end < start || end >= total) return { kind: 'invalid', total };
  }

  return { kind: 'range', start, end, header: `bytes=${start}-${end}` };
}

export function ifRangeMatches(ifRange: string | null, etag: string) {
  if (!ifRange) return true;
  return ifRange.trim() === etag;
}
