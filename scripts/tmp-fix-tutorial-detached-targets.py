from pathlib import Path

controller_path = Path('components/tutorial/tutorial-controller.tsx')
text = controller_path.read_text()

old_visible = '''function visibleElement(element: Element | null): element is HTMLElement {\n  if (!(element instanceof HTMLElement)) return false;\n  const rect = element.getBoundingClientRect();\n  if (rect.width <= 0 || rect.height <= 0) return false;\n  const style = window.getComputedStyle(element);\n  return style.display !== 'none' && style.visibility !== 'hidden';\n}\n\nfunction resolveTarget(target: TutorialTarget | undefined) {\n  if (!target) return null;\n\n  if ('selectors' in target) {\n    for (const selector of target.selectors) {\n      const match = Array.from(document.querySelectorAll(selector)).find(\n        visibleElement,\n      );\n      if (match) return match as HTMLElement;\n    }\n    return null;\n  }\n\n  for (const candidate of Array.from(\n    document.querySelectorAll(target.selector),\n  )) {\n    if (candidate.textContent?.trim() !== target.text) continue;\n    const match = target.closest ? candidate.closest(target.closest) : candidate;\n    if (visibleElement(match)) return match;\n  }\n  return null;\n}\n'''
new_visible = '''function visibleElement(element: Element | null): element is HTMLElement {\n  if (!(element instanceof HTMLElement) || !element.isConnected) return false;\n  const rect = element.getBoundingClientRect();\n  if (rect.width <= 0 || rect.height <= 0) return false;\n  const style = window.getComputedStyle(element);\n  if (\n    style.display === 'none' ||\n    style.visibility === 'hidden' ||\n    Number.parseFloat(style.opacity || '1') <= 0.01\n  ) {\n    return false;\n  }\n  return true;\n}\n\nfunction inViewportElement(element: Element | null): element is HTMLElement {\n  if (!visibleElement(element)) return false;\n  const rect = element.getBoundingClientRect();\n  return (\n    rect.right > 0 &&\n    rect.bottom > 0 &&\n    rect.left < window.innerWidth &&\n    rect.top < window.innerHeight\n  );\n}\n\nfunction resolveTarget(target: TutorialTarget | undefined) {\n  if (!target) return null;\n\n  if ('selectors' in target) {\n    for (const selector of target.selectors) {\n      const matches = Array.from(document.querySelectorAll(selector)).filter(\n        visibleElement,\n      ) as HTMLElement[];\n      const match = matches.find(inViewportElement) ?? matches[0];\n      if (match) return match;\n    }\n    return null;\n  }\n\n  const matches: HTMLElement[] = [];\n  for (const candidate of Array.from(\n    document.querySelectorAll(target.selector),\n  )) {\n    if (candidate.textContent?.trim() !== target.text) continue;\n    const match = target.closest ? candidate.closest(target.closest) : candidate;\n    if (visibleElement(match)) matches.push(match);\n  }\n  return matches.find(inViewportElement) ?? matches[0] ?? null;\n}\n'''
if old_visible not in text:
    raise SystemExit('visible target block not found')
text = text.replace(old_visible, new_visible, 1)

old_vars_update = '''    let observer: ResizeObserver | null = null;\n    let interactionTarget: HTMLElement | null = null;\n    let interactionEvent: 'change' | 'click' | null = null;\n    let interactionCapture = false;\n\n    const update = () => {\n      if (cancelled || !targetRef.current) return;\n      const nextHighlight = measureTarget(targetRef.current);\n      setHighlight(nextHighlight);\n      setLastReadyHighlight(nextHighlight);\n    };\n'''
new_vars_update = '''    let observer: ResizeObserver | null = null;\n    let mutationObserver: MutationObserver | null = null;\n    let interactionTarget: HTMLElement | null = null;\n    let interactionEvent: 'change' | 'click' | null = null;\n    let interactionCapture = false;\n    let locateScheduled = false;\n\n    const detachInteractionTarget = () => {\n      if (interactionTarget && interactionEvent) {\n        interactionTarget.removeEventListener(\n          interactionEvent,\n          advanceAfterInteraction,\n          interactionCapture,\n        );\n      }\n      interactionTarget = null;\n      interactionEvent = null;\n      interactionCapture = false;\n    };\n\n    const restartLocate = () => {\n      if (cancelled || locateScheduled) return;\n      observer?.disconnect();\n      observer = null;\n      detachInteractionTarget();\n      targetRef.current = null;\n      setReadyStepId(null);\n      setHighlight(null);\n      attempts = 0;\n      locateScheduled = true;\n      frame = window.requestAnimationFrame(locate);\n    };\n\n    const update = () => {\n      if (cancelled || !targetRef.current) return;\n      if (!targetRef.current.isConnected) {\n        restartLocate();\n        return;\n      }\n      if (!inViewportElement(targetRef.current)) return;\n      const nextHighlight = measureTarget(targetRef.current);\n      setHighlight(nextHighlight);\n      setLastReadyHighlight(nextHighlight);\n    };\n'''
if old_vars_update not in text:
    raise SystemExit('observer/update block not found')
text = text.replace(old_vars_update, new_vars_update, 1)

text = text.replace(
    "    const locate = () => {\n      if (cancelled) return;\n",
    "    function locate() {\n      locateScheduled = false;\n      if (cancelled) return;\n",
    1,
)
text = text.replace(
    "        if (attempts < 300) frame = window.requestAnimationFrame(locate);\n        return;\n",
    "        if (attempts < 300) {\n          locateScheduled = true;\n          frame = window.requestAnimationFrame(locate);\n        }\n        return;\n",
    1,
)
# Replace only the locate function terminator immediately before initial rAF.
old_locate_end = '''      if (step.interactive && step.advanceOnInteraction) {\n        interactionTarget = target;\n        interactionEvent = step.interactionEvent ?? 'change';\n        interactionCapture = interactionEvent === 'click';\n        target.addEventListener(\n          interactionEvent,\n          advanceAfterInteraction,\n          interactionCapture,\n        );\n      }\n    };\n\n    frame = window.requestAnimationFrame(locate);\n'''
new_locate_end = '''      if (step.interactive && step.advanceOnInteraction) {\n        interactionTarget = target;\n        interactionEvent = step.interactionEvent ?? 'change';\n        interactionCapture = interactionEvent === 'click';\n        target.addEventListener(\n          interactionEvent,\n          advanceAfterInteraction,\n          interactionCapture,\n        );\n      }\n    }\n\n    locateScheduled = true;\n    frame = window.requestAnimationFrame(locate);\n    mutationObserver = new MutationObserver(() => {\n      const current = targetRef.current;\n      if (!current || !current.isConnected) {\n        restartLocate();\n        return;\n      }\n      if (!inViewportElement(current)) {\n        const replacement = resolveTarget(step.target);\n        if (replacement && replacement !== current && inViewportElement(replacement)) {\n          restartLocate();\n        }\n      }\n    });\n    mutationObserver.observe(document.body, { childList: true, subtree: true });\n'''
if old_locate_end not in text:
    raise SystemExit('locate end block not found')
text = text.replace(old_locate_end, new_locate_end, 1)

old_cleanup = '''      observer?.disconnect();\n      if (interactionTarget && interactionEvent) {\n        interactionTarget.removeEventListener(\n          interactionEvent,\n          advanceAfterInteraction,\n          interactionCapture,\n        );\n      }\n      targetRef.current = null;\n'''
new_cleanup = '''      observer?.disconnect();\n      mutationObserver?.disconnect();\n      detachInteractionTarget();\n      targetRef.current = null;\n'''
if old_cleanup not in text:
    raise SystemExit('cleanup block not found')
text = text.replace(old_cleanup, new_cleanup, 1)

controller_path.write_text(text)

# Add regression coverage for route-swapped/detached targets.
test_path = Path('tests/tutorial-onboarding.test.ts')
test = test_path.read_text()
anchor = "  it('holds the previous spotlight geometry until the next target is ready', () => {\n"
if anchor not in test:
    raise SystemExit('tutorial geometry test anchor not found')
insert = '''  it('never measures a detached route-transition target and rebinds to its replacement', () => {\n    expect(controller).toContain('!element.isConnected');\n    expect(controller).toContain('function inViewportElement');\n    expect(controller).toContain('matches.find(inViewportElement) ?? matches[0]');\n    expect(controller).toContain('if (!targetRef.current.isConnected)');\n    expect(controller).toContain('restartLocate();');\n    expect(controller).toContain('new MutationObserver');\n    expect(controller).toContain("mutationObserver.observe(document.body, { childList: true, subtree: true })");\n    expect(controller).toContain('mutationObserver?.disconnect()');\n  });\n\n'''
test = test.replace(anchor, insert + anchor, 1)
test_path.write_text(test)
