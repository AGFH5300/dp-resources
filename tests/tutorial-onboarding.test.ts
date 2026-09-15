import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const controller = read('components/tutorial/tutorial-controller.tsx');
const replayCard = read('components/tutorial/tutorial-replay-card.tsx');
const tutorialConfig = read('lib/tutorials.ts');
const tutorialRoute = read('app/api/tutorials/progress/route.ts');
const nav = read('components/nav.tsx');
const appHeader = read('components/app-header.tsx');
const instantLibraryBrowser = read('app/library/instant-library-browser.tsx');
const accountMenu = read('components/account-menu.tsx');
const whatsNew = read('components/whats-new-dialog.tsx');
const settingsPage = read('app/settings/page.tsx');
const schema = read('supabase/schema.sql');

describe('interactive tutorial onboarding', () => {
  it('mounts only inside the approved member navigation shell', () => {
    expect(nav).toContain('<TutorialController userId={userId} />');
    expect(nav).toContain('<AppHeader admin={admin} userId={userId} />');
  });

  it('spotlights stable real product surfaces across the walkthrough', () => {
    expect(controller).toContain("id: 'library'");
    expect(controller).toContain('data-tutorial-target="nav-library"');
    expect(controller).toContain("id: 'ib-resource-library'");
    expect(controller).toContain('data-tutorial-target="ib-resource-library"');
    expect(instantLibraryBrowser).toContain('data-tutorial-target="ib-resource-library"');
    expect(controller).toContain('most comprehensive list of IB resources');
    expect(controller).toContain("id: 'question-bank'");
    expect(controller).toContain('data-tutorial-target="nav-question-bank"');
    expect(controller).toContain("id: 'search'");
    expect(controller).toContain('button[aria-label^="Search library"]');
    expect(controller).toContain("id: 'practice-builder'");
    expect(controller).toContain('main a[href="/question-bank/build"]');
    expect(controller).toContain("id: 'source-filters-try'");
    expect(controller).not.toContain("id: 'source-filters-explain'");
    expect(controller).toContain("text: 'Sources'");
    expect(controller).toContain("id: 'recent'");
    expect(controller).toContain('data-tutorial-target="nav-recent"');
    expect(controller).toContain("id: 'saved'");
    expect(controller).toContain('data-tutorial-target="nav-saved"');
    expect(appHeader).toContain(
      'data-tutorial-target={`nav-${href.slice(1).replaceAll(\'/\', \'-\')}`}',
    );
  });

  it('keeps the source lesson interactive and positions its card to the left on desktop', () => {
    expect(controller).toContain('interactive: true');
    expect(controller).toContain('advanceOnInteraction: true');
    expect(controller).toContain("interactionEvent: 'change'");
    expect(controller).toContain('requireInteraction: true');
    expect(controller).toContain("placement: 'left'");
    expect(controller).toContain('centerTarget: true');
    expect(controller).toContain("input.type !== 'checkbox'");
    expect(controller).toContain('visibleHighlight.left - leftWidth - gap');
    expect(controller).toContain('pointer-events-none fixed z-[90]');
    expect(controller).toContain('Optional: click any source checkbox');
  });

  it('keeps a single optional source lesson and auto-positions the target', () => {
    const start = controller.indexOf("id: 'source-filters-try'");
    const end = controller.indexOf("id: 'recent'");
    const sourceStep = controller.slice(start, end);
    expect(sourceStep).toContain("title: 'Source filters'");
    expect(sourceStep).toContain('centerTarget: true');
    expect(sourceStep).toContain('press Next to continue');
    expect(sourceStep).not.toContain('requireInteraction: true');
    expect(controller).not.toContain("id: 'source-filters-explain'");
    expect(controller).toContain('step.centerTarget ||');
  });

  it('locks the underlying page while leaving only the active tutorial target interactive', () => {
    expect(controller).toContain("html.style.overflow = 'hidden'");
    expect(controller).toContain("body.style.overflow = 'hidden'");
    expect(controller).toContain("html.style.overscrollBehavior = 'none'");
    expect(controller).toContain("document.addEventListener('wheel', blockPageScroll");
    expect(controller).toContain("document.addEventListener('touchmove', blockPageScroll");
    expect(controller).toContain("document.addEventListener('click', blockOutsideInteraction, true)");
    expect(controller).toContain('step.interactive && targetRef.current?.contains(node)');
    expect(controller).toContain("['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']");
    expect(controller).toContain('data-tutorial-overlay="true"');
    expect(controller).not.toContain('aria-label="Skip tutorial"');
  });

  it('keeps navigation-heading steps on the library shell without eager heavy-route prefetches', () => {
    expect(controller).toContain("const LIBRARY_ROUTE = '/library'");
    expect(controller).toContain("route: '/question-bank/build'");
    expect(controller).toContain("route: '/settings'");
    expect(controller).not.toContain('PREFETCH_ROUTES');
    expect(controller).not.toContain('router.prefetch(');
    expect(controller).toContain('router.replace(step.route)');
    expect(controller).toContain("id: 'recent'");
    expect(controller).toContain("id: 'saved'");
    expect(controller).not.toContain('Loader2');
    expect(controller).not.toContain('role="status"');
  });

  it('attaches an obvious animated click badge directly to required click targets', () => {
    expect(controller).toContain("step.interactionEvent === 'click'");
    expect(controller).toContain('pointer-events-none fixed z-[95]');
    expect(controller).toContain('visibleHighlight.right - cueWidth - inset');
    expect(controller).toContain('visibleHighlight.top + inset');
    expect(controller).toContain('inline-flex h-8 items-center');
    expect(controller).toContain('animate-ping');
    expect(controller).toContain('animate-pulse');
    expect(controller).toContain('Click');
    expect(controller).toContain("reducedMotion ? '' : 'animate-pulse'");
  });

  it('makes the Settings finale a required click-through sequence ending at Replay tutorial', () => {
    expect(controller).toContain("id: 'account-menu'");
    expect(controller).toContain('data-tutorial-target="account-menu"');
    expect(controller).toContain("id: 'settings-link'");
    expect(controller).toContain('data-tutorial-target="settings-link"');
    expect(controller).toContain("interactionEvent: 'click'");
    expect(controller).toContain('interactionAdvanceDelayMs: 0');
    expect(controller).toContain("id: 'tutorial-replay'");
    expect(controller).toContain('data-tutorial-target="tutorial-replay-button"');
    expect(accountMenu).toContain('data-tutorial-target="account-menu"');
    expect(accountMenu).toContain('data-tutorial-target="settings-link"');
    expect(accountMenu).toContain('[data-tutorial-overlay="true"]');
    expect(replayCard).toContain('data-tutorial-target="tutorial-replay-button"');
  });

  it('provides Back, Next, Skip, progress and keyboard navigation', () => {
    expect(controller).toContain('Back');
    expect(controller).toContain("'Next'");
    expect(controller).toContain('Skip');
    expect(controller).toContain('Step {stepIndex + 1} of {STEPS.length}');
    expect(controller).toContain("event.key === 'ArrowLeft'");
    expect(controller).toContain("event.key === 'ArrowRight'");
    expect(controller).toContain("event.key === 'Escape'");
    expect(controller).toContain("event.key !== 'Tab'");
    expect(controller).toContain('role="dialog"');
    expect(controller).toContain('Use highlighted control');
  });

  it('supports mobile layouts, automatic target positioning and reduced-motion users', () => {
    expect(controller).toContain('window.innerWidth < 640');
    expect(controller).toContain(
      'visibleHighlight.bottom > window.innerHeight * 0.62',
    );
    expect(controller).toContain('env(safe-area-inset-top)');
    expect(controller).toContain('env(safe-area-inset-bottom)');
    expect(controller).toContain("'(prefers-reduced-motion: reduce)'");
    expect(controller).toContain("behavior: 'auto'");
    expect(controller).toContain('rect.bottom > window.innerHeight - 24');
    expect(controller).toContain(
      "reducedMotion ? '' : 'transition-all duration-150'",
    );
  });

  it('stores tutorial version completion per user using the existing protected onboarding table', () => {
    expect(schema).toContain('public.dp_resource_onboarding_dismissals');
    expect(schema).toContain('primary key (user_id, key)');
    expect(tutorialConfig).toContain("CORE_TUTORIAL_KEY = 'core-onboarding'");
    expect(tutorialConfig).toContain('CORE_TUTORIAL_VERSION = 1');
    expect(tutorialConfig).toContain('tutorial:${key}:v${version}');
    expect(tutorialRoute).toContain('requireApiMember');
    expect(tutorialRoute).toContain('sameOriginOrForbidden');
    expect(tutorialRoute).toContain("from('dp_resource_onboarding_dismissals')");
    expect(tutorialRoute).toContain("onConflict: 'user_id,key'");
  });

  it('allows replay from Settings without resetting first-login completion', () => {
    expect(settingsPage).toContain('<TutorialReplayCard />');
    expect(replayCard).toContain('Replay tutorial');
    expect(replayCard).toContain('TUTORIAL_START_EVENT');
    expect(controller).toContain('window.addEventListener(TUTORIAL_START_EVENT');
  });

  it('keeps What’s New from competing with the first-login tutorial', () => {
    expect(whatsNew).toContain('TUTORIAL_ACTIVE_STORAGE_KEY');
    expect(whatsNew).toContain('TUTORIAL_CHECKING_STORAGE_KEY');
    expect(whatsNew).toContain('TUTORIAL_OPENED_EVENT');
    expect(whatsNew).toContain('TUTORIAL_CHECK_COMPLETE_EVENT');
  });
});
