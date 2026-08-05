# Local Question Bank practice sessions

Ordinary generated Question Bank queues are device-local. The server resolves and orders eligible question IDs, then streams compact chunks to the browser. The browser stores those chunks in IndexedDB and hydrates only the visible page from canonical Question Bank data.

## Persistence boundaries

- Browser only: ordinary generated queue, current queue position and temporary session metadata.
- Supabase: canonical questions/assets, the member's global question progress and saved-question state.
- Supabase only after an explicit action: named shared configurations and exact shared queues.

## Retention

The client prunes abandoned builds after one hour, unopened generated sessions after seven days, in-progress sessions after 30 days, completed sessions after seven days, and retains at most eight local sessions per user. Members may delete a local session immediately from its practice page.

Clearing browser/site data removes local sessions. Local sessions do not roam across devices. A permanent share code is the explicit cross-device persistence mechanism.
