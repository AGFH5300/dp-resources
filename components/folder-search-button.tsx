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
    const titleContent =
      titleBlock?.firstElementChild instanceof HTMLElement
        ? titleBlock.firstElementChild
        : null;
    const browseLinkCandidate = titleContent?.querySelector<HTMLAnchorElement>(
      'a[href="/library/sources"]',
    );
    const browseLink = browseLinkCandidate ?? null;
    const contentAfterToolbar =
      toolbar.nextElementSibling instanceof HTMLElement
        ? toolbar.nextElementSibling
        : null;

    const backOriginalParent = backLink?.parentElement ?? null;
    const backOriginalNextSibling = backLink?.nextSibling ?? null;
    const browseOriginalParent = browseLink?.parentElement ?? null;
    const browseOriginalNextSibling = browseLink?.nextSibling ?? null;

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
      backMarginTop: backLink?.style.marginTop ?? '',
      backMarginRight: backLink?.style.marginRight ?? '',
      backDisplay: backLink?.style.display ?? '',
      backAlignItems: backLink?.style.alignItems ?? '',
      browseMarginTop: browseLink?.style.marginTop ?? '',
      browseMarginRight: browseLink?.style.marginRight ?? '',
      browseDisplay: browseLink?.style.display ?? '',
      browseAlignItems: browseLink?.style.alignItems ?? '',
    };

    // In folder views the navigation links and folder controls form one compact
    // action row. This removes the disconnected Browse-by-source line and the
    // large visual gap that used to sit above the folder controls.
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.alignItems = 'center';
    toolbar.style.justifyContent = 'flex-start';
    toolbar.style.marginTop = '0.25rem';
    toolbar.style.paddingTop = '0.25rem';
    toolbar.style.paddingBottom = '0.375rem';
    if (titleBlock) titleBlock.style.marginTop = '0.375rem';
    if (contentAfterToolbar) contentAfterToolbar.style.marginTop = '0.375rem';

    if (backLink) {
      toolbar.insertBefore(backLink, toolbar.firstChild);
      backLink.style.marginTop = '0';
      backLink.style.marginRight = '0.75rem';
      backLink.style.display = 'inline-flex';
      backLink.style.alignItems = 'center';
    }

    if (browseLink) {
      const insertBefore = backLink?.nextSibling ?? toolbar.firstChild;
      toolbar.insertBefore(browseLink, insertBefore);
      browseLink.style.marginTop = '0';
      browseLink.style.display = 'inline-flex';
      browseLink.style.alignItems = 'center';
    }

    const media = window.matchMedia('(min-width: 768px)');
    const applyResponsiveLayout = () => {
      const desktop = media.matches;
      if (browseLink) {
        browseLink.style.marginRight = desktop ? 'auto' : '0.75rem';
      } else if (backLink) {
        backLink.style.marginRight = desktop ? 'auto' : '0.75rem';
      }
      actionGroup.style.marginLeft = '0';
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

      if (browseLink) {
        browseLink.style.marginTop = previous.browseMarginTop;
        browseLink.style.marginRight = previous.browseMarginRight;
        browseLink.style.display = previous.browseDisplay;
        browseLink.style.alignItems = previous.browseAlignItems;
        if (browseOriginalParent) {
          browseOriginalParent.insertBefore(browseLink, browseOriginalNextSibling);
        }
      }

      if (backLink) {
        backLink.style.marginTop = previous.backMarginTop;
        backLink.style.marginRight = previous.backMarginRight;
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
