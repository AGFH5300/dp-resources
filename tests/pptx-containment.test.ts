import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('PPTX viewer containment', () => {
  const viewer = readFileSync('app/resource/[fileId]/presentation-viewer.tsx', 'utf8');

  it('has bounded normal-page height and overflow-hidden shell without an extra top border', () => {
    expect(viewer).toContain('h-[min(78dvh,calc(100dvh-9rem))]');
    expect(viewer).toContain('min-h-[520px]');
    expect(viewer).toContain('overflow-hidden');
    expect(viewer).not.toContain('border-y border-slate-200');
  });

  it('uses fixed header and grid columns with min-h-0', () => {
    expect(viewer).toContain('shrink-0 flex items-center');
    expect(viewer).toContain('grid-cols-[112px_minmax(0,1fr)]');
    expect(viewer).toContain('min-h-0 flex-1');
  });

  it('keeps the slide rail independently scrollable and the active slide in view', () => {
    expect(viewer).toContain('aria-label="Slide picker"');
    expect(viewer).toContain('min-h-0 overflow-y-auto');
    expect(viewer).toContain('activeSlideRef.current?.scrollIntoView');
  });

  it('constrains the browser-rendered PPTX within the stage', () => {
    expect(viewer).toContain('overflow-auto bg-slate-200 p-4');
    expect(viewer).toContain('pptx-preview-wrapper');
    expect(viewer).toContain('getBoundingClientRect().width - 32');
    expect(viewer).not.toContain('<canvas');
  });

  it('shows a visible staged loading state during browser rendering', () => {
    expect(viewer).toContain('PresentationLoadingOverlay');
    expect(viewer).toContain('Preparing presentation preview');
    expect(viewer).toContain('Rendering slides in your browser');
    expect(viewer).toContain('Large PPTX files can take a short moment to load.');
    expect(viewer).not.toContain('while LibreOffice converts');
  });

  it('stops failed render attempts instead of only hiding them', () => {
    expect(viewer).toContain("watchdog = setTimeout(() => failAttempt('Presentation rendering timed out.')");
    expect(viewer).toContain('mountedApp.unmount()');
    expect(viewer).toContain('root.current?.replaceChildren()');
    expect(viewer).toContain('controller.abort()');
    expect(viewer).toContain('revokeObjectUrls(attemptUrls)');
  });

  it('fails safely when the renderer reports success without producing slides', () => {
    expect(viewer).toContain('if (nodes.length === 0)');
    expect(viewer).toContain('Presentation renderer produced no slides.');
  });

  it('offers download fallback from the PPTX failure panel and toolbar', () => {
    expect(viewer).toContain('>Download</a>');
    expect(viewer).toContain('Download presentation');
    expect(viewer).toContain('/api/files/${fileId}/download');
  });
});
