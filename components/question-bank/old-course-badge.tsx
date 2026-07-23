import { Info } from 'lucide-react';

export function OldCourseBadge({ interactive = false }: { interactive?: boolean }) {
  return (
    <span className="dp-qb-old-course">
      <span>Old course</span>
      <span
        className="dp-qb-old-course-info"
        tabIndex={interactive ? 0 : undefined}
        aria-label="What old course means"
      >
        <Info className="size-3.5" aria-hidden="true" />
        <span className="dp-qb-old-course-tooltip" role="tooltip">
          These questions follow the previous IB course and assessment format.
          They are useful for older past-paper practice, but some content or
          paper structures may differ from the current course.
        </span>
      </span>
    </span>
  );
}
