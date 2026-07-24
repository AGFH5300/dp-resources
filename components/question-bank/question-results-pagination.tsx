import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import styles from './question-results-pagination.module.css';

export type QuestionPageLink = {
  page: number;
  href: string;
};

export function questionResultRange(
  total: number,
  currentPage: number,
  pageSize = 24,
) {
  if (total <= 0) return { start: 0, end: 0 };
  const safePage = Math.max(1, currentPage);
  return {
    start: (safePage - 1) * pageSize + 1,
    end: Math.min(safePage * pageSize, total),
  };
}

export function visibleQuestionPages(
  currentPage: number,
  pages: number,
  maximumVisible = 7,
) {
  const safePages = Math.max(1, pages);
  const safeCurrent = Math.min(Math.max(1, currentPage), safePages);
  const count = Math.min(Math.max(3, maximumVisible), safePages);
  let start = Math.max(1, safeCurrent - Math.floor(count / 2));
  let end = Math.min(safePages, start + count - 1);
  start = Math.max(1, end - count + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function QuestionResultsPagination({
  children,
  total,
  currentPage,
  pages,
  pageSize = 24,
  previousHref,
  nextHref,
  pageLinks,
}: {
  children: ReactNode;
  total: number;
  currentPage: number;
  pages: number;
  pageSize?: number;
  previousHref: string | null;
  nextHref: string | null;
  pageLinks: QuestionPageLink[];
}) {
  const range = questionResultRange(total, currentPage, pageSize);
  const offset = Math.max(0, (currentPage - 1) * pageSize);
  const counterStyle = {
    '--qb-question-offset': offset,
  } as CSSProperties;

  return (
    <div className={styles.wrapper} style={counterStyle}>
      {children}

      {pages > 1 ? (
        <nav className={styles.pagination} aria-label="Question result pages">
          {previousHref ? (
            <Link className={styles.direction} href={previousHref} rel="prev">
              <ChevronLeft className="size-4" aria-hidden />
              Previous
            </Link>
          ) : (
            <span className={`${styles.direction} ${styles.disabled}`} aria-disabled="true">
              <ChevronLeft className="size-4" aria-hidden />
              Previous
            </span>
          )}

          <div className={styles.center}>
            <p className={styles.range} aria-live="polite">
              Showing <strong>{range.start.toLocaleString()}–{range.end.toLocaleString()}</strong>{' '}
              of <strong>{total.toLocaleString()}</strong> questions
            </p>
            <div className={styles.pages} aria-label={`Page ${currentPage} of ${pages}`}>
              {pageLinks.map((link) =>
                link.page === currentPage ? (
                  <span
                    key={link.page}
                    className={`${styles.page} ${styles.current}`}
                    aria-current="page"
                  >
                    {link.page}
                  </span>
                ) : (
                  <Link key={link.page} className={styles.page} href={link.href}>
                    {link.page}
                  </Link>
                ),
              )}
            </div>
          </div>

          {nextHref ? (
            <Link className={styles.direction} href={nextHref} rel="next">
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span className={`${styles.direction} ${styles.disabled}`} aria-disabled="true">
              Next
              <ChevronRight className="size-4" aria-hidden />
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
