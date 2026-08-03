import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Atom,
  Binary,
  BookOpenCheck,
  Brain,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Dna,
  DraftingCompass,
  FlaskConical,
  Landmark,
  Languages,
  Lightbulb,
  Map,
  MessageCircle,
  MessagesSquare,
  Network,
  Scale,
  Sigma,
  Sparkles,
  Sprout,
} from 'lucide-react';

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  biology: Dna,
  business: BriefcaseBusiness,
  chemistry: FlaskConical,
  'computer-science': Binary,
  'design-technology': DraftingCompass,
  'digital-society': Network,
  economics: ChartNoAxesCombined,
  'english-b': Languages,
  ess: Sprout,
  'french-b': MessageCircle,
  geography: Map,
  'global-politics': Scale,
  history: Landmark,
  mathematics: Sigma,
  physics: Atom,
  philosophy: Lightbulb,
  psychology: Brain,
  'spanish-b': MessagesSquare,
  'sports-exercise-and-health-science': Activity,
  'world-religions': Sparkles,
};

export function SubjectIcon({
  subjectSlug,
  compact = false,
}: {
  subjectSlug: string;
  compact?: boolean;
}) {
  const Icon = SUBJECT_ICONS[subjectSlug] || BookOpenCheck;
  return (
    <span
      className={`dp-qb-subject-icon${compact ? ' is-compact' : ''}`}
      data-subject={subjectSlug}
      aria-hidden="true"
    >
      <Icon className={compact ? 'size-4' : 'size-5'} />
    </span>
  );
}
