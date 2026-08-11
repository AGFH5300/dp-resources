import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('reported Question Bank and login regressions', () => {
  it('binds Tailwind dark utilities to the selected data theme, not the OS theme', () => {
    const css = read('app/globals.css');
    expect(css).toContain(
      "@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));",
    );
  });

  it('keeps source checkboxes compact and source labels readable', () => {
    const css = read('app/globals.css');
    const filters = read(
      'components/question-bank/question-bank-filters.tsx',
    );
    expect(css).toContain(
      ".dp-qb-filters input:not([type='checkbox']):not([type='radio'])",
    );
    expect(css).toContain(
      ".dp-qb-filters input:is([type='checkbox'], [type='radio'])",
    );
    expect(css).toContain('.dp-qb-filter-more .dp-qb-source-option > span');
    expect(filters).toContain('dp-qb-source-option');
    expect(filters).toContain('{source.shortLabel}');
    expect(filters).toContain("updateParams({ sources: next.length ? next.join(',') : null })");
  });

  it('refreshes Caps Lock from pointer focus and globally remembered key state', () => {
    const login = read('app/auth/login/page.tsx');
    const css = read('app/globals.css');
    expect(login).toContain('passwordInputRef');
    expect(login).toContain('capsLockActiveRef');
    expect(login).toContain("window.addEventListener('keydown', rememberCapsLockState, true)");
    expect(login).toContain('onPointerDown={updateCapsLockState}');
    expect(login).toContain(
      'onFocus={() => setCapsLockOn(capsLockActiveRef.current)}',
    );
    expect(login).toContain('className="tsm-input dp-login-password-input"');
    expect(css).toContain('.tsm-input.dp-login-password-input');
    expect(css).toContain('padding-right: 4rem');
  });

  it('reviews only the exact verified Revision Town import boundary', () => {
    const migration = read(
      'supabase/migrations/20260811115000_revision_town_archive_evidence_backfill.sql',
    );
    expect(migration).toContain("'processed-20260721-222121'");
    expect(migration).toContain(
      "'e91b6f5752b67626b278b34858ff0f11444bcb11bf0324e4cba1a5edad14a64d'",
    );
    expect(migration).toContain('v_expected_variants constant bigint := 12212');
    expect(migration).toContain('v_expected_questions constant bigint := 5135');
    expect(migration).toContain("provider = 'revision_town'");
    expect(migration).toContain("assignment_method = 'import_manifest'");
    expect(migration).toContain("review_status = 'reviewed'");
    expect(migration).toContain('v_before.progress_rows');
    expect(migration).toContain('v_before.saved_rows');
  });

  it('adds Padlet as non-primary hosting evidence only for unique archive matches', () => {
    const migration = read(
      'supabase/migrations/20260811115100_padlet_archive_hosting_evidence_backfill.sql',
    );
    expect(migration).toContain('v_match_audit.archive_files <> 269');
    expect(migration).toContain('v_match_audit.unique_matches <> 239');
    expect(migration).toContain('v_match_audit.ambiguous_matches <> 2');
    expect(migration).toContain('v_match_audit.unmatched_files <> 28');
    expect(migration).toContain("false, 'hosted_from'");
    expect(migration).toContain("assignment.review_status <> 'rejected'");
    expect(migration).toContain('v_before.question_cores');
    expect(migration).toContain('v_before.saved_rows');
  });
});
