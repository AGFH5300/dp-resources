import type { RangeDecision } from './range-requests';

export function byteRangeLength(decision: RangeDecision) {
  return decision.kind === 'range' ? decision.end - decision.start + 1 : null;
}

export function expectedPdfContentRange(decision: RangeDecision, totalSize: number) {
  return decision.kind === 'range' ? `bytes ${decision.start}-${decision.end}/${totalSize}` : null;
}

export function validatePdfRangeUpstream(decision: RangeDecision, totalSize: number, upstream: Pick<Response, 'status' | 'headers'>) {
  if (decision.kind !== 'range') return null;
  const expectedLength = byteRangeLength(decision);
  const actualLength = Number(upstream.headers.get('content-length'));
  if (upstream.status !== 206) return 'status';
  if (upstream.headers.get('content-range') !== expectedPdfContentRange(decision, totalSize)) return 'content-range';
  if (!Number.isSafeInteger(actualLength) || actualLength !== expectedLength) return 'content-length';
  return null;
}
