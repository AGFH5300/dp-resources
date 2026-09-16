from pathlib import Path

old_rev = ('Completed the full RevisionDojo production import after auditing 12,306 visible questions: '
           '11,832 source IDs were accepted and 474 withheld, with 28 canonical merges and 3 empty placeholders removed; '
           'after global deduplication, RevisionDojo now spans 11,763 distinct canonical questions, 15,571 distinct variants '
           'and 15,645 source links, with source filtering available in Question Bank and Practice Builder.')
new_rev = ('Expanded the Question Bank with 11,763 distinct RevisionDojo questions across 15,571 course/question variants '
           'and 15,645 source links after a full production import audit of 12,306 visible questions: 11,832 source IDs '
           'were accepted and 474 withheld, with 28 canonical merges and 3 empty placeholders removed; RevisionDojo source '
           'filtering is available in Question Bank and Practice Builder.')
old_dedupe = ('Consolidated 415 redundant canonical Question Bank rows in live Supabase: 384 confirmed Revision Village/cross-source '
              'duplicates and 31 exact Pestle duplicates, while preserving provenance, variants, topic placements, assets, papers '
              'and videos, saved questions and user progress; 16 ambiguous Revision Village reference collisions were deliberately left separate.')
new_dedupe = ('Consolidated 415 redundant canonical Question Bank rows in the live Question Bank: 384 confirmed Revision Village/cross-source '
              'duplicates and 31 exact Pestle duplicates, while preserving provenance, variants, topic placements, assets, papers '
              'and videos, saved questions and user progress; 16 ambiguous Revision Village reference collisions were deliberately left separate.')

for path in [Path('app/changelog/page.tsx'), Path('lib/changelog.ts')]:
    text = path.read_text()
    if old_rev not in text:
        raise SystemExit(f'missing RevisionDojo release string in {path}')
    text = text.replace(old_rev, new_rev)
    if old_dedupe not in text:
        raise SystemExit(f'missing 15 Sep dedupe string in {path}')
    text = text.replace(old_dedupe, new_dedupe)
    path.write_text(text)
