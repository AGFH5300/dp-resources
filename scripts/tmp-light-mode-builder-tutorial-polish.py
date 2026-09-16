from pathlib import Path

builder = Path('components/question-bank/practice-set-builder-v4.tsx')
css = Path('components/question-bank/practice-set-builder-v2.module.css')
tutorial = Path('components/tutorial/tutorial-controller.tsx')
tests = Path('tests/light-mode-builder-tutorial-polish.test.ts')

# ---------- Practice Builder component ----------
text = builder.read_text()
old = """                  <details\n                    key={subject.id}\n                    open={Boolean(search) || undefined}\n                    className={`${styles.pickerSubject} rounded-2xl border`}\n                  >\n"""
new = """                  <details\n                    key={subject.id}\n                    open={Boolean(search) || undefined}\n                    className={`${styles.pickerSubject} ${\n                      allSelected ? styles.pickerSubjectComplete : ''\n                    } rounded-2xl border`}\n                  >\n"""
if old not in text:
    raise SystemExit('pickerSubject anchor not found')
text = text.replace(old, new, 1)
builder.write_text(text)

# ---------- Practice Builder light-mode CSS ----------
text = css.read_text()
replacements = [
(""".conceptButton:not(:disabled):hover {\n  border-color: color-mix(in srgb, var(--dp-blue) 72%, var(--outline));\n  background: color-mix(in srgb, var(--dp-blue) 10%, var(--dp-warm-surface));\n  transform: translateY(-1px);\n}\n""",
""".conceptButton:not(.conceptButtonSelected):not(:disabled):hover {\n  border-color: color-mix(in srgb, var(--dp-blue) 42%, var(--outline));\n  background: color-mix(in srgb, var(--dp-blue) 5%, var(--dp-warm-surface));\n  transform: translateY(-1px);\n}\n"""),
(""".conceptButtonSelected,\n.conceptButtonSelected:disabled {\n  border-color: color-mix(in srgb, var(--dp-blue) 58%, var(--outline));\n  background: color-mix(in srgb, var(--dp-blue) 15%, var(--dp-warm-surface));\n  color: var(--dp-heading);\n  opacity: 1 !important;\n}\n""",
""".conceptButtonSelected,\n.conceptButtonSelected:disabled {\n  border-color: #2563eb;\n  background: #dbeafe;\n  color: var(--dp-heading);\n  opacity: 1 !important;\n}\n"""),
(""".conceptButtonSelected .conceptIcon {\n  background: color-mix(in srgb, var(--dp-blue) 24%, var(--dp-warm-surface));\n  color: #93c5fd;\n}\n""",
""".conceptButtonSelected .conceptIcon {\n  background: #2563eb;\n  color: #ffffff;\n}\n"""),
(""".courseOption:hover {\n  border-color: color-mix(in srgb, var(--dp-blue) 55%, var(--outline));\n  background: color-mix(in srgb, var(--dp-blue) 7%, var(--dp-warm-surface));\n}\n\n.courseOptionSelected {\n  border-color: #3b82f6;\n  background: color-mix(in srgb, #2563eb 18%, var(--dp-warm-surface));\n}\n""",
""".courseOption:not(.courseOptionSelected):hover {\n  border-color: color-mix(in srgb, var(--dp-blue) 38%, var(--outline));\n  background: color-mix(in srgb, var(--dp-blue) 4%, var(--dp-warm-surface));\n}\n\n.courseOptionSelected {\n  border-color: #2563eb;\n  background: #dbeafe;\n}\n\n.courseOptionSelected:hover {\n  border-color: #1d4ed8;\n  background: #dbeafe;\n}\n"""),
(""".courseBulkButton:disabled,\n.maxBulkButton:disabled {\n  cursor: not-allowed;\n  opacity: 0.5;\n}\n""",
""".courseBulkButton:disabled {\n  cursor: default;\n  border-color: #22c55e;\n  background: #dcfce7;\n  color: #166534;\n  opacity: 1;\n}\n\n.maxBulkButton:disabled {\n  cursor: not-allowed;\n  opacity: 0.5;\n}\n"""),
(""".pickerSubject:hover {\n  border-color: color-mix(in srgb, #2563eb 38%, var(--outline));\n}\n""",
""".pickerSubject:hover {\n  border-color: color-mix(in srgb, #2563eb 38%, var(--outline));\n}\n\n.pickerSubjectComplete {\n  border-color: #22c55e;\n  background: #f0fdf4;\n}\n\n.pickerSubjectComplete > summary {\n  background: #f0fdf4;\n  border-radius: inherit;\n}\n\n.pickerSubjectComplete .selectionCounter {\n  background: #dcfce7;\n  color: #166534;\n}\n"""),
(""".deleteButton {\n  color: var(--dp-muted-text);\n  transition: color 150ms ease, background-color 150ms ease;\n}\n\n.deleteButton:hover {\n  color: #fca5a5;\n  background: rgb(153 27 27 / 0.22);\n}\n""",
""".deleteButton {\n  color: #64748b;\n  transition: color 150ms ease, background-color 150ms ease;\n}\n\n.deleteButton:hover {\n  color: #b91c1c;\n  background: #fef2f2;\n}\n"""),
(""".countButton:not(:disabled):hover {\n  border-color: #3b82f6;\n  background: color-mix(in srgb, #2563eb 18%, var(--dp-warm-surface));\n  color: #bfdbfe;\n}\n""",
""".countButton:not(:disabled):hover {\n  border-color: #3b82f6;\n  background: #eff6ff;\n  color: #1d4ed8;\n}\n"""),
(""".previewSuccess {\n  background: rgb(6 95 70 / 0.2);\n  color: #a7f3d0;\n}\n\n.previewWarning {\n  background: rgb(180 83 9 / 0.22);\n  color: #fde68a;\n}\n""",
""".previewSuccess {\n  border: 1px solid #a7f3d0;\n  background: #ecfdf5;\n  color: #065f46;\n}\n\n.previewWarning {\n  border: 1px solid #fcd34d;\n  background: #fffbeb;\n  color: #92400e;\n}\n"""),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f'CSS anchor not found: {old[:80]!r}')
    text = text.replace(old, new, 1)

# Dark-mode overrides for classes whose light styles were intentionally strengthened.
dark_anchor = """:global(html[data-theme='dark']) .countButton:not(:disabled):hover {\n  background: #1b3154;\n  border-color: #60a5fa;\n}\n"""
dark_new = """:global(html[data-theme='dark']) .countButton:not(:disabled):hover {\n  background: #1b3154;\n  border-color: #60a5fa;\n  color: #dbeafe;\n}\n\n:global(html[data-theme='dark']) .deleteButton:hover {\n  color: #fca5a5;\n  background: rgb(153 27 27 / 0.28);\n}\n\n:global(html[data-theme='dark']) .previewSuccess {\n  border-color: #166534;\n  background: #123325;\n  color: #a7f3d0;\n}\n\n:global(html[data-theme='dark']) .previewWarning {\n  border-color: #92400e;\n  background: #3b2608;\n  color: #fde68a;\n}\n"""
if dark_anchor not in text:
    raise SystemExit('dark countButton anchor not found')
text = text.replace(dark_anchor, dark_new, 1)

# Make fully-selected subject state visible in dark mode too.
dark_picker_anchor = """:global(html[data-theme='dark']) .selectionCounter {\n  background: #19365d;\n  color: #bfdbfe;\n}\n"""
dark_picker_new = dark_picker_anchor + """\n:global(html[data-theme='dark']) .pickerSubjectComplete,\n:global(html[data-theme='dark']) .pickerSubjectComplete > summary {\n  border-color: #15803d;\n  background: #102d22;\n}\n\n:global(html[data-theme='dark']) .pickerSubjectComplete .selectionCounter {\n  background: #14532d;\n  color: #bbf7d0;\n}\n"""
if dark_picker_anchor not in text:
    raise SystemExit('dark selectionCounter anchor not found')
text = text.replace(dark_picker_anchor, dark_picker_new, 1)
css.write_text(text)

# ---------- Tutorial spotlight corners + step 12 handoff ----------
text = tutorial.read_text()
text = text.replace(
"""    interactionAdvanceDelayMs: 0,\n    requireInteraction: true,\n""",
"""    interactionAdvanceDelayMs: 90,\n    requireInteraction: true,\n""",
1,
)

# Start Settings navigation at the required click itself, before advancing the card.
old = """    const advanceAfterInteraction = (event: Event) => {\n      if (!step.advanceOnInteraction) return;\n      const eventName = step.interactionEvent ?? 'change';\n"""
new = """    const advanceAfterInteraction = (event: Event) => {\n      if (!step.advanceOnInteraction) return;\n      const eventName = step.interactionEvent ?? 'change';\n      if (step.id === 'settings-link' && pathname !== '/settings') {\n        router.replace('/settings');\n      }\n"""
if old not in text:
    raise SystemExit('interaction anchor not found')
text = text.replace(old, new, 1)

old = """  const progress = ((stepIndex + 1) / STEPS.length) * 100;\n  const backdropClass = 'fixed z-[80] bg-slate-950/70';\n\n  return (\n    <>\n      {visibleHighlight ? (\n        <>\n          <div\n            aria-hidden\n            className={backdropClass}\n            style={{ left: 0, top: 0, right: 0, height: visibleHighlight.top }}\n          />\n          <div\n            aria-hidden\n            className={backdropClass}\n            style={{\n              left: 0,\n              top: visibleHighlight.top,\n              width: visibleHighlight.left,\n              height: visibleHighlight.height,\n            }}\n          />\n          <div\n            aria-hidden\n            className={backdropClass}\n            style={{\n              left: visibleHighlight.right,\n              top: visibleHighlight.top,\n              right: 0,\n              height: visibleHighlight.height,\n            }}\n          />\n          <div\n            aria-hidden\n            className={backdropClass}\n            style={{\n              left: 0,\n              top: visibleHighlight.bottom,\n              right: 0,\n              bottom: 0,\n            }}\n          />\n          <div\n            aria-hidden\n            className={`pointer-events-none fixed z-[90] rounded-xl border-2 border-blue-400 ring-4 ring-white/80 ${\n              reducedMotion ? '' : 'transition-all duration-150'\n            }`}\n            style={{\n              left: visibleHighlight.left,\n              top: visibleHighlight.top,\n              width: visibleHighlight.width,\n              height: visibleHighlight.height,\n            }}\n          />\n"""
new = """  const progress = ((stepIndex + 1) / STEPS.length) * 100;\n\n  return (\n    <>\n      {visibleHighlight ? (\n        <>\n          <div\n            aria-hidden\n            className={`pointer-events-none fixed z-[90] rounded-xl border-2 border-blue-400 ring-4 ring-white/80 ${\n              reducedMotion ? '' : 'transition-all duration-150'\n            }`}\n            style={{\n              left: visibleHighlight.left,\n              top: visibleHighlight.top,\n              width: visibleHighlight.width,\n              height: visibleHighlight.height,\n              boxShadow: '0 0 0 9999px rgb(2 6 23 / 0.70)',\n            }}\n          />\n"""
if old not in text:
    raise SystemExit('tutorial backdrop block not found')
text = text.replace(old, new, 1)
tutorial.write_text(text)

# ---------- Regression coverage ----------
tests.write_text("""import { readFileSync } from 'node:fs';\nimport { describe, expect, it } from 'vitest';\n\nconst builder = readFileSync('components/question-bank/practice-set-builder-v4.tsx', 'utf8');\nconst css = readFileSync('components/question-bank/practice-set-builder-v2.module.css', 'utf8');\nconst tutorial = readFileSync('components/tutorial/tutorial-controller.tsx', 'utf8');\n\ndescribe('light-mode Practice Builder and tutorial polish', () => {\n  it('keeps selected and hover states visually distinct', () => {\n    expect(css).toContain('.conceptButton:not(.conceptButtonSelected):not(:disabled):hover');\n    expect(css).toContain('background: #dbeafe');\n    expect(css).toContain('.conceptButtonSelected .conceptIcon');\n    expect(css).toContain('color: #ffffff');\n    expect(css).toContain('.courseOption:not(.courseOptionSelected):hover');\n  });\n\n  it('uses readable light-mode destructive, bulk, and preview states', () => {\n    expect(css).toContain('color: #b91c1c');\n    expect(css).toContain('background: #fef2f2');\n    expect(css).toContain('.courseBulkButton:disabled');\n    expect(css).toContain('background: #dcfce7');\n    expect(css).toContain('.previewSuccess');\n    expect(css).toContain('background: #ecfdf5');\n    expect(css).toContain('color: #065f46');\n  });\n\n  it('marks a completely selected subject across the whole subject bar', () => {\n    expect(builder).toContain("allSelected ? styles.pickerSubjectComplete : ''");\n    expect(css).toContain('.pickerSubjectComplete > summary');\n  });\n\n  it('uses a rounded spotlight mask and starts Settings navigation on click', () => {\n    expect(tutorial).toContain("boxShadow: '0 0 0 9999px rgb(2 6 23 / 0.70)'");\n    expect(tutorial).not.toContain('const backdropClass');\n    expect(tutorial).toContain("step.id === 'settings-link'");\n    expect(tutorial).toContain("router.replace('/settings')");\n  });\n});\n""")
