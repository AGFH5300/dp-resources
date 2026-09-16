from pathlib import Path
p = Path('components/tutorial/tutorial-controller.tsx')
text = p.read_text()
old = "  }, [active, reducedMotion, replay, step, stepIndex]);\n"
new = "  }, [active, pathname, reducedMotion, replay, router, step, stepIndex]);\n"
if old not in text:
    raise SystemExit('tutorial effect dependency anchor not found')
p.write_text(text.replace(old, new, 1))
