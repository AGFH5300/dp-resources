from pathlib import Path

css = Path('components/question-bank/practice-set-builder-v2.module.css')
tutorial = Path('components/tutorial/tutorial-controller.tsx')
tutorial_test = Path('tests/tutorial-onboarding.test.ts')
polish_test = Path('tests/light-mode-builder-tutorial-polish.test.ts')

# Clip completed-subject fills to the rounded details border. The summary itself
# should not paint its own inherited four-corner radius when the details is open.
text = css.read_text()
old = """.pickerSubject {\n  border-color: var(--outline);\n  background: var(--dp-warm-surface);\n}\n"""
new = """.pickerSubject {\n  overflow: hidden;\n  border-color: var(--outline);\n  background: var(--dp-warm-surface);\n}\n"""
if old not in text:
    raise SystemExit('pickerSubject block not found')
text = text.replace(old, new, 1)
old = """.pickerSubjectComplete > summary {\n  background: #f0fdf4;\n  border-radius: inherit;\n}\n"""
new = """.pickerSubjectComplete > summary {\n  background: #f0fdf4;\n}\n"""
if old not in text:
    raise SystemExit('pickerSubjectComplete summary block not found')
text = text.replace(old, new, 1)
css.write_text(text)

# Prevent the Step 11 route guard from fighting the intentional /settings handoff.
text = tutorial.read_text()
old = """  const targetRef = useRef<HTMLElement | null>(null);\n  const interactionTimerRef = useRef<number | null>(null);\n  const warmedRoutesRef = useRef(new Set<string>());\n"""
new = """  const targetRef = useRef<HTMLElement | null>(null);\n  const interactionTimerRef = useRef<number | null>(null);\n  const routeHandoffRef = useRef<string | null>(null);\n  const warmedRoutesRef = useRef(new Set<string>());\n"""
if old not in text:
    raise SystemExit('tutorial refs anchor not found')
text = text.replace(old, new, 1)

old = """  useEffect(() => {\n    if (!active || !step.route || pathname === step.route) return;\n    router.replace(step.route);\n  }, [active, pathname, router, step.route]);\n"""
new = """  useEffect(() => {\n    if (!active || !step.route || pathname === step.route) return;\n    // A required tutorial click can intentionally navigate away from the current\n    // step's route before the next step is committed. Do not immediately bounce\n    // that navigation back to the old route while the handoff is in flight.\n    if (routeHandoffRef.current) return;\n    router.replace(step.route);\n  }, [active, pathname, router, step.route]);\n"""
if old not in text:
    raise SystemExit('route guard block not found')
text = text.replace(old, new, 1)

old = """    const commitNextStep = () => {\n      if (cancelled) return;\n      const nextIndex = Math.min(stepIndex + 1, STEPS.length - 1);\n      setStepIndex(nextIndex);\n      setReadyStepId(null);\n      setHighlight(null);\n      storeSession(nextIndex, replay);\n      interactionTimerRef.current = null;\n    };\n"""
new = """    const commitNextStep = () => {\n      if (cancelled) return;\n      const nextIndex = Math.min(stepIndex + 1, STEPS.length - 1);\n      routeHandoffRef.current = null;\n      setStepIndex(nextIndex);\n      setReadyStepId(null);\n      setHighlight(null);\n      storeSession(nextIndex, replay);\n      interactionTimerRef.current = null;\n    };\n"""
if old not in text:
    raise SystemExit('commitNextStep block not found')
text = text.replace(old, new, 1)

old = """      const eventName = step.interactionEvent ?? 'change';\n      if (step.id === 'settings-link' && pathname !== '/settings') {\n        router.replace('/settings');\n      }\n      if (eventName === 'change') {\n"""
new = """      const eventName = step.interactionEvent ?? 'change';\n      if (step.id === 'settings-link' && pathname !== '/settings') {\n        // The current step still belongs to /library because the Settings link is\n        // rendered inside that account menu. Mark the intentional cross-route\n        // handoff before navigating so the route guard cannot send us back.\n        event.preventDefault();\n        routeHandoffRef.current = '/settings';\n        router.replace('/settings');\n      }\n      if (eventName === 'change') {\n"""
if old not in text:
    raise SystemExit('settings handoff block not found')
text = text.replace(old, new, 1)
tutorial.write_text(text)

# Update regression coverage for the handoff and completed-subject clipping.
text = tutorial_test.read_text()
old = """    expect(controller).toContain(\"router.replace('/settings')\");\n"""
new = """    expect(controller).toContain(\"routeHandoffRef.current = '/settings'\");\n    expect(controller).toContain('if (routeHandoffRef.current) return');\n    expect(controller).toContain('event.preventDefault()');\n    expect(controller).toContain(\"router.replace('/settings')\");\n"""
if old not in text:
    raise SystemExit('tutorial test settings assertion not found')
text = text.replace(old, new, 1)
tutorial_test.write_text(text)

text = polish_test.read_text()
old = """    expect(css).toContain('.pickerSubjectComplete > summary');\n"""
new = """    expect(css).toContain('.pickerSubjectComplete > summary');\n    expect(css).toContain('.pickerSubject {\\n  overflow: hidden;');\n    expect(css).not.toContain('border-radius: inherit;');\n"""
if old not in text:
    raise SystemExit('polish test picker assertion not found')
text = text.replace(old, new, 1)
polish_test.write_text(text)
