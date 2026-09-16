from pathlib import Path

loading = Path('app/question-bank/build/loading.tsx')
tutorial = Path('components/tutorial/tutorial-controller.tsx')
test = Path('tests/tutorial-onboarding.test.ts')

# Keep the immediate Practice Builder loading shell visually aligned with the real
# Sources fieldset the tutorial will hand off to.
text = loading.read_text()
old = "const SOURCES = ['Revision Village', 'Revision Town', 'PESTLE', 'Exam-Mate'];"
new = """const SOURCES = [
  { label: 'Revision Village', count: 4_192 },
  { label: 'Revision Town', count: 12_212 },
  { label: 'PESTLE', count: 13_291 },
  { label: 'Exam-Mate', count: 13_374 },
  { label: 'RevisionDojo', count: 81 },
] as const;"""
if old not in text:
    raise SystemExit('loading SOURCES constant not found')
text = text.replace(old, new, 1)
old = """                    {SOURCES.map((source) => (
                      <label key={source} className=\"flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200\">
                        <input type=\"checkbox\" />
                        <span className=\"min-w-0 flex-1 truncate\">{source}</span>
                      </label>
                    ))}"""
new = """                    {SOURCES.map((source) => (
                      <label key={source.label} className=\"flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200\">
                        <input type=\"checkbox\" />
                        <span className=\"min-w-0 flex-1 truncate\">{source.label}</span>
                        <span className=\"shrink-0 tabular-nums text-xs text-slate-500 dark:text-slate-400\">
                          {source.count.toLocaleString()}
                        </span>
                      </label>
                    ))}"""
if old not in text:
    raise SystemExit('loading SOURCES map not found')
text = text.replace(old, new, 1)
loading.write_text(text)

text = tutorial.read_text()
text = text.replace(
    """    interactionAdvanceDelayMs: 90,\n    requireInteraction: true,\n    interactionHint: 'Click the highlighted Settings item to continue.',""",
    """    interactionAdvanceDelayMs: 0,\n    requireInteraction: true,\n    interactionHint: 'Click the highlighted Settings item to continue.',""",
    1,
)
old = """  useEffect(() => {
    if (!active || !step.route || pathname === step.route) return;
    // A required tutorial click can intentionally navigate away from the current
    // step's route before the next step is committed. Do not immediately bounce
    // that navigation back to the old route while the handoff is in flight.
    if (routeHandoffRef.current) return;
    router.replace(step.route);
  }, [active, pathname, router, step.route]);"""
new = """  useEffect(() => {
    const handoffRoute = routeHandoffRef.current;
    if (handoffRoute && pathname === handoffRoute) {
      routeHandoffRef.current = null;
      return;
    }
    if (!active || !step.route || pathname === step.route) return;
    // A required tutorial click can intentionally navigate away from the current
    // step's route before the next step is committed. Do not immediately bounce
    // that navigation back to the old route while the handoff is in flight.
    if (routeHandoffRef.current) return;
    router.replace(step.route);
  }, [active, pathname, router, step.route]);"""
if old not in text:
    raise SystemExit('route guard not found')
text = text.replace(old, new, 1)
old = """    const commitNextStep = () => {
      if (cancelled) return;
      const nextIndex = Math.min(stepIndex + 1, STEPS.length - 1);
      routeHandoffRef.current = null;
      setStepIndex(nextIndex);"""
new = """    const commitNextStep = () => {
      if (cancelled) return;
      const nextIndex = Math.min(stepIndex + 1, STEPS.length - 1);
      setStepIndex(nextIndex);"""
if old not in text:
    raise SystemExit('commitNextStep handoff clear not found')
text = text.replace(old, new, 1)
old = """      if (step.id === 'settings-link' && pathname !== '/settings') {
        // The current step still belongs to /library because the Settings link is
        // rendered inside that account menu. Mark the intentional cross-route
        // handoff before navigating so the route guard cannot send us back.
        event.preventDefault();
        routeHandoffRef.current = '/settings';
        router.replace('/settings');
      }
      if (eventName === 'change') {"""
new = """      if (step.id === 'settings-link' && pathname !== '/settings') {
        // Advance the tutorial state in the same click that starts navigation.
        // A delayed timer would be cancelled when pathname changes and the target
        // effect is torn down, leaving the tour stranded on Step 11.
        event.preventDefault();
        routeHandoffRef.current = '/settings';
        commitNextStep();
        router.replace('/settings');
        return;
      }
      if (eventName === 'change') {"""
if old not in text:
    raise SystemExit('settings interaction block not found')
text = text.replace(old, new, 1)
tutorial.write_text(text)

text = test.read_text()
text = text.replace(
    "const settingsPage = read('app/settings/page.tsx');\n",
    "const settingsPage = read('app/settings/page.tsx');\nconst practiceBuilderLoading = read('app/question-bank/build/loading.tsx');\n",
    1,
)
text = text.replace(
    "expect(controller).toContain('interactionAdvanceDelayMs: 90');",
    "expect(controller).toContain('interactionAdvanceDelayMs: 0');",
    1,
)
old = """    expect(controller).toContain(\"routeHandoffRef.current = '/settings'\");
    expect(controller).toContain('if (routeHandoffRef.current) return');
    expect(controller).toContain('event.preventDefault()');
    expect(controller).toContain(\"router.replace('/settings')\");"""
new = """    expect(controller).toContain(\"routeHandoffRef.current = '/settings'\");
    expect(controller).toContain('if (routeHandoffRef.current) return');
    expect(controller).toContain('if (handoffRoute && pathname === handoffRoute)');
    expect(controller).toContain('event.preventDefault()');
    expect(controller).toContain('commitNextStep();');
    expect(controller).toContain(\"router.replace('/settings')\");"""
if old not in text:
    raise SystemExit('settings assertions block not found')
text = text.replace(old, new, 1)
anchor = """  it('keeps a single optional source lesson and auto-positions the target', () => {"""
insert = """  it('keeps the Step 7 loading shell aligned with the live Sources list', () => {
    expect(practiceBuilderLoading).toContain("{ label: 'Revision Village', count: 4_192 }");
    expect(practiceBuilderLoading).toContain("{ label: 'Revision Town', count: 12_212 }");
    expect(practiceBuilderLoading).toContain("{ label: 'PESTLE', count: 13_291 }");
    expect(practiceBuilderLoading).toContain("{ label: 'Exam-Mate', count: 13_374 }");
    expect(practiceBuilderLoading).toContain("{ label: 'RevisionDojo', count: 81 }");
    expect(practiceBuilderLoading).toContain('source.count.toLocaleString()');
  });

""" + anchor
if anchor not in text:
    raise SystemExit('source lesson test anchor not found')
text = text.replace(anchor, insert, 1)
test.write_text(text)
