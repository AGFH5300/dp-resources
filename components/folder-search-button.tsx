'use client';

import { Search } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';

export function FolderSearchButton({
  folderId,
  folderName,
}: {
  folderId: string;
  folderName: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const searchButton = buttonRef.current;
    const actionGroup = searchButton?.parentElement;
    const toolbar = actionGroup?.parentElement;
    const toolbarParent = toolbar?.parentElement;
    if (!searchButton || !actionGroup || !toolbar || !toolbarParent) return;

    const backLinkCandidate = toolbar.previousElementSibling;
    const backLink =
      backLinkCandidate instanceof HTMLAnchorElement &&
      backLinkCandidate.textContent?.trim().startsWith('Back to ')
        ? backLinkCandidate
        : null;

    const previous = {
      actionMarginLeft: actionGroup.style.marginLeft,
      toolbarFlexWrap: toolbar.style.flexWrap,
      toolbarPaddingLeft: toolbar.style.paddingLeft,
      parentPosition: toolbarParent.style.position,
      backPosition: backLink?.style.position ?? '',
      backLeft: backLink?.style.left ?? '',
      backTop: backLink?.style.top ?? '',
      backZIndex: backLink?.style.zIndex ?? '',
      backMarginTop: backLink?.style.marginTop ?? '',
    };

    // Keep folder-scoped actions visually grouped on the right. On desktop the
    // parent-folder navigation shares this same row instead of consuming its own
    // line and leaving a large empty gap above the folder contents.
    actionGroup.style.marginLeft = 'auto';
    toolbar.style.flexWrap = 'wrap';

    const alignBackLink = () => {
      if (!backLink) return;
      const desktop = window.matchMedia('(min-width: 768px)').matches;
      if (!desktop) {
        backLink.style.position = previous.backPosition;
        backLink.style.left = previous.backLeft;
        backLink.style.top = previous.backTop;
        backLink.style.zIndex = previous.backZIndex;
        backLink.style.marginTop = previous.backMarginTop;
        toolbar.style.paddingLeft = previous.toolbarPaddingLeft;
        return;
      }

      toolbarParent.style.position = 'relative';
      backLink.style.position = 'absolute';
      backLink.style.left = '0';
      backLink.style.zIndex = '1';
      backLink.style.marginTop = '0';
      toolbar.style.paddingLeft = `${Math.ceil(backLink.getBoundingClientRect().width) + 16}px`;
      backLink.style.top = `${toolbar.offsetTop + Math.max(0, (toolbar.offsetHeight - backLink.offsetHeight) / 2)}px`;
    };

    const filterButton = Array.from(
      actionGroup.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.trim() === 'Filter');
    const filterContainer = filterButton?.parentElement;

    const alignFilterPanel = () => {
      const panel = Array.from(filterContainer?.children || []).find(
        (child) =>
          child instanceof HTMLElement && child.classList.contains('absolute'),
      );
      if (!(panel instanceof HTMLElement)) return;
      panel.style.right = '0';
      panel.style.left = 'auto';
    };

    alignFilterPanel();
    alignBackLink();

    const filterObserver = filterContainer
      ? new MutationObserver(() => {
          alignFilterPanel();
          alignBackLink();
        })
      : null;
    if (filterContainer && filterObserver) {
      filterObserver.observe(filterContainer, { childList: true });
    }

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(alignBackLink)
        : null;
    resizeObserver?.observe(toolbar);
    if (backLink) resizeObserver?.observe(backLink);

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
    window.addEventListener('resize', alignBackLink);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', alignBackLink);
      filterObserver?.disconnect();
      resizeObserver?.disconnect();
      actionGroup.style.marginLeft = previous.actionMarginLeft;
      toolbar.style.flexWrap = previous.toolbarFlexWrap;
      toolbar.style.paddingLeft = previous.toolbarPaddingLeft;
      toolbarParent.style.position = previous.parentPosition;
      if (backLink) {
        backLink.style.position = previous.backPosition;
        backLink.style.left = previous.backLeft;
        backLink.style.top = previous.backTop;
        backLink.style.zIndex = previous.backZIndex;
        backLink.style.marginTop = previous.backMarginTop;
      }
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
