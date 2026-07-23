import { Info } from 'lucide-react';

export function OldCourseBadge({
  interactive = false,
  finalAssessmentYear = null,
}: {
  interactive?: boolean;
  finalAssessmentYear?: number | null;
}) {
  const yearLabel = finalAssessmentYear
    ? ` · final assessment ${finalAssessmentYear}`
    : '';

  return (
    <span className="dp-qb-old-course">
      <span>
        Old course{yearLabel}
      </span>
      <span
        className="dp-qb-old-course-info"
        tabIndex={interactive ? 0 : undefined}
        aria-label="What old course means"
      >
        <Info className="size-3.5" aria-hidden="true" />
        <span className="dp-qb-old-course-tooltip" role="tooltip">
          These questions follow the previous IB course and assessment format.
          {finalAssessmentYear
            ? ` The final assessment under this course was in ${finalAssessmentYear}.`
            : ''}{' '}
          They are useful for older past-paper practice, but some content or
          paper structures may differ from the current course.
        </span>
      </span>
    </span>
  );
}
