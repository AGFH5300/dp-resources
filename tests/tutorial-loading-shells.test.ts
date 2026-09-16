import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('tutorial route transition shells', () => {
  it('exposes the Sources tutorial target while Practice Builder data streams in', () => {
    const loading = read('app/question-bank/build/loading.tsx');
    expect(loading).toContain('Loading Practice Builder');
    expect(loading).toContain('Sources');
    expect(loading).toContain('Choose one or more sources');
  });

  it('exposes the real replay control immediately while Settings streams in', () => {
    const loading = read('app/settings/loading.tsx');
    expect(loading).toContain('<TutorialReplayCard />');
    expect(loading).toContain('Loading Settings');
  });
});
