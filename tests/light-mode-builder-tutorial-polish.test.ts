import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const builder = readFileSync('components/question-bank/practice-set-builder-v4.tsx', 'utf8');
const css = readFileSync('components/question-bank/practice-set-builder-v2.module.css', 'utf8');
const tutorial = readFileSync('components/tutorial/tutorial-controller.tsx', 'utf8');

describe('light-mode Practice Builder and tutorial polish', () => {
  it('keeps selected and hover states visually distinct', () => {
    expect(css).toContain('.conceptButton:not(.conceptButtonSelected):not(:disabled):hover');
    expect(css).toContain('background: #dbeafe');
    expect(css).toContain('.conceptButtonSelected .conceptIcon');
    expect(css).toContain('color: #ffffff');
    expect(css).toContain('.courseOption:not(.courseOptionSelected):hover');
  });

  it('uses readable light-mode destructive, bulk, and preview states', () => {
    expect(css).toContain('color: #b91c1c');
    expect(css).toContain('background: #fef2f2');
    expect(css).toContain('.courseBulkButton:disabled');
    expect(css).toContain('background: #dcfce7');
    expect(css).toContain('.previewSuccess');
    expect(css).toContain('background: #ecfdf5');
    expect(css).toContain('color: #065f46');
  });

  it('marks a completely selected subject across the whole subject bar', () => {
    expect(builder).toContain("allSelected ? styles.pickerSubjectComplete : ''");
    expect(css).toContain('.pickerSubjectComplete > summary');
  });

  it('uses a rounded spotlight mask and starts Settings navigation on click', () => {
    expect(tutorial).toContain("boxShadow: '0 0 0 9999px rgb(2 6 23 / 0.70)'");
    expect(tutorial).not.toContain('const backdropClass');
    expect(tutorial).toContain("step.id === 'settings-link'");
    expect(tutorial).toContain("router.replace('/settings')");
  });
});
