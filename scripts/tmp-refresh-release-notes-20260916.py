from pathlib import Path

p = Path('lib/whats-new.ts')
p.write_text("""export const WHATS_NEW_RELEASE = {
  id: '2026-09-16-guided-onboarding-practice-builder',
  dateLabel: '16 September 2026',
  items: [
    {
      title: 'Take a guided tour of DP Resources',
      description:
        'A new 12-step walkthrough teaches the real Library, IB Resource Library, Question Bank, global Search, Practice Builder, source filters, Recent, Saved and Settings interface without replacing it with a demo.',
    },
    {
      title: 'Replay the tutorial anytime',
      description:
        'The walkthrough can be replayed from Settings, clearly marks required clicks on the real controls, keeps the page locked while the tour is active, and still lets you leave with Skip or Escape.',
    },
    {
      title: 'Faster and steadier guided navigation',
      description:
        'Tutorial destinations are prepared just before they are needed, highlights stay attached through page changes, and Practice Builder and Settings targets appear quickly without the old jump, pause or broken-corner behaviour.',
    },
    {
      title: 'Clearer, more reliable Practice Builder',
      description:
        'Light-mode selection states, completed subjects, course controls and question-availability feedback are easier to read, while Question Bank loading is more resilient and source filtering now reflects RevisionDojo alongside the other current providers.',
    },
  ],
} as const;
""")

entries = [
    "Added a 12-step interactive onboarding walkthrough across Library, the IB Resource Library, Question Bank, global Search, Practice Builder, source filters, Recent, Saved and Settings, with replay available from Settings.",
    "Made tutorial navigation substantially faster and steadier with staged route preparation, persistent cross-page spotlighting, stable loading-shell targets, attached click cues, locked background interaction and a reliable Settings finale.",
    "Polished Practice Builder in light mode with clearer selected and hover states, stronger checkmarks, readable clear and bulk controls, rounded fully-selected subject states, and improved eligible-question feedback.",
    "Improved Question Bank reliability when source or course counts are slow by removing heavy parallel prefetches, handling timed-out optional counts without crashing, and reducing repeated source-count database work.",
    "Fixed a duplicate CH0007 practice question while preserving its Revision Town and Revision Village provenance, and corrected imported answer markup so unsupported answer wrappers no longer leak into rendered explanations.",
    "Improved Support and resource-report attachment controls in dark mode so attachment buttons, helper text, previews, selected files, errors and remove controls keep strong readable contrast.",
]

p = Path('app/changelog/page.tsx')
text = p.read_text()
anchor = "const latestReleaseNotes: ChangelogEntry[] = [\n"
if anchor not in text:
    raise SystemExit('latestReleaseNotes anchor missing')
block = ''.join(
    "  {\n"
    f"    id: 'release-2026-09-16-{i:02d}',\n"
    "    summary:\n"
    f"      {entry!r},\n"
    f"    date: '2026-09-16T{14-i:02d}:5{i}:00.000Z',\n"
    "  },\n"
    for i, entry in enumerate(entries, 1)
)
text = text.replace(anchor, anchor + block, 1)
p.write_text(text)

p = Path('lib/changelog.ts')
text = p.read_text()
anchor = "const historicalSummaries: Record<string, string[]> = {\n"
if anchor not in text:
    raise SystemExit('historicalSummaries anchor missing')
array = "  '2026-09-16': [\n" + ''.join(f"    {entry!r},\n" for entry in entries) + "  ],\n"
text = text.replace(anchor, anchor + array, 1)
p.write_text(text)

p = Path('tests/source-ui-and-whats-new.test.ts')
text = p.read_text()
start = text.index("  it('keeps What’s new as a short hand-written 13 September release summary'")
end = text.index("\n  it('keeps the August 6-16 release window curated", start)
replacement = """  it('keeps What’s new as a short hand-written 16 September release summary', () => {
    const whatsNew = read('lib/whats-new.ts');
    expect(whatsNew).toContain("id: '2026-09-16-guided-onboarding-practice-builder'");
    expect(whatsNew).toContain("dateLabel: '16 September 2026'");
    expect(whatsNew).not.toContain("dateLabel: 'September 2026'");
    expect(whatsNew).not.toContain('Save your IB academic profile');
    for (const highlight of [
      'Take a guided tour of DP Resources',
      'Replay the tutorial anytime',
      'Faster and steadier guided navigation',
      'Clearer, more reliable Practice Builder',
    ]) {
      expect(whatsNew).toContain(highlight);
    }
    expect(whatsNew).toContain('IB Resource Library');
    expect(whatsNew).toContain('RevisionDojo');
  });

  it('curates the complete 16 September public release in both changelog sources', () => {
    const page = read('app/changelog/page.tsx');
    const history = read('lib/changelog.ts');
    for (const note of [
      'Added a 12-step interactive onboarding walkthrough',
      'Made tutorial navigation substantially faster and steadier',
      'Polished Practice Builder in light mode',
      'Improved Question Bank reliability when source or course counts are slow',
      'Fixed a duplicate CH0007 practice question',
      'Improved Support and resource-report attachment controls in dark mode',
    ]) {
      expect(page).toContain(note);
      expect(history).toContain(note);
    }
    expect(page).toContain('2026-09-16');
    expect(history).toContain("'2026-09-16': [");
  });
"""
text = text[:start] + replacement + text[end:]
p.write_text(text)

p = Path('tests/account-settings.test.ts')
text = p.read_text()
old = """  it('keeps What’s New current after the Settings release', () => {
    expect(whatsNew).toContain("id: '2026-09-13-support-report-attachments'");
    expect(whatsNew).toContain('Attach screenshots and files to reports');
    expect(whatsNew).toContain('Add several attachments at once');
    expect(whatsNew).not.toContain('Save your IB academic profile');
  });
"""
new = """  it('keeps What’s New current after the guided onboarding release', () => {
    expect(whatsNew).toContain("id: '2026-09-16-guided-onboarding-practice-builder'");
    expect(whatsNew).toContain('Take a guided tour of DP Resources');
    expect(whatsNew).toContain('Replay the tutorial anytime');
    expect(whatsNew).toContain('Clearer, more reliable Practice Builder');
    expect(whatsNew).not.toContain('Save your IB academic profile');
  });
"""
if old not in text:
    raise SystemExit('account-settings What’s New block missing')
text = text.replace(old, new, 1)
p.write_text(text)

p = Path('tests/admin-private-aliases-and-question-bank-activity.test.ts')
text = p.read_text()
old = """  it('keeps the September changelog curated and refreshes What’s New for attachments', () => {
    expect(changelog).toContain("'2026-09-12': [");
    expect(changelog).toContain("'2026-09-11': [");
    expect(changelog).toContain('Added one-click Question Bank filters');
    expect(changelog).toContain('Added DP Resources social sign-in and Connected Accounts support');
    expect(changelog).toContain('Added fullscreen support to the standard browser PDF fallback');
    expect(whatsNew).toContain("id: '2026-09-13-support-report-attachments'");
    expect(whatsNew).toContain("dateLabel: '13 September 2026'");
    expect(whatsNew).toContain('Attach screenshots and files to reports');
  });
"""
new = """  it('keeps the September changelog curated and refreshes What’s New for guided onboarding', () => {
    expect(changelog).toContain("'2026-09-16': [");
    expect(changelog).toContain("'2026-09-12': [");
    expect(changelog).toContain("'2026-09-11': [");
    expect(changelog).toContain('Added a 12-step interactive onboarding walkthrough');
    expect(changelog).toContain('Improved Question Bank reliability when source or course counts are slow');
    expect(changelog).toContain('Added one-click Question Bank filters');
    expect(changelog).toContain('Added DP Resources social sign-in and Connected Accounts support');
    expect(changelog).toContain('Added fullscreen support to the standard browser PDF fallback');
    expect(whatsNew).toContain("id: '2026-09-16-guided-onboarding-practice-builder'");
    expect(whatsNew).toContain("dateLabel: '16 September 2026'");
    expect(whatsNew).toContain('Take a guided tour of DP Resources');
  });
"""
if old not in text:
    raise SystemExit('admin release block missing')
text = text.replace(old, new, 1)
p.write_text(text)
