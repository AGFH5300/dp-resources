import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('full resource search result capacity', () => {
  it('keeps the full results page at 100 while the RPC remains bounded', () => {
    const page = read('app/search/page.tsx');
    const migration = read(
      'supabase/migrations/20260814153100_preserve_full_resource_search_limit.sql',
    );

    expect(page).toContain('result_limit: 100');
    expect(migration).toContain(
      'least(greatest(coalesce(result_limit,50),1),100)',
    );
    expect(migration).toContain('to service_role');
  });
});
