from pathlib import Path

# What's New: complete user-facing summary since current production SHA 400999...
p = Path('lib/whats-new.ts')
p.write_text("""export const WHATS_NEW_RELEASE = {
  id: '2026-09-16-revisiondojo-guided-onboarding',
  dateLabel: '16 September 2026',
  items: [
    {
      title: '11,763 RevisionDojo questions added',
      description:
        'The Question Bank now includes 11,763 distinct RevisionDojo questions across 15,571 course/question variants, with RevisionDojo available as a source throughout the Question Bank and Practice Builder.',
    },
    {
      title: 'Take a guided tour of DP Resources',
      description:
        'A new 12-step walkthrough teaches the real Library, IB Resource Library, Question Bank, global Search, Practice Builder, source filters, Recent, Saved and Settings interface without replacing it with a demo.',
    },
    {
      title: 'Replay the tutorial anytime',
      description:
        'The walkthrough can be replayed from Settings, clearly marks required clicks on the real controls, locks the background while active, and moves smoothly between pages with fast, stable highlights.',
    },
    {
      title: 'Clearer and more reliable practice',
      description:
        'Practice Builder selection states and controls are clearer in light mode, while Question Bank and Practice Builder now handle slow source/course counts more gracefully instead of freezing or crashing.',
    },
    {
      title: 'More fixes since the last production release',
      description:
        'This release also fixes the duplicate CH0007 practice entry and imported answer-markup rendering, and improves attachment controls in dark mode for Support requests and resource reports.',
    },
  ],
} as const;
""")

revision_note = (
    'Expanded the Question Bank with 11,763 distinct RevisionDojo questions across 15,571 course/question variants '
    'and 15,645 source assignments, with RevisionDojo available as a source in Question Bank and Practice Builder filtering.'
)

# Detailed curated public changelog.
p = Path('app/changelog/page.tsx')
text = p.read_text()
anchor = "const latestReleaseNotes: ChangelogEntry[] = [\n"
if revision_note not in text:
    entry = (
        "  {\n"
        "    id: 'release-2026-09-16-revisiondojo-expansion',\n"
        "    summary:\n"
        f"      {revision_note!r},\n"
        "    date: '2026-09-16T14:26:39.840Z',\n"
        "  },\n"
    )
    text = text.replace(anchor, anchor + entry, 1)
p.write_text(text)

# Server-side fallback changelog mirrors the same release history.
p = Path('lib/changelog.ts')
text = p.read_text()
anchor = "  '2026-09-16': [\n"
if revision_note not in text:
    text = text.replace(anchor, anchor + f"    {revision_note!r},\n", 1)
p.write_text(text)

# Release-note regression coverage.
p = Path('tests/source-ui-and-whats-new.test.ts')
text = p.read_text()
text = text.replace("id: '2026-09-16-guided-onboarding-practice-builder'", "id: '2026-09-16-revisiondojo-guided-onboarding'")
text = text.replace("'Take a guided tour of DP Resources',\n      'Replay the tutorial anytime',", "'11,763 RevisionDojo questions added',\n      'Take a guided tour of DP Resources',\n      'Replay the tutorial anytime',")
text = text.replace("'Faster and steadier guided navigation',\n      'Clearer, more reliable Practice Builder',", "'Clearer and more reliable practice',\n      'More fixes since the last production release',")
text = text.replace("    expect(whatsNew).toContain('RevisionDojo');\n", "    expect(whatsNew).toContain('11,763 distinct RevisionDojo questions');\n    expect(whatsNew).toContain('15,571 course/question variants');\n")
needle = "      'Improved Support and resource-report attachment controls in dark mode',\n"
if "Expanded the Question Bank with 11,763 distinct RevisionDojo questions" not in text:
    text = text.replace(needle, "      'Expanded the Question Bank with 11,763 distinct RevisionDojo questions',\n" + needle, 1)
p.write_text(text)

p = Path('tests/account-settings.test.ts')
text = p.read_text()
text = text.replace("id: '2026-09-16-guided-onboarding-practice-builder'", "id: '2026-09-16-revisiondojo-guided-onboarding'")
text = text.replace("expect(whatsNew).toContain('Take a guided tour of DP Resources');", "expect(whatsNew).toContain('11,763 RevisionDojo questions added');\n    expect(whatsNew).toContain('Take a guided tour of DP Resources');")
text = text.replace("expect(whatsNew).toContain('Clearer, more reliable Practice Builder');", "expect(whatsNew).toContain('Clearer and more reliable practice');")
p.write_text(text)

p = Path('tests/admin-private-aliases-and-question-bank-activity.test.ts')
text = p.read_text()
text = text.replace("id: '2026-09-16-guided-onboarding-practice-builder'", "id: '2026-09-16-revisiondojo-guided-onboarding'")
text = text.replace("expect(changelog).toContain('Added a 12-step interactive onboarding walkthrough');", "expect(changelog).toContain('Expanded the Question Bank with 11,763 distinct RevisionDojo questions');\n    expect(changelog).toContain('Added a 12-step interactive onboarding walkthrough');")
text = text.replace("expect(whatsNew).toContain('Take a guided tour of DP Resources');", "expect(whatsNew).toContain('11,763 RevisionDojo questions added');\n    expect(whatsNew).toContain('Take a guided tour of DP Resources');")
p.write_text(text)
