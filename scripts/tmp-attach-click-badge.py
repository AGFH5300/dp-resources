from pathlib import Path

controller_path = Path('components/tutorial/tutorial-controller.tsx')
controller = controller_path.read_text()

old_style = '''  const clickCueStyle = useMemo<CSSProperties | undefined>(() => {
    if (!visibleHighlight || typeof window === 'undefined') return undefined;

    const cueWidth = 96;
    const cueHeight = 38;
    const gap = 10;
    const centeredTop = clamp(
      visibleHighlight.top + visibleHighlight.height / 2 - cueHeight / 2,
      12,
      Math.max(12, window.innerHeight - cueHeight - 12),
    );

    if (visibleHighlight.left >= cueWidth + gap + 12) {
      return {
        left: visibleHighlight.left - cueWidth - gap,
        top: centeredTop,
      };
    }

    if (window.innerWidth - visibleHighlight.right >= cueWidth + gap + 12) {
      return {
        left: visibleHighlight.right + gap,
        top: centeredTop,
      };
    }

    const centeredLeft = clamp(
      visibleHighlight.left + visibleHighlight.width / 2 - cueWidth / 2,
      12,
      Math.max(12, window.innerWidth - cueWidth - 12),
    );
    const below = visibleHighlight.bottom + gap;
    const top =
      below + cueHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, visibleHighlight.top - cueHeight - gap);

    return { left: centeredLeft, top };
  }, [visibleHighlight]);
'''

new_style = '''  const clickCueStyle = useMemo<CSSProperties | undefined>(() => {
    if (!visibleHighlight || typeof window === 'undefined') return undefined;

    const cueWidth = 88;
    const cueHeight = 32;
    const inset = 10;
    const left = clamp(
      visibleHighlight.right - cueWidth - inset,
      8,
      Math.max(8, window.innerWidth - cueWidth - 8),
    );
    const top = clamp(
      visibleHighlight.top + inset,
      8,
      Math.max(8, window.innerHeight - cueHeight - 8),
    );

    return { left, top };
  }, [visibleHighlight]);
'''

if old_style not in controller:
    raise SystemExit('Expected clickCueStyle block not found')
controller = controller.replace(old_style, new_style, 1)

old_render = '''          {showClickCue ? (
            <div
              aria-hidden
              className="pointer-events-none fixed z-[95] flex items-center gap-2"
              style={clickCueStyle}
            >
              <span className="relative flex size-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg ring-2 ring-white dark:ring-slate-900">
                {!reducedMotion ? (
                  <span className="absolute inset-0 rounded-full bg-blue-400/60 animate-ping" />
                ) : null}
                <MousePointerClick className="relative size-4" aria-hidden />
              </span>
              <span
                className={`rounded-full bg-blue-600 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white shadow-lg ${
                  reducedMotion ? '' : 'animate-pulse'
                }`}
              >
                Click
              </span>
            </div>
          ) : null}
'''

new_render = '''          {showClickCue ? (
            <div
              aria-hidden
              className={`pointer-events-none fixed z-[95] inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-white bg-blue-600 px-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-xl dark:border-slate-950 ${
                reducedMotion ? '' : 'animate-pulse'
              }`}
              style={clickCueStyle}
            >
              <span className="relative flex size-4 items-center justify-center">
                {!reducedMotion ? (
                  <span className="absolute -inset-1 rounded-full bg-blue-300/70 animate-ping" />
                ) : null}
                <MousePointerClick className="relative size-4" aria-hidden />
              </span>
              Click
            </div>
          ) : null}
'''

if old_render not in controller:
    raise SystemExit('Expected click cue render block not found')
controller = controller.replace(old_render, new_render, 1)
controller_path.write_text(controller)

test_path = Path('tests/tutorial-onboarding.test.ts')
test = test_path.read_text()
old_test = '''  it('adds an obvious animated click beacon to required click targets', () => {
    expect(controller).toContain("step.interactionEvent === 'click'");
    expect(controller).toContain('pointer-events-none fixed z-[95]');
    expect(controller).toContain('visibleHighlight.left >= cueWidth + gap + 12');
    expect(controller).toContain('animate-ping');
    expect(controller).toContain('animate-pulse');
    expect(controller).toContain('Click');
    expect(controller).toContain("reducedMotion ? '' : 'animate-pulse'");
  });
'''
new_test = '''  it('attaches an obvious animated click badge directly to required click targets', () => {
    expect(controller).toContain("step.interactionEvent === 'click'");
    expect(controller).toContain('pointer-events-none fixed z-[95]');
    expect(controller).toContain('visibleHighlight.right - cueWidth - inset');
    expect(controller).toContain('visibleHighlight.top + inset');
    expect(controller).toContain('inline-flex h-8 items-center');
    expect(controller).toContain('animate-ping');
    expect(controller).toContain('animate-pulse');
    expect(controller).toContain('Click');
    expect(controller).toContain("reducedMotion ? '' : 'animate-pulse'");
  });
'''
if old_test not in test:
    raise SystemExit('Expected click cue regression test not found')
test = test.replace(old_test, new_test, 1)
test_path.write_text(test)
