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
      'A major DP Resources update: a much larger Question Bank, expanded Physics coverage, private optimized diagrams, guided onboarding, steadier practice and a redesigned What’s New experience.',
    showWhatsNew: true,
    features: [
      {
        id: 'question-bank-expansion',
        title: 'A much bigger Question Bank',
        description:
          'This deployment brings RevisionDojo into the Question Bank at scale, adds CBS Physics and Save My Exams Kinematics, and expands reviewed coverage to seven sources. After the final asset-integrity audit, 57,675 unique variants are live and ready across RevisionDojo, Exam-Mate, PESTLE, Revision Town, Revision Village, CBS and Save My Exams.',
        badge: 'NEW',
        media: {
          type: 'illustration',
          variant: 'question-bank-current',
          alt: 'Current Question Bank coverage showing 57,675 live variants across seven reviewed sources.',
        },
        cta: { label: 'Open Question Bank', href: '/question-bank' },
      },
      {
        id: 'physics-expansion',
        title: 'Physics coverage goes deeper',
        description:
          'CBS now covers Physics A.1 through A.5 with 302 ready variants across SL and HL, while Save My Exams adds 44 A.1 Kinematics variants: 30 multiple-choice and 14 long-response across Easy, Medium and Hard. Duplicate matches stay consolidated rather than appearing twice.',
        badge: 'NEW',
        media: {
          type: 'illustration',
          variant: 'kinematics-coverage',
          alt: 'Physics coverage showing 44 Save My Exams A.1 Kinematics variants alongside 302 CBS Physics A.1 to A.5 variants.',
        },
        cta: { label: 'Explore Physics', href: '/question-bank' },
      },
      {
        id: 'private-question-bank-assets',
        title: 'Diagrams now load from DP Resources',
        description:
          'Imported question and markscheme diagrams are now served through DP Resources’ private asset pipeline instead of depending on provider websites. Verified compressed copies are used when meaningfully smaller, and image-dependent questions are withheld if a required source image cannot be recovered.',
        badge: 'IMPROVED',
        media: {
          type: 'illustration',
          variant: 'private-assets',
          alt: 'A private DP Resources asset pipeline showing verified and optimized Question Bank diagrams.',
        },
        cta: { label: 'Open Question Bank', href: '/question-bank' },
      },
      {
        id: 'guided-tour',
        title: 'Learn DP Resources on the real interface',
        description:
          'A new 12-step guided walkthrough introduces Library, the IB Resource Library, Question Bank, Search, Practice Builder, source filters, Recent, Saved and Settings without replacing the real product with a demo. You can replay it anytime from Settings.',
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
          'Practice Builder has clearer selection and hover states, stronger selected controls and more useful eligible-question feedback. Question Bank also handles slower source and course counts more gracefully, making the path from finding questions to starting practice more reliable.',
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
  {
    id: '2026-09-18-kinematics-source-expansion',
    label: 'September 2026',
    date: '2026-09-18',
    dateLabel: '18 September 2026',
    summary:
      'Physics A.1 Kinematics now includes Save My Exams coverage, bringing the Question Bank to 57,740 live question variants across seven reviewed sources.',
    showWhatsNew: false,
    features: [
      {
        id: 'question-bank-live-coverage',
        title: '57,740 live question variants',
        description:
          'The Question Bank now has 57,740 unique live variants across RevisionDojo, Exam-Mate, PESTLE, Revision Town, Revision Village, CBS and Save My Exams. Source totals show coverage and can overlap; the overall total is deduplicated.',
        badge: 'IMPROVED',
        media: {
          type: 'illustration',
          variant: 'question-bank-sep18',
          alt: 'A static Question Bank coverage snapshot showing live variant counts across seven reviewed sources, plus 57,740 total unique live variants.',
        },
        cta: { label: 'Open Question Bank', href: '/question-bank' },
      },
      {
        id: 'sme-kinematics-expansion',
        title: '44 new Save My Exams Kinematics variants',
        description:
          'Physics A.1 Kinematics now includes 30 multiple-choice and 14 long-response Save My Exams variants across Easy, Medium and Hard. Forty-two are new questions and two reuse existing matches so duplicates stay consolidated. Where a source paper does not include an official mark scheme, DP Resources keeps the question as self-assessed practice rather than inventing an answer.',
        badge: 'NEW',
        media: {
          type: 'illustration',
          variant: 'kinematics-coverage',
          alt: 'A static Physics coverage snapshot showing 44 Save My Exams A.1 Kinematics variants alongside 302 CBS Physics A.1 to A.5 variants.',
        },
        cta: { label: 'Explore Physics', href: '/question-bank' },
      },
    ],
  },
  {
    id: '2026-09-16-revisiondojo-guided-onboarding',
    label: 'September 2026',
    date: '2026-09-16',
    dateLabel: '16 September 2026',
    summary:
      'A major Question Bank expansion, broader Physics coverage, guided onboarding, steadier practice and a redesigned way to discover every major DP Resources update.',
    showWhatsNew: false,
    features: [
      {
        id: 'revisiondojo-question-bank',
        title: '57,696 live question variants',
        description:
          'The Question Bank reached 57,696 unique live variants across RevisionDojo, Exam-Mate, PESTLE, Revision Town, Revision Village and CBS. The source totals show variant coverage; some variants carry more than one source, so the overall total is deduplicated.',
        badge: 'NEW',
        media: {
          type: 'illustration',
          variant: 'question-bank',
          alt: 'A static Question Bank coverage snapshot showing live variant counts for RevisionDojo, Exam-Mate, PESTLE, Revision Town, Revision Village and CBS, plus 57,696 total unique live variants.',
        },
        cta: { label: 'Open Question Bank', href: '/question-bank' },
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
