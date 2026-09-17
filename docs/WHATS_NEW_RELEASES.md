# DP Resources What’s New releases

The visual What’s New experience is driven by `lib/whats-new.ts`. It is intentionally separate from the detailed public changelog: only meaningful product changes belong in a visual release.

## Add the next release

Add a new item at the top of `WHATS_NEW_RELEASES` with a unique stable `id`, human-readable labels, a date, a short release summary, `showWhatsNew`, and one `features` entry per meaningful capability.

Each feature supports an optional `NEW`, `IMPROVED`, or `REDESIGNED` badge; a short title and description; `image`, `video`, or internal illustration media; and an optional CTA with an in-app `href`.

Keep `showWhatsNew: false` for patch releases that belong in the changelog but should not interrupt users. `latestAutoOpenRelease()` selects the first release marked for What’s New, so releases must remain newest-first.

## Media

Images should use a stable public/static URL, meaningful alt text, and an optional object position. Videos autoplay only while their slide is active, begin muted, use inline playback, pause when the slide unmounts, and expose DP Resources replay, play/pause, mute, and fullscreen controls.

Only the active feature slide is mounted, so hidden videos are not playing or eagerly downloaded. Real screenshots or short demonstration videos can replace the built-in release illustrations without changing the rendering components.

## Viewed state

The browser fallback is stored under `dp-whats-new:viewed-releases:v1`. Authenticated account state is stored in `dp_resource_user_settings.viewed_whats_new_releases` through `/api/account/whats-new`.

Apply `supabase/migrations/20260916234500_whats_new_release_history.sql` before relying on cross-device persistence. If the account request is unavailable, the local fallback continues to prevent repeated prompts on that browser.

A release is marked viewed when it is dismissed, completed, opened through a feature CTA, or left for the full changelog. Manually reopening a viewed release remains supported from the Account menu.

## Preview and testing

In development only, open `?previewWhatsNew=<release-id>` to force a release open without marking it viewed. Production ignores this query parameter.

For a release test, verify first auto-open, close-and-refresh suppression, Account-menu reopen, previous/next/dots, keyboard arrows, touch swipe, CTA routing, image/video fallback, video pause on slide change and close, replay/fullscreen, reduced motion, and representative mobile/tablet/desktop viewport sizes.

## Analytics-ready events

The client dispatches the `dp:whats-new-analytics` browser event with these event names: `whats_new_opened`, `whats_new_slide_viewed`, `whats_new_try_it_clicked`, `whats_new_completed`, `whats_new_dismissed`, and `whats_new_reopened`.

No analytics dependency is required; an existing or future analytics bridge can subscribe to that event.
