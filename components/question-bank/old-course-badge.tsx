import { Info } from 'lucide-react';

type OldCourseBadgeProps = {
  interactive?: boolean;
  finalAssessmentYear?: number | null;
};

export function OldCourseBadge({
  interactive = false,
  finalAssessmentYear = null,
}: OldCourseBadgeProps) {
  const visibleLabel = finalAssessmentYear
    ? `Old course · final assessment ${finalAssessmentYear}`
    : 'Old course';
  const explanation = finalAssessmentYear
    ? `These questions follow the previous IB course and assessment format, whose final assessment was in ${finalAssessmentYear}. They are useful for older past-paper practice, but some content or paper structures may differ from the current course.`
    : 'These questions follow the previous IB course and assessment format. They are useful for older past-paper practice, but some content or paper structures may differ from the current course.';

  return (
    <span className="dp-qb-old-course">
      <span>{visibleLabel}</span>
      <span
        className="dp-qb-old-course-info"
        tabIndex={interactive ? 0 : undefined}
        aria-label="What old course means"
      >
        <Info className="size-3.5" aria-hidden="true" />
        <span className="dp-qb-old-course-tooltip" role="tooltip">
          {explanation}
        </span>
      </span>
    </span>
  );
}
