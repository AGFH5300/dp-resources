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
    const titleBlock =
      backLink?.previousElementSibling instanceof HTMLElement
        ? backLink.previousElementSibling
        : null;
    const contentAfterToolbar =
      toolbar.nextElementSibling instanceof HTMLElement
        ? toolbar.nextElementSibling
        : null;
    const backOriginalParent = backLink?.parentElement ?? null;
    const backOriginalNextSibling = backLink?.nextSibling ?? null;

    const previous = {
      actionMarginLeft: actionGroup.style.marginLeft,
      toolbarFlexWrap: toolbar.style.flexWrap,
      toolbarAlignItems: toolbar.style.alignItems,
      toolbarJustifyContent: toolbar.style.justifyContent,
      toolbarMarginTop: toolbar.style.marginTop,
      toolbarPaddingTop: toolbar.style.paddingTop,
      toolbarPaddingBottom: toolbar.style.paddingBottom,
      titleMarginTop: titleBlock?.style.marginTop ?? '',
      contentMarginTop: contentAfterToolbar?.style.marginTop ?? '',
      backPosition: backLink?.style.position ?? '',
      backLeft: backLink?.style.left ?? '',
      backTop: backLink?.style.top ?? '',
      backZIndex: backLink?.style.zIndex ?? '',
      backMarginTop: backLink?.style.marginTop ?? '',
      backMarginRight: backLink?.style.marginRight ?? '',
      backWidth: backLink?.style.width ?? '',
      backDisplay: backLink?.style.display ?? '',
      backAlignItems: backLink?.style.alignItems ?? '',
    };

    // Keep the whole folder header compact. The parent-folder navigation is a
    // real member of the toolbar row rather than being absolutely positioned,
    // which avoids the large empty slot that used to remain in the header.
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.alignItems = 'center';
    toolbar.style.justifyContent = 'flex-start';
    toolbar.style.marginTop = '0.5rem';
    toolbar.style.paddingTop = '0.25rem';
    toolbar.style.paddingBottom = '0.25rem';
    if (titleBlock) titleBlock.style.marginTop = '0.5rem';
    if (contentAfterToolbar) contentAfterToolbar.style.marginTop = '0.5rem';

    if (backLink) {
      toolbar.insertBefore(backLink, toolbar.firstChild);
      backLink.style.position = 'static';
      backLink.style.left = '';
      backLink.style.top = '';
      backLink.style.zIndex = '';
      backLink.style.marginTop = '0';
      backLink.style.display = 'inline-flex';
      backLink.style.alignItems = 'center';
    }

    const media = window.matchMedia('(min-width: 768px)');
    const applyResponsiveLayout = () => {
      const desktop = media.matches;
      if (backLink) {
        backLink.style.width = desktop ? 'auto' : '100%';
        backLink.style.marginRight = desktop ? 'auto' : '0';
        actionGroup.style.marginLeft = '0';
      } else {
        actionGroup.style.marginLeft = 'auto';
      }
    };
    applyResponsiveLayout();
    media.addEventListener('change', applyResponsiveLayout);

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
      media.removeEventListener('change', applyResponsiveLayout);
      filterObserver?.disconnect();

      actionGroup.style.marginLeft = previous.actionMarginLeft;
      toolbar.style.flexWrap = previous.toolbarFlexWrap;
      toolbar.style.alignItems = previous.toolbarAlignItems;
      toolbar.style.justifyContent = previous.toolbarJustifyContent;
      toolbar.style.marginTop = previous.toolbarMarginTop;
      toolbar.style.paddingTop = previous.toolbarPaddingTop;
      toolbar.style.paddingBottom = previous.toolbarPaddingBottom;
      if (titleBlock) titleBlock.style.marginTop = previous.titleMarginTop;
      if (contentAfterToolbar)
        contentAfterToolbar.style.marginTop = previous.contentMarginTop;

      if (backLink) {
        backLink.style.position = previous.backPosition;
        backLink.style.left = previous.backLeft;
        backLink.style.top = previous.backTop;
        backLink.style.zIndex = previous.backZIndex;
        backLink.style.marginTop = previous.backMarginTop;
        backLink.style.marginRight = previous.backMarginRight;
        backLink.style.width = previous.backWidth;
        backLink.style.display = previous.backDisplay;
        backLink.style.alignItems = previous.backAlignItems;
        if (backOriginalParent) {
          backOriginalParent.insertBefore(backLink, backOriginalNextSibling);
        }
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
