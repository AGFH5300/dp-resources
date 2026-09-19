import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('large Supabase filter hardening', () => {
  it('chunks Library attribution lookups before using PostgREST .in filters', () => {
    const attribution = read('lib/content-attribution.ts');
    expect(attribution).toContain('const SUPABASE_IN_CHUNK_SIZE = 80;');
    expect(attribution).toContain('const idChunks = chunks(ids);');
    expect(attribution).toContain("chunks(variantIds).map((batch)");
    expect(attribution).toContain("chunks(questionIds).map((batch)");
    expect(attribution).not.toContain(".in('drive_file_id', ids)");
    expect(attribution).not.toContain(".in('variant_id', variantIds)");
    expect(attribution).not.toContain(".in('question_id', questionIds)");
  });

  it('chunks featured-resource lookups instead of building oversized URLs', () => {
    const featured = read('lib/featured-resources.ts');
    expect(featured).toContain('const SUPABASE_IN_CHUNK_SIZE = 80;');
    expect(featured).toContain('uniqueIds.slice(index, index + SUPABASE_IN_CHUNK_SIZE)');
    expect(featured).toContain(".in('drive_file_id', batch)");
    expect(featured).not.toContain(".in('drive_file_id', ids)");
  });
});
