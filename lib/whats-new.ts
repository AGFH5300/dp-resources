export const WHATS_NEW_RELEASE = {
  id: '2026-09-16-revisiondojo-guided-onboarding',
  dateLabel: '16 September 2026',
  items: [
    {
      title: '11,763 RevisionDojo questions added',
      description:
        'A full production import audited 12,306 visible RevisionDojo questions and accepted 11,832 source IDs. After deduplication, the Question Bank now contains 11,763 distinct RevisionDojo questions across 15,571 course/question variants, with 15,645 source links and RevisionDojo filtering throughout Question Bank and Practice Builder.',
    },
    {
      title: 'CBS Physics A.1–A.5 added',
      description:
        'CBS has now been fully imported from 341 source occurrences into 217 distinct questions and 302 live, ready variants across Physics A.1–A.5: 137 HL and 165 SL. All CBS variants passed final render QA with zero remaining quarantined variants.',
    },
    {
      title: '606 redundant question rows cleaned up safely',
      description:
        'Two live Question Bank deduplication passes consolidated 415 redundant canonical rows on 15 September and another 191 on 16 September, while preserving source provenance, variants, assets, saved questions, practice references and user progress. Ambiguous collisions were kept separate instead of being force-merged.',
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
