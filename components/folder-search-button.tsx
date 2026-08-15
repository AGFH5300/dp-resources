'use client';

import { Search } from 'lucide-react';
import { useEffect, useRef } from 'react';

export function FolderSearchButton({
  folderId,
  folderName,
}: {
  folderId: string;
  folderName: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const searchButton = buttonRef.current;
    const actionGroup = searchButton?.parentElement;
    const toolbar = actionGroup?.parentElement;
    if (!searchButton || !actionGroup || !toolbar) return;

    // Keep folder-scoped actions visually grouped on the right with the view
    // controls. The left side of the Library already carries navigation/context.
    const previousMarginLeft = actionGroup.style.marginLeft;
    actionGroup.style.marginLeft = 'auto';

    const filterButton = Array.from(
      actionGroup.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.trim() === 'Filter');
    const filterContainer = filterButton?.parentElement;

    const alignFilterPanel = () => {
      const panel = Array.from(filterContainer?.children || []).find(
        (child) => child instanceof HTMLElement && child.classList.contains('absolute'),
      );
      if (!(panel instanceof HTMLElement)) return;
      panel.style.right = '0';
      panel.style.left = 'auto';
    };

    alignFilterPanel();
    const filterObserver = filterContainer
      ? new MutationObserver(alignFilterPanel)
      : null;
    if (filterContainer && filterObserver) {
      filterObserver.observe(filterContainer, { childList: true });
    }

    const closeFilter = () => {
      if (filterButton?.getAttribute('aria-expanded') === 'true') {
        filterButton.click();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (filterButton?.getAttribute('aria-expanded') !== 'true') return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // AppSelect menus are rendered in a Radix portal outside the filter
      // container, but interaction with them is still interaction with Filter.
      if (target.closest('.dp-select-content')) return;
      if (filterContainer?.contains(target)) return;
      closeFilter();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFilter();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      filterObserver?.disconnect();
      actionGroup.style.marginLeft = previousMarginLeft;
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent('dp:open-folder-search', {
            detail: { folderId, folderName },
          }),
        )
      }
      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      aria-label={`Search inside ${folderName}`}
    >
      <Search className="size-4" aria-hidden="true" />
      Search this folder
    </button>
  );
}
