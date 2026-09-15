from pathlib import Path

path = Path('app/question-bank/page.tsx')
text = path.read_text()
old = '''              <Link
                href="/question-bank/build"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
'''
new = '''              <Link
                href="/question-bank/build"
                prefetch={false}
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
'''
if old not in text:
    raise SystemExit('Second Practice Builder link not found')
path.write_text(text.replace(old, new, 1))
