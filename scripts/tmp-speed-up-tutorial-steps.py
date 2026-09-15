from pathlib import Path

controller_path = Path('components/tutorial/tutorial-controller.tsx')
text = controller_path.read_text()

replacements = [
    (
        """  route?: string;\n  target?: TutorialTarget;\n""",
        """  route?: string;\n  warmRoute?: string;\n  target?: TutorialTarget;\n""",
    ),
    (
        """    route: LIBRARY_ROUTE,\n    target: {\n      selectors: ['[data-tutorial-target=\"nav-library\"]'],\n""",
        """    route: LIBRARY_ROUTE,\n    warmRoute: '/question-bank',\n    target: {\n      selectors: ['[data-tutorial-target=\"nav-library\"]'],\n""",
    ),
    (
        """    route: '/question-bank',\n    target: {\n      selectors: ['button[aria-label^=\"Search library\"]'],\n""",
        """    route: '/question-bank',\n    warmRoute: '/question-bank/build',\n    target: {\n      selectors: ['button[aria-label^=\"Search library\"]'],\n""",
    ),
    (
        """    route: LIBRARY_ROUTE,\n    target: {\n      selectors: ['[data-tutorial-target=\"nav-saved\"]'],\n""",
        """    route: LIBRARY_ROUTE,\n    warmRoute: '/settings',\n    target: {\n      selectors: ['[data-tutorial-target=\"nav-saved\"]'],\n""",
    ),
    (
        """  const interactionTimerRef = useRef<number | null>(null);\n  const [active, setActive] = useState(false);\n""",
        """  const interactionTimerRef = useRef<number | null>(null);\n  const warmedRoutesRef = useRef(new Set<string>());\n  const [active, setActive] = useState(false);\n""",
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Expected controller block not found:\n{old}')
    text = text.replace(old, new, 1)

anchor = """  useEffect(() => {\n    const media = window.matchMedia('(prefers-reduced-motion: reduce)');\n    const update = () => setReducedMotion(media.matches);\n    update();\n    media.addEventListener?.('change', update);\n    return () => media.removeEventListener?.('change', update);\n  }, []);\n\n"""
insert = anchor + """  useEffect(() => {\n    const warmRoute = step.warmRoute;\n    if (!active || targetPending || !warmRoute || pathname === warmRoute) return;\n    if (warmedRoutesRef.current.has(warmRoute)) return;\n\n    // Warm only the next expensive tutorial destination, and only after the\n    // current spotlight is usable. This keeps navigation fast without bringing\n    // back the old all-routes-at-once prefetch load.\n    warmedRoutesRef.current.add(warmRoute);\n    router.prefetch(warmRoute);\n  }, [active, pathname, router, step.warmRoute, targetPending]);\n\n"""
if anchor not in text:
    raise SystemExit('Reduced-motion effect anchor not found')
text = text.replace(anchor, insert, 1)
controller_path.write_text(text)

test_path = Path('tests/tutorial-onboarding.test.ts')
test = test_path.read_text()
old_test = """  it('keeps navigation-heading steps on the library shell without eager heavy-route prefetches', () => {\n    expect(controller).toContain(\"const LIBRARY_ROUTE = '/library'\");\n    expect(controller).toContain(\"route: '/question-bank/build'\");\n    expect(controller).toContain(\"route: '/settings'\");\n    expect(controller).not.toContain('PREFETCH_ROUTES');\n    expect(controller).not.toContain('router.prefetch(');\n    expect(controller).toContain('router.replace(step.route)');\n    expect(controller).toContain(\"id: 'recent'\");\n    expect(controller).toContain(\"id: 'saved'\");\n    expect(controller).not.toContain('Loader2');\n    expect(controller).not.toContain('role=\"status\"');\n  });\n"""
new_test = """  it('warms only the next expensive tutorial route after the current spotlight is ready', () => {\n    expect(controller).toContain(\"const LIBRARY_ROUTE = '/library'\");\n    expect(controller).toContain(\"warmRoute: '/question-bank'\");\n    expect(controller).toContain(\"warmRoute: '/question-bank/build'\");\n    expect(controller).toContain(\"warmRoute: '/settings'\");\n    expect(controller).toContain('warmedRoutesRef');\n    expect(controller).toContain('if (!active || targetPending || !warmRoute');\n    expect(controller).toContain('router.prefetch(warmRoute)');\n    expect(controller).not.toContain('PREFETCH_ROUTES');\n    expect(controller).toContain('router.replace(step.route)');\n    expect(controller).toContain(\"id: 'recent'\");\n    expect(controller).toContain(\"id: 'saved'\");\n    expect(controller).not.toContain('Loader2');\n    expect(controller).not.toContain('role=\"status\"');\n  });\n"""
if old_test not in test:
    raise SystemExit('Tutorial prefetch regression test block not found')
test_path.write_text(test.replace(old_test, new_test, 1))
