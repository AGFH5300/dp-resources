import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const controller = read('components/tutorial/tutorial-controller.tsx');
const replayCard = read('components/tutorial/tutorial-replay-card.tsx');
const tutorialConfig = read('lib/tutorials.ts');
const tutorialRoute = read('app/api/tutorials/progress/route.ts');
const nav = read('components/nav.tsx');
const whatsNew = read('components/whats-new-dialog.tsx');
const settingsPage = read('app/settings/page.tsx');
const schema = read('supabase/schema.sql');

describe('interactive tutorial onboarding', () => {
  it('mounts only inside the approved member navigation shell', () => {
    expect(nav).toContain('<TutorialController userId={userId} />');
    expect(nav).toContain('<AppHeader admin={admin} userId={userId} />');
  });

  it('spotlights the real product surfaces across the walkthrough', () => {
    expect(controller).toContain("id: 'library'");
    expect(controller).toContain('a[href="/library"]');
    expect(controller).toContain("id: 'question-bank'");
    expect(controller).toContain('a[href="/question-bank"]');
    expect(controller).toContain("id: 'search'");
    expect(controller).toContain('button[aria-label^="Search library"]');
    expect(controller).toContain("id: 'practice-builder'");
    expect(controller).toContain('main a[href="/question-bank/build"]');
    expect(controller).toContain("id: 'source-filters'");
    expect(controller).toContain("text: 'Sources'");
    expect(controller).toContain("id: 'recent'");
    expect(controller).toContain('a[href="/recent"]');
    expect(controller).toContain("id: 'saved'");
    expect(controller).toContain('a[href="/saved"]');
    expect(controller).toContain("id: 'settings'");
    expect(controller).toContain('data-tutorial-target="tutorial-replay"');
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
    expect(controller).toContain('aria-modal="true"');
  });

  it('supports mobile layouts and reduced-motion users', () => {
    expect(controller).toContain('window.innerWidth < 640');
    expect(controller).toContain('env(safe-area-inset-bottom)');
    expect(controller).toContain("'(prefers-reduced-motion: reduce)'");
    expect(controller).toContain("behavior: reducedMotion ? 'auto' : 'smooth'");
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
