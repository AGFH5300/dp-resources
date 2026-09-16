from pathlib import Path

# 1) Root-mount TutorialController so it survives page route swaps.
layout_path = Path('app/layout.tsx')
layout = layout_path.read_text()
if "import { TutorialController } from '@/components/tutorial/tutorial-controller';" not in layout:
    layout = layout.replace(
        "import { SiteFooter } from '@/components/site-footer';\n",
        "import { SiteFooter } from '@/components/site-footer';\nimport { TutorialController } from '@/components/tutorial/tutorial-controller';\n",
        1,
    )
layout = layout.replace(
    "        <GlobalSearch />\n        <AppToaster />\n",
    "        <TutorialController />\n        <GlobalSearch />\n        <AppToaster />\n",
    1,
)
layout_path.write_text(layout)

# 2) Remove per-page tutorial mount from Nav.
nav_path = Path('components/nav.tsx')
nav = nav_path.read_text()
nav = nav.replace("import { TutorialController } from './tutorial/tutorial-controller';\n", '')
nav = nav.replace('      <TutorialController userId={userId} />\n', '')
nav_path.write_text(nav)

# 3) Make controller auth-check itself once, persist across routes, and keep the prior
# spotlight geometry while a new route target is being prepared.
controller_path = Path('components/tutorial/tutorial-controller.tsx')
text = controller_path.read_text()
text = text.replace(
    'export function TutorialController({ userId }: { userId?: string | null }) {',
    'export function TutorialController() {',
    1,
)
text = text.replace(
    "  const [highlight, setHighlight] = useState<HighlightRect | null>(null);\n",
    "  const [highlight, setHighlight] = useState<HighlightRect | null>(null);\n  const [lastReadyHighlight, setLastReadyHighlight] = useState<HighlightRect | null>(null);\n",
    1,
)
text = text.replace(
    "  const visibleHighlight = targetReady ? highlight : null;\n",
    "  const visibleHighlight = targetReady ? highlight : (targetPending ? lastReadyHighlight : null);\n",
    1,
)
text = text.replace(
    "  useLayoutEffect(() => {\n    if (!userId) return;\n    try {\n",
    "  useLayoutEffect(() => {\n    try {\n",
    1,
)
text = text.replace("  }, [userId]);\n", "  }, []);\n", 1)
text = text.replace(
    "    (requestedIndex = 0, isReplay = false) => {\n      if (!userId) return;\n",
    "    (requestedIndex = 0, isReplay = false) => {\n",
    1,
)
text = text.replace("    [userId],\n  );", "    [],\n  );", 1)

old_init = """  useEffect(() => {\n    if (!userId) return;\n\n    const stored = readStoredSession();\n    if (stored) {\n      startTutorial(stored.stepIndex, Boolean(stored.replay));\n      return;\n    }\n\n    let cancelled = false;\n    const params = new URLSearchParams({\n      key: CORE_TUTORIAL_KEY,\n      version: String(CORE_TUTORIAL_VERSION),\n    });\n\n    void fetch(`/api/tutorials/progress?${params.toString()}`, {\n      cache: 'no-store',\n    })\n      .then(async (response) => {\n        if (!response.ok) throw new Error('Unable to load tutorial progress.');\n        return (await response.json()) as { dismissed?: boolean };\n      })\n      .then((payload) => {\n        if (cancelled) return;\n        if (!payload.dismissed) {\n          startTutorial(0, false);\n          return;\n        }\n        try {\n          window.sessionStorage.removeItem(TUTORIAL_CHECKING_STORAGE_KEY);\n        } catch {\n          // Best-effort coordination only.\n        }\n        window.dispatchEvent(new Event(TUTORIAL_CHECK_COMPLETE_EVENT));\n      })\n      .catch(() => {\n        if (cancelled) return;\n        try {\n          window.sessionStorage.removeItem(TUTORIAL_CHECKING_STORAGE_KEY);\n        } catch {\n          // Best-effort coordination only.\n        }\n        window.dispatchEvent(new Event(TUTORIAL_CHECK_COMPLETE_EVENT));\n      });\n\n    return () => {\n      cancelled = true;\n    };\n  }, [startTutorial, userId]);\n"""
new_init = """  useEffect(() => {\n    const stored = readStoredSession();\n    let cancelled = false;\n    const params = new URLSearchParams({\n      key: CORE_TUTORIAL_KEY,\n      version: String(CORE_TUTORIAL_VERSION),\n    });\n\n    // The controller is root-mounted so it survives App Router page swaps. Verify\n    // member access once before restoring a stored session; logged-out/auth pages\n    // simply fail this protected endpoint and never start the tutorial.\n    void fetch(`/api/tutorials/progress?${params.toString()}`, {\n      cache: 'no-store',\n    })\n      .then(async (response) => {\n        if (!response.ok) throw new Error('Unable to load tutorial progress.');\n        return (await response.json()) as { dismissed?: boolean };\n      })\n      .then((payload) => {\n        if (cancelled) return;\n        if (stored) {\n          startTutorial(stored.stepIndex, Boolean(stored.replay));\n          return;\n        }\n        if (!payload.dismissed) {\n          startTutorial(0, false);\n          return;\n        }\n        try {\n          window.sessionStorage.removeItem(TUTORIAL_CHECKING_STORAGE_KEY);\n        } catch {\n          // Best-effort coordination only.\n        }\n        window.dispatchEvent(new Event(TUTORIAL_CHECK_COMPLETE_EVENT));\n      })\n      .catch(() => {\n        if (cancelled) return;\n        clearStoredSession();\n        setActive(false);\n        try {\n          window.sessionStorage.removeItem(TUTORIAL_CHECKING_STORAGE_KEY);\n        } catch {\n          // Best-effort coordination only.\n        }\n        window.dispatchEvent(new Event(TUTORIAL_CHECK_COMPLETE_EVENT));\n      });\n\n    return () => {\n      cancelled = true;\n    };\n  }, [startTutorial]);\n"""
if old_init not in text:
    raise SystemExit('initial tutorial effect block not found')
text = text.replace(old_init, new_init, 1)

# Update highlight snapshots whenever a target is measured, and clear them only when
# the tutorial itself starts/closes (not between steps).
text = text.replace(
    "    const update = () => {\n      if (cancelled || !targetRef.current) return;\n      setHighlight(measureTarget(targetRef.current));\n    };\n",
    "    const update = () => {\n      if (cancelled || !targetRef.current) return;\n      const nextHighlight = measureTarget(targetRef.current);\n      setHighlight(nextHighlight);\n      setLastReadyHighlight(nextHighlight);\n    };\n",
    1,
)
text = text.replace(
    "      setHighlight(null);\n      setActive(true);\n",
    "      setHighlight(null);\n      setLastReadyHighlight(null);\n      setActive(true);\n",
    1,
)
text = text.replace(
    "      setHighlight(null);\n      setReadyStepId(null);\n      setActive(false);\n",
    "      setHighlight(null);\n      setLastReadyHighlight(null);\n      setReadyStepId(null);\n      setActive(false);\n",
    1,
)

# Do not clear the last geometry between steps; that is the visual bridge while the
# next route/loading boundary becomes ready.
text = text.replace(
    "      setReadyStepId(null);\n      setHighlight(null);\n      setStepIndex(clamped);\n",
    "      setReadyStepId(null);\n      setHighlight(null);\n      setStepIndex(clamped);\n",
    1,
)
controller_path.write_text(text)

# 4) Update onboarding regression expectations for persistent root mount + staged warmups.
test_path = Path('tests/tutorial-onboarding.test.ts')
test = test_path.read_text()
test = test.replace(
    "const nav = read('components/nav.tsx');\n",
    "const nav = read('components/nav.tsx');\nconst layout = read('app/layout.tsx');\n",
    1,
)
old_mount = """  it('mounts only inside the approved member navigation shell', () => {\n    expect(nav).toContain('<TutorialController userId={userId} />');\n    expect(nav).toContain('<AppHeader admin={admin} userId={userId} />');\n  });\n"""
new_mount = """  it('keeps one persistent tutorial controller above page route swaps', () => {\n    expect(layout).toContain('<TutorialController />');\n    expect(nav).not.toContain('TutorialController');\n    expect(nav).toContain('<AppHeader admin={admin} userId={userId} />');\n    expect(controller).toContain('export function TutorialController()');\n    expect(controller).toContain('if (stored) {');\n    expect(controller).toContain('clearStoredSession();');\n  });\n"""
if old_mount not in test:
    raise SystemExit('old tutorial mount test not found')
test = test.replace(old_mount, new_mount, 1)
anchor = """  it('warms only the next expensive tutorial route after the current spotlight is ready', () => {\n"""
if anchor not in test:
    raise SystemExit('warmup test anchor not found')
insert = """  it('holds the previous spotlight geometry until the next target is ready', () => {\n    expect(controller).toContain('lastReadyHighlight');\n    expect(controller).toContain('targetPending ? lastReadyHighlight : null');\n    expect(controller).toContain('setLastReadyHighlight(nextHighlight)');\n  });\n\n"""
test = test.replace(anchor, insert + anchor, 1)
test_path.write_text(test)
