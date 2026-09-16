export const WHATS_NEW_RELEASE = {
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
