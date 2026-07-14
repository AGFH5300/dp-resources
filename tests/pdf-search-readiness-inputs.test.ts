import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('PDF search readiness and toolbar inputs', () => {
  it('checks live search readiness instead of trusting a stale manifest flag', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    expect(viewer).not.toContain('if(!manifest.searchReady)');
    expect(viewer).toContain('if(data.ready===false)');
    expect(viewer).toContain('setManifest(previous=>previous?{...previous,searchReady:true}:previous)');
  });

  it('keeps PDF toolbar inputs dark and readable while focused', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    expect(viewer).toContain("backgroundColor:'#1f2022'");
    expect(viewer).toContain("backgroundColor:'#202124'");
    expect(viewer).toContain("WebkitTextFillColor:'#fff'");
    expect(viewer).toContain('autoComplete="off"');
  });

  it('allows private JSON geometry files in the legacy Supabase preview bucket', () => {
    const migration = read('supabase/migrations/20260714224500_pdf_preview_search_geometry_mime.sql');
    expect(migration).toContain("where id = 'pdf-previews'");
    expect(migration).toContain("'image/jpeg'");
    expect(migration).toContain("'application/json'");
  });
});
