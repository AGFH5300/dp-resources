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

  it('keeps the slide rail independently scrollable and resets the stage for each selected slide', () => {
    expect(viewer).toContain('aria-label="Slide picker"');
    expect(viewer).toContain('min-h-0 overflow-y-auto');
    expect(viewer).toContain('activeSlideRef.current?.scrollIntoView');
    expect(viewer).toContain("stage.current?.scrollTo({ top: 0, left: 0 })");
  });

  it('shows only the active rendered slide so adjacent pages cannot look duplicated', () => {
    expect(viewer).toContain('function showOnlyActiveSlide');
    expect(viewer).toContain('const active = index + 1 === activePage');
    expect(viewer).toContain("slide.style.display = active ? '' : 'none'");
    expect(viewer).not.toContain('Math.abs(index + 1 - page) <= 1');
  });

  it('constrains the browser-rendered PPTX within the stage', () => {
    expect(viewer).toContain('overflow-auto bg-slate-200 p-4');
    expect(viewer).toContain('pptx-preview-wrapper');
    expect(viewer).toContain('getBoundingClientRect().width - 32');
    expect(viewer).not.toContain('<canvas');
  });

  it('uses actual byte progress, explicit file size, a smoothed download ETA, and an honest rendered-slide count', () => {
    expect(viewer).toContain('readResponseWithProgress');
    expect(viewer).toContain("response.headers.get('x-file-size')");
    expect(viewer).toContain("response.headers.get('content-length')");
    expect(viewer).toContain("response.headers.get('content-range')");
    expect(viewer).toContain('Total size: ${formatBytes(downloadTotal)}');
    expect(viewer).toContain('function formatEta');
    expect(viewer).toContain('smoothedBytesPerSecond');
    expect(viewer).toContain('instantBytesPerSecond');
    expect(viewer).toContain('downloadEtaSeconds');
    expect(viewer).toContain('Download progress reflects the actual presentation bytes received.');
    expect(viewer).toContain('Slide rendering does not expose a percentage');
    expect(viewer).not.toContain('The ETA is based on the recent download speed');
    expect(viewer).toContain('MutationObserver');
    expect(viewer).toContain("querySelectorAll('.pptx-preview-slide-wrapper').length");
    expect(viewer).not.toContain('progress={pages ? 100 : 45}');
  });

  it('does not claim a rendering ETA that the third-party renderer cannot provide', () => {
    expect(viewer).toContain('Rendering time varies by presentation');
    expect(viewer).not.toContain('estimated rendering time');
  });

  it('gets the authoritative resource size from the authenticated content route', () => {
    const route = readFileSync('app/api/resource/[fileId]/content/route.ts', 'utf8');
    expect(route).toContain("'x-file-size': String(meta.size)");
    expect(route).toContain("nativeHeaders.set('x-file-size', String(meta.size))");
    expect(route).toContain("else if (!shouldServeRange) headers.set('content-length', String(meta.size))");
  });

  it('removes literal undefined text created by the third-party renderer', () => {
    expect(viewer).toContain('removeRendererTextArtifacts');
    expect(viewer).toContain("span.textContent?.trim() === 'undefined'");
    expect(viewer).toContain("node.nodeValue?.trim() === 'undefined'");
  });

  it('overlaps renderer module loading with the file download and defers audio parsing', () => {
    expect(viewer).toContain('const rendererModulesPromise = Promise.all');
    expect(viewer.indexOf('const rendererModulesPromise = Promise.all')).toBeLessThan(viewer.indexOf('await fetch(url'));
    expect(viewer).toContain('scheduleAudioExtraction(buffer)');
    expect(viewer).toContain('}, 500);');
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
