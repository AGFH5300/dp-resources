export const CORE_TUTORIAL_KEY = 'core-onboarding';
export const CORE_TUTORIAL_VERSION = 1;

export const TUTORIAL_START_EVENT = 'dp:start-tutorial';
export const TUTORIAL_OPENED_EVENT = 'dp:tutorial-opened';
export const TUTORIAL_CHECK_COMPLETE_EVENT = 'dp:tutorial-check-complete';

export const TUTORIAL_ACTIVE_STORAGE_KEY = 'dp:tutorial-active';
export const TUTORIAL_CHECKING_STORAGE_KEY = 'dp:tutorial-checking';
export const CORE_TUTORIAL_SESSION_STORAGE_KEY =
  `dp:tutorial-session:${CORE_TUTORIAL_KEY}:v${CORE_TUTORIAL_VERSION}`;

export function tutorialDismissalKey(key: string, version: number) {
  return `tutorial:${key}:v${version}`;
}

export function isSupportedTutorial(key: string, version: number) {
  return key === CORE_TUTORIAL_KEY && version === CORE_TUTORIAL_VERSION;
}
