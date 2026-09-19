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
  variant:
    | 'question-bank'
    | 'question-bank-current'
    | 'question-bank-sep18'
    | 'physics-coverage'
    | 'kinematics-coverage'
    | 'guided-tour'
    | 'practice'
    | 'private-assets'
    | 'whats-new-experience';
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
    id: '2026-09-19-september-deployment',
    label: 'September 2026',
    date: '2026-09-19',
    dateLabel: '19 September 2026',
    summary:
      'A major DP Resources update: a much larger Question Bank, expanded Physics coverage, clearer and faster diagrams, guided onboarding, steadier practice and a redesigned What’s New experience.',
    showWhatsNew: true,
    features: [
      {
        id: 'question-bank-expansion',
        title: 'A much bigger Question Bank',
        description:
          'This update brings a major Question Bank expansion, with RevisionDojo, CBS Physics and Save My Exams Kinematics joining the latest coverage. There are now 57,675 questions ready to practise across seven sources, giving you much more to work with in one place.',
        badge: 'NEW',
        media: {
          type: 'illustration',
          variant: 'question-bank-current',
          alt: 'Current Question Bank coverage showing 57,675 ready questions across seven available sources.',
        },
        cta: { label: 'Open Question Bank', href: '/question-bank' },
      },
      {
        id: 'physics-expansion',
        title: 'Physics coverage goes deeper',
        description:
          'CBS now covers Physics A.1 through A.5 with 302 ready questions across SL and HL, while Save My Exams adds 44 A.1 Kinematics questions: 30 multiple-choice and 14 long-response across Easy, Medium and Hard. Questions that already exist stay merged so you do not see unnecessary duplicates.',
        badge: 'NEW',
        media: {
          type: 'illustration',
          variant: 'kinematics-coverage',
          alt: 'Physics coverage showing 44 Save My Exams A.1 Kinematics questions alongside 302 CBS Physics A.1 to A.5 questions.',
        },
        cta: { label: 'Explore Physics', href: '/question-bank' },
      },
      {
        id: 'private-question-bank-assets',
        title: 'Clearer, faster question diagrams',
        description:
          'Question diagrams and markscheme visuals now load more reliably and efficiently. We also strengthened quality checks so questions missing an essential visual are kept out of live practice sets instead of appearing incomplete.',
        badge: 'IMPROVED',
        media: {
          type: 'illustration',
          variant: 'private-assets',
          alt: 'Question Bank diagram improvements focused on faster loading and more reliable display.',
        },
        cta: { label: 'Open Question Bank', href: '/question-bank' },
      },
      {
        id: 'guided-tour',
        title: 'Learn DP Resources on the real interface',
        description:
          'A new 12-step guided walkthrough introduces Library, the IB Resource Library, Question Bank, Search, Practice Builder, source filters, Recent, Saved and Settings. You can replay it anytime from Settings.',
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
        title: 'Practice feels clearer and steadier',
        description:
          'Practice Builder has clearer selection and hover states, stronger selected controls and more useful question feedback. Question Bank browsing and practice setup also stay smoother when information takes longer to load.',
        badge: 'IMPROVED',
        media: {
          type: 'illustration',
          variant: 'practice',
          alt: 'A DP Resources practice session showing clear selection and progress states.',
        },
        cta: { label: 'Build a practice set', href: '/question-bank/build' },
      },
      {
        id: 'whats-new-redesign',
        title: 'A better way to discover every update',
        description:
          'What’s New is now a feature-by-feature release experience with responsive slides, swipe, arrows, progress dots, keyboard navigation, media controls, Try it shortcuts, remembered viewed releases and a release history you can reopen anytime.',
        badge: 'REDESIGNED',
        media: {
          type: 'illustration',
          variant: 'whats-new-experience',
          alt: 'The redesigned What’s New experience with feature slides, progress navigation and release history.',
        },
        cta: { label: 'View full changelog', href: '/changelog' },
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
