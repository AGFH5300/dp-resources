from pathlib import Path

controller_path = Path('components/tutorial/tutorial-controller.tsx')
controller = controller_path.read_text()

old = """  const clickCueStyle = useMemo<CSSProperties | undefined>(() => {
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
"""
new = """  const clickCueStyle = useMemo<CSSProperties | undefined>(() => {
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
"""
if old not in controller:
    raise SystemExit('Expected click cue positioning block not found')
controller_path.write_text(controller.replace(old, new, 1))

tests_path = Path('tests/tutorial-onboarding.test.ts')
tests = tests_path.read_text()
anchor = "    expect(controller).toContain('pointer-events-none fixed z-[95]');\n"
addition = anchor + "    expect(controller).toContain('visibleHighlight.left >= cueWidth + gap + 12');\n"
if anchor not in tests:
    raise SystemExit('Expected click cue test anchor not found')
tests_path.write_text(tests.replace(anchor, addition, 1))
