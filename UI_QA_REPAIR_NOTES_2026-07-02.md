# UI QA Repair Notes — 2026-07-02

These notes record observed issues from a real signed-in review after the authenticated-shell rebuild. They take precedence over generic visual assumptions in prior implementation work.

## Must fix

1. **Focus states**
   - Remove the heavy bright-blue browser-like outline/halo around focused inputs, selects, dialogs and controls.
   - Use a restrained, intentional focus treatment: a thin navy or ink border shift with a soft low-opacity ring. Do not use `border` without an explicit muted border colour.

2. **Report resource dialog**
   - Backdrop click must close the dialog when not submitting.
   - Escape must close the dialog when not submitting.
   - Do not expose the Drive file ID in visible UI.
   - Show only resource name, type and path.

3. **Global search**
   - Search must be a compact command palette, not a near-full-screen white box.
   - Use a restrained overlay, a compact panel around 640–680px wide, a clean input row, grouped result rows with functional coloured icons, a compact empty/preparing state and keyboard hints.
   - Do not use bright-blue outlines or blue-bordered containers as decoration.

4. **Resource preview**
   - Do not render two complete sets of resource actions.
   - Keep the page-level action toolbar and viewer controls only.
   - Do not display “Unable to load the PDF preview” while the protected iframe viewer is visibly rendering content.

5. **Admin activity**
   - Replace raw sentence-log rows with a structured, scannable table.
   - Columns: time, user, activity, resource.
   - Use readable labels such as “Opened file” and “Started download”, not raw action enums.
   - Keep the real filters and export, but avoid an endless wall of text.

6. **Mobile Library**
   - Do not stack desktop columns vertically into a tall pseudo-card for every resource.
   - Mobile rows should show: icon, name, one compact secondary metadata line, and a three-dot action.
   - Location/type/size columns remain desktop-only, while mobile uses concise real metadata.

7. **Support form**
   - Set support fields to avoid irrelevant browser autofill suggestions where feasible (`autocomplete="off"` / appropriate field tokens).
   - Use the shared muted border and focus treatment.

## Guardrails

- Do not introduce a sidebar, fake data, archive terminology, or new feature concepts.
- Keep the current integrated desktop header and Drive-style list as the foundation.
- All dialog/menu close behavior must be tested: Escape, outside click, close control, and keyboard focus.
