from pathlib import Path

controller_path = Path('components/tutorial/tutorial-controller.tsx')
controller = controller_path.read_text()

unformatted_ib = """{
id: 'ib-resource-library',
title: 'IB Resource Library',
description:
  'The IB Resource Library is the most comprehensive list of IB resources on DP Resources. Use this master catalogue to find compiled DP revision resources by subject, topic, and direct resource link.',
route: LIBRARY_ROUTE,
target: {
  selector: 'span',
  text: 'Resource Library',
  closest: 'a',
},
},
"""
formatted_ib = """  {
    id: 'ib-resource-library',
    title: 'IB Resource Library',
    description:
      'The IB Resource Library is the most comprehensive list of IB resources on DP Resources. Use this master catalogue to find compiled DP revision resources by subject, topic, and direct resource link.',
    route: LIBRARY_ROUTE,
    target: {
      selectors: ['[data-tutorial-target=\"ib-resource-library\"]'],
    },
  },
"""
if unformatted_ib not in controller:
    raise SystemExit('Unformatted IB step not found')
controller = controller.replace(unformatted_ib, formatted_ib, 1)

unformatted_scroll = """if (
  step.centerTarget ||
  rect.top < 76 ||
  rect.bottom > window.innerHeight - 24
) {
"""
formatted_scroll = """      if (
        step.centerTarget ||
        rect.top < 76 ||
        rect.bottom > window.innerHeight - 24
      ) {
"""
if unformatted_scroll not in controller:
    raise SystemExit('Unformatted scroll rule not found')
controller = controller.replace(unformatted_scroll, formatted_scroll, 1)
controller_path.write_text(controller)

browser_path = Path('app/library/instant-library-browser.tsx')
browser = browser_path.read_text()
feature_start = browser.index('function LibraryFeature(')
feature_end = browser.index('function FolderLoadingRows()', feature_start)
feature = browser[feature_start:feature_end]
anchor = """    <a
      href={item.isFolder ? `/library?folder=${encodeURIComponent(item.id)}` : `/resource/${item.id}`}
"""
replacement = """    <a
      data-tutorial-target="ib-resource-library"
      href={item.isFolder ? `/library?folder=${encodeURIComponent(item.id)}` : `/resource/${item.id}`}
"""
if anchor not in feature:
    raise SystemExit('LibraryFeature anchor not found')
feature = feature.replace(anchor, replacement, 1)
browser = browser[:feature_start] + feature + browser[feature_end:]
browser_path.write_text(browser)

tests_path = Path('tests/tutorial-onboarding.test.ts')
tests = tests_path.read_text()
constant_anchor = "const appHeader = read('components/app-header.tsx');\n"
if "const instantLibraryBrowser = read('app/library/instant-library-browser.tsx');" not in tests:
    if constant_anchor not in tests:
        raise SystemExit('Test constant anchor not found')
    tests = tests.replace(
        constant_anchor,
        constant_anchor + "const instantLibraryBrowser = read('app/library/instant-library-browser.tsx');\n",
        1,
    )

old_ib_assert = "    expect(controller).toContain(\"text: 'Resource Library'\");\n"
new_ib_assert = (
    "    expect(controller).toContain('data-tutorial-target=\"ib-resource-library\"');\n"
    "    expect(instantLibraryBrowser).toContain('data-tutorial-target=\"ib-resource-library\"');\n"
)
if old_ib_assert not in tests:
    raise SystemExit('IB assertion anchor not found')
tests = tests.replace(old_ib_assert, new_ib_assert, 1)

unformatted_test = """it('keeps the first source interaction optional while auto-positioning the target', () => {
const start = controller.indexOf("id: 'source-filters-try'");
const end = controller.indexOf("id: 'source-filters-explain'");
const sourceTry = controller.slice(start, end);
expect(sourceTry).toContain('centerTarget: true');
expect(sourceTry).toContain('press Next to continue');
expect(sourceTry).not.toContain('requireInteraction: true');
expect(controller).toContain('step.centerTarget ||');
});
"""
formatted_test = """  it('keeps the first source interaction optional while auto-positioning the target', () => {
    const start = controller.indexOf("id: 'source-filters-try'");
    const end = controller.indexOf("id: 'source-filters-explain'");
    const sourceTry = controller.slice(start, end);
    expect(sourceTry).toContain('centerTarget: true');
    expect(sourceTry).toContain('press Next to continue');
    expect(sourceTry).not.toContain('requireInteraction: true');
    expect(controller).toContain('step.centerTarget ||');
  });
"""
if unformatted_test not in tests:
    raise SystemExit('Unformatted optional source test not found')
tests = tests.replace(unformatted_test, formatted_test, 1)
tests_path.write_text(tests)
