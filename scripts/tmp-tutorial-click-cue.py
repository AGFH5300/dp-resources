from pathlib import Path

controller_path = Path('components/tutorial/tutorial-controller.tsx')
controller = controller_path.read_text()

tests_path = Path('tests/tutorial-onboarding.test.ts')
tests = tests_path.read_text()

old_source_try = """  {
    id: 'source-filters-try',
    title: 'Source filters: try one',
    description:
      'These are the real source controls inside Practice Builder. You can try a source checkbox to see the filter work, or simply continue to the next step.',
    route: '/question-bank/build',
    target: SOURCE_TARGET,
    interactive: true,
    advanceOnInteraction: true,
    interactionEvent: 'change',
    placement: 'left',
    centerTarget: true,
    interactionHint:
      'Try it now: click any source checkbox if you want, or press Next to continue.',
  },
"""
new_source_try = """  {
    id: 'source-filters-try',
    title: 'Source filters',
    description:
      'Choose one or more providers to restrict your practice set, or leave every source unchecked to use all available sources. You can try a checkbox here, or simply press Next without changing anything.',
    route: '/question-bank/build',
    target: SOURCE_TARGET,
    interactive: true,
    advanceOnInteraction: true,
    interactionEvent: 'change',
    placement: 'left',
    centerTarget: true,
    interactionHint:
      'Optional: click any source checkbox to try it, or press Next to continue.',
  },
"""
if old_source_try not in controller:
    raise SystemExit('Expected source-filters-try block not found')
controller = controller.replace(old_source_try, new_source_try, 1)

source_explain = """  {
    id: 'source-filters-explain',
    title: 'Use one source, several, or all',
    description:
      'Checked sources restrict the practice set to those providers. Leave every source unchecked to use all available sources. You can click the highlighted controls again now if you want to change or undo your test selection.',
    route: '/question-bank/build',
    target: SOURCE_TARGET,
    interactive: true,
    placement: 'left',
    centerTarget: true,
    interactionHint:
      'The highlighted controls stay live while this step is open. Change them if you want, or just press Next.',
  },
"""
if source_explain not in controller:
    raise SystemExit('Expected source-filters-explain block not found')
controller = controller.replace(source_explain, '', 1)

card_style_tail = """    return { right: 16, top: 88, width };
  }, [step.placement, visibleHighlight]);

  if (!active) return null;
"""
click_cue_code = """    return { right: 16, top: 88, width };
  }, [step.placement, visibleHighlight]);

  const clickCueStyle = useMemo<CSSProperties | undefined>(() => {
    if (!visibleHighlight || typeof window === 'undefined') return undefined;

    const cueWidth = 96;
    const cueHeight = 38;
    const left = clamp(
      visibleHighlight.left + visibleHighlight.width / 2 - cueWidth / 2,
      12,
      Math.max(12, window.innerWidth - cueWidth - 12),
    );
    const below = visibleHighlight.bottom + 10;
    const top =
      below + cueHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, visibleHighlight.top - cueHeight - 10);

    return { left, top };
  }, [visibleHighlight]);

  if (!active) return null;

  const showClickCue = Boolean(
    visibleHighlight &&
      requiresInteraction &&
      step.interactionEvent === 'click' &&
      clickCueStyle,
  );
"""
if card_style_tail not in controller:
    raise SystemExit('Expected card style tail not found')
controller = controller.replace(card_style_tail, click_cue_code, 1)

highlight_block = """          <div
            aria-hidden
            className={`pointer-events-none fixed z-[90] rounded-xl border-2 border-blue-400 ring-4 ring-white/80 ${
              reducedMotion ? '' : 'transition-all duration-150'
            }`}
            style={{
              left: visibleHighlight.left,
              top: visibleHighlight.top,
              width: visibleHighlight.width,
              height: visibleHighlight.height,
            }}
          />
"""
cue_render = highlight_block + """          {showClickCue ? (
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
"""
if highlight_block not in controller:
    raise SystemExit('Expected highlight block not found')
controller = controller.replace(highlight_block, cue_render, 1)

controller_path.write_text(controller)

# Tests: one source step only.
tests = tests.replace(
    "    expect(controller).toContain(\"id: 'source-filters-explain'\");\n",
    "    expect(controller).not.toContain(\"id: 'source-filters-explain'\");\n",
    1,
)
tests = tests.replace(
    "    expect(controller).toContain('The highlighted controls stay live');\n",
    "    expect(controller).toContain('Optional: click any source checkbox');\n",
    1,
)

old_optional_test = """  it('keeps the first source interaction optional while auto-positioning the target', () => {
    const start = controller.indexOf(\"id: 'source-filters-try'\");
    const end = controller.indexOf(\"id: 'source-filters-explain'\");
    const sourceTry = controller.slice(start, end);
    expect(sourceTry).toContain('centerTarget: true');
    expect(sourceTry).toContain('press Next to continue');
    expect(sourceTry).not.toContain('requireInteraction: true');
    expect(controller).toContain('step.centerTarget ||');
  });
"""
new_optional_test = """  it('keeps a single optional source lesson and auto-positions the target', () => {
    const start = controller.indexOf(\"id: 'source-filters-try'\");
    const end = controller.indexOf(\"id: 'recent'\");
    const sourceStep = controller.slice(start, end);
    expect(sourceStep).toContain("title: 'Source filters'");
    expect(sourceStep).toContain('centerTarget: true');
    expect(sourceStep).toContain('press Next to continue');
    expect(sourceStep).not.toContain('requireInteraction: true');
    expect(controller).not.toContain(\"id: 'source-filters-explain'\");
    expect(controller).toContain('step.centerTarget ||');
  });
"""
if old_optional_test not in tests:
    raise SystemExit('Expected optional source test not found')
tests = tests.replace(old_optional_test, new_optional_test, 1)

settings_test_anchor = """  it('makes the Settings finale a required click-through sequence ending at Replay tutorial', () => {
"""
click_cue_test = """  it('adds an obvious animated click beacon to required click targets', () => {
    expect(controller).toContain("step.interactionEvent === 'click'");
    expect(controller).toContain('pointer-events-none fixed z-[95]');
    expect(controller).toContain('animate-ping');
    expect(controller).toContain('animate-pulse');
    expect(controller).toContain('Click');
    expect(controller).toContain("reducedMotion ? '' : 'animate-pulse'");
  });

"""
if settings_test_anchor not in tests:
    raise SystemExit('Expected settings test anchor not found')
tests = tests.replace(settings_test_anchor, click_cue_test + settings_test_anchor, 1)

tests_path.write_text(tests)
