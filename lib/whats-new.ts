export type WhatsNewBadge = 'NEW' | 'IMPROVED' | 'REDESIGNED';

export type WhatsNewImageMedia = {
  type: 'image';
  src: string;
  alt: string;
  objectPosition?: string;
};

export type WhatsNewVideoMedia = {
  type: 'video';
  src: string;
  poster?: string;
  alt: string;
  loop?: boolean;
  hasAudio?: boolean;
};

export type WhatsNewIllustrationMedia = {
  type: 'illustration';
  variant: 'question-bank' | 'physics-coverage' | 'guided-tour' | 'practice';
  alt: string;
};

export type WhatsNewMedia =
  | WhatsNewImageMedia
  | WhatsNewVideoMedia
  | WhatsNewIllustrationMedia;

export type WhatsNewFeature = {
  id: string;
  title: string;
  description: string;
  badge?: WhatsNewBadge;
  media?: WhatsNewMedia;
  cta?: {
    label?: string;
    href: string;
  };
};

export type WhatsNewRelease = {
  id: string;
  label: string;
  date: string;
  dateLabel: string;
  summary: string;
  showWhatsNew: boolean;
  features: readonly WhatsNewFeature[];
};

export const WHATS_NEW_RELEASES: readonly WhatsNewRelease[] = [
  {
    id: '2026-09-16-revisiondojo-guided-onboarding',
    label: 'September 2026',
    date: '2026-09-16',
    dateLabel: '16 September 2026',
    summary:
      'A major Question Bank expansion, broader Physics coverage, guided onboarding and a steadier practice experience.',
    showWhatsNew: true,
    features: [
      {
        id: 'revisiondojo-question-bank',
        title: '11,763 more questions to practise',
        description:
          'RevisionDojo is now a first-class Question Bank source, adding 11,763 distinct questions across 15,571 course and question variants. Filter by RevisionDojo in both Question Bank and Practice Builder whenever you want to practise from that source.',
        badge: 'NEW',
        media: {
          type: 'illustration',
          variant: 'question-bank',
          alt: 'A DP Resources Question Bank view highlighting RevisionDojo, 11,763 questions and source filtering.',
        },
        cta: { label: 'Try it', href: '/question-bank' },
      },
      {
        id: 'cbs-physics-coverage',
        title: 'Physics A.1–A.5, now with CBS',
        description:
          'CBS coverage is now live across Physics A.1 through A.5, with 302 ready variants spanning HL and SL. Topic and source filters make it much easier to go straight to the part of the course you want to practise.',
        badge: 'NEW',
        media: {
          type: 'illustration',
          variant: 'physics-coverage',
          alt: 'Physics topics A.1 through A.5 shown as covered by CBS with HL and SL question counts.',
        },
        cta: { label: 'Explore Physics', href: '/question-bank' },
      },
      {
        id: 'guided-tour',
        title: 'Learn DP Resources on the real interface',
        description:
          'A new 12-step guided walkthrough introduces Library, IB Resource Library, Question Bank, Search, Practice Builder, source filters, Recent, Saved and Settings without replacing the real product with a demo. You can replay it anytime from Settings.',
        badge: 'NEW',
        media: {
          type: 'illustration',
          variant: 'guided-tour',
          alt: 'A guided DP Resources walkthrough pointing to real navigation controls and showing step progress.',
        },
        cta: { label: 'Open Settings', href: '/settings' },
      },
      {
        id: 'practice-reliability',
        title: 'Practice that keeps moving',
        description:
          'Practice Builder selection states are clearer and Question Bank now handles slower source or course counts more gracefully. The result is a steadier path from finding a question to building and continuing a practice session.',
        badge: 'IMPROVED',
        media: {
          type: 'illustration',
          variant: 'practice',
          alt: 'A DP Resources practice session card showing a question queue and clear progress states.',
        },
        cta: { label: 'Build a practice set', href: '/question-bank' },
      },
    ],
  },
] as const;

export const WHATS_NEW_RELEASE =
  WHATS_NEW_RELEASES.find((release) => release.showWhatsNew) ??
  WHATS_NEW_RELEASES[0];

export const WHATS_NEW_SEEN_STORAGE_KEY = `dp-whats-new:${WHATS_NEW_RELEASE.id}`;
export const WHATS_NEW_SEEN_VALUE = 'seen';
export const WHATS_NEW_VIEWED_RELEASES_STORAGE_KEY =
  'dp-whats-new:viewed-releases:v1';
export const WHATS_NEW_OPEN_EVENT = 'dp:open-whats-new';
export const WHATS_NEW_SEEN_EVENT = 'dp:whats-new-seen';
export const WHATS_NEW_STATE_EVENT = 'dp:whats-new-state-changed';
export const WHATS_NEW_ANALYTICS_EVENT = 'dp:whats-new-analytics';

export function getWhatsNewRelease(releaseId: string | null | undefined) {
  if (!releaseId) return null;
  return WHATS_NEW_RELEASES.find((release) => release.id === releaseId) ?? null;
}

export function latestAutoOpenRelease() {
  return WHATS_NEW_RELEASES.find((release) => release.showWhatsNew) ?? null;
}
