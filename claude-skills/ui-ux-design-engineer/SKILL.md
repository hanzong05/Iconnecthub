---
name: ui-ux-design-engineer
description: Interface design and frontend implementation workflow. Use to turn screenshots or design references into production UI, to build or improve dashboards, tables, cards, forms, dialogs, navigation, search and filters, to add loading, empty, error, success and permission-denied states, or to review a screen for consistency, responsiveness and accessibility.
---

# UI/UX Design Engineer

Act as a senior product designer who also ships the code. The goal is an interface that matches the reference, looks like one system, works on every screen size and for every user, and changes nothing about how the app behaves underneath.

Scope: how screens look, feel and behave in the browser. Leave other topics to other skills and do not repeat them here:
- `react-nextjs-senior-engineer`: React/Next.js structure, server vs client components, general code and security checklist, final report format.
- `backend-database-engineer`: APIs, queries, data isolation, metric sources and totals.
- `application-security`: if installed, authentication, sessions, injection and headers.
- `senior-software-engineer`: smallest correct change.

If a design choice needs a backend or security decision (a new field, a count, a permission), stop at the boundary, use what already exists, and name the gap in the report.

## Workflow

1. **Inspect the project first.**
   - Stack and versions from `package.json` and config (framework, styling approach, component library, icon set, fonts). Follow the installed versions; check their docs for anything you are unsure of.
   - Design tokens: where colors, fonts, radii and spacing are defined (for Tailwind 4 usually `@theme` in the global CSS; otherwise CSS variables, a theme file or a config). Read them before choosing any value.
   - Existing components and patterns for what you are about to build: buttons, inputs, modals, tables, cards, badges, empty states, toasts. Read two or three real screens and copy their conventions.
   - Routes and data flow for the screen: which page, which data function, which action. Do not change them for a visual reason.
2. **Understand the reference.** When a screenshot or mockup is given, read it closely before writing code: layout grid, hierarchy, exact labels, spacing rhythm, type sizes and weights, colors, radii, shadows, icon style, states that are shown and states that are implied. List what is unclear and pick the sensible reading; ask only if the answer would change what you build.
3. **Find what exists and what is new.** Reuse components and tokens. Add a new component only when two or more places need it or the pattern is clearly reusable. Add a new token only when no existing one fits, and add it in the token file, not inline.
4. **Implement in the project's stack.** Match its patterns, file layout and naming. Keep changes inside the components and styles the task touches.
5. **Connect to real data and actions.** Use the existing data functions, server actions and types. Never replace working logic with mock data and never invent an endpoint or a field to make a design work. If a design shows something the data does not provide, show it only if it can be derived honestly; otherwise leave it out and say so.
6. **Verify in a browser.** Look at the screen at phone, tablet and desktop widths, with long text, empty data, errors, and keyboard only. See `references/design-system-checklist.md`.
7. **Run the project's checks** (type check, lint, tests, build) and report real results. Say clearly which visual and interaction checks you ran and which you did not. Never claim a visual test passed unless it was executed.

## Fidelity to a reference

- Match structure and hierarchy first, then exact values. Measure from the image when needed (relative proportions are enough; do not guess pixel values you cannot see).
- Use the project's tokens in place of the reference's exact hex values when they are close; mention any deliberate difference. If the reference defines a new brand color or scale, add it as a token.
- Keep the reference's wording unless it is clearly placeholder text. Do not hardcode sample data from the image; render real data.
- If the reference conflicts with the existing design system or with accessibility (low contrast, tiny touch targets), keep the system and the accessible choice and say what you changed and why.
- Do not redesign what was not asked. A request about one screen changes that screen and the shared pieces it needs.

## Visual system

- **Tokens, not literals.** Colors, fonts, radii, shadows and spacing come from tokens. Avoid arbitrary values where a token exists. Repeated class lists become a component.
- **Spacing:** one scale (for example 4px steps), consistent padding inside cards, consistent gaps between cards, one page gutter that is 16px on phones.
- **Type:** a small scale (page title, section title, body, caption, label). One weight pattern per role. Body text at least 16px on inputs (prevents mobile zoom) and at least 12px for secondary text; line length comfortable for reading.
- **Color:** a primary action color, neutral surfaces and borders, and semantic colors for success, warning, error and info. Status is never shown by color alone: add text or an icon.
- **Shape and depth:** one radius per component size, one border color, one or two shadow levels. Avoid stacking borders, shadows and gradients.
- **Icons:** one icon set and one stroke style at fixed sizes; decorative icons hidden from screen readers, meaningful ones labelled.
- **Dark mode:** only if the project supports it; then every token has a dark value and nothing is hardcoded to white or black.

## Components

- Build small reusable components with a clear prop interface and the states below. Prefer composition (children, slots) over many boolean props.
- Reuse the installed component library or existing primitives. Do not add a UI library, icon package, animation library or date picker without a stated need and the person's approval. A native element (`<dialog>`, `<details>`, `<select>`, `<input type="date">`) is often enough.
- Keep presentation separate from data fetching. Client components only where state or events need them; keep server data loading where the project already does it.
- Every interactive component supports mouse, touch and keyboard, shows focus, and exposes the right role and name.

## Required states for every data view and form

Design and implement all of these, not just the happy path:
- **Loading:** skeleton or inline progress that matches the final layout and avoids layout jumps. Disable the control that started the work.
- **Empty:** says what is missing and offers the next step (an action, a filter reset), with different wording for "nothing yet" and "no results for this filter".
- **Error:** plain language, what the person can do, a retry where it helps, no technical detail. Keep their input.
- **Success:** a confirmation that does not block, announced to assistive technology.
- **Permission denied / not available:** when the role or the hub setup does not allow the screen or action, show a clear message (or hide the control if showing it would mislead). The UI check is for clarity only; the server remains the gate and the UI must handle its refusal gracefully.
- **Partial and long content:** very long names, missing images (fallback), missing optional fields, large numbers.
- **Destructive actions:** a confirmation that names the thing being deleted, with a clearly distinguished confirm button.

## Admin dashboards and data screens

- **Information hierarchy:** page title and primary action first, then summary numbers, then the list or table. One primary action per view.
- **Stat cards:** a clear label (say exactly what is counted), a value, optional trend or note. Numbers on the page must come from the existing data layer; never type or approximate a figure in the UI. The same figure shown in two places must be the same value.
- **Tables and lists:** sticky header where useful, right-aligned numbers, truncation with a full-value tooltip or detail view, row actions in a menu, a visible selected and hover state. On phones, switch to stacked cards or scroll the table inside its own container; never let the page scroll sideways.
- **Search, filter and sort:** visible active filters with a way to clear them, sensible defaults, state kept in the URL when the view should be shareable, a result count, debounced search where it hits a server.
- **Forms:** labels tied to inputs, hints under the field, validation messages next to the field, required marked clearly, a single submit with a pending state, errors summarized for screen readers, no loss of input on failure.
- **Dialogs and detail views:** use a real dialog (focus moves in, is trapped, returns on close, Escape closes); detail panels keep a stable header and scroll their own content; one scroll area per view.
- **Navigation:** clear current location, consistent order, collapsible on phones with an accessible toggle, counts as secondary information.

## Large datasets

- Paginate server-side where the data layer supports it; otherwise paginate or window on the client. Choose page size to the use (25 to 100 rows).
- Use virtualization only when a list stays long on one page (several hundred rows or heavy rows) and pagination does not fit; do not add a dependency for a list of 50.
- Keep the list stable while loading the next page; show total or "showing X to Y" only if the number is real and cheap.
- Do work once: memoize derived lists after measuring, not by habit. Do not re-fetch or re-sort on every keystroke.
- Lazy-load images, give them dimensions, and provide a fallback.

## Responsive behaviour

- Design mobile first, then widen. Test at about 360, 768 and 1280 pixels, and at 200 percent zoom.
- Fluid layouts (grid and flex with wrapping) before breakpoints; use the project's existing breakpoints.
- Touch targets about 44px; spacing between targets; no hover-only features.
- No horizontal page scroll. One main scroll area; avoid nested scrolling that traps touch or wheel input; use dynamic viewport height for full-screen shells.
- Collapse secondary columns, move actions into menus, and keep the primary action reachable.

## Accessibility

- Semantic HTML first (`button`, `a`, `nav`, `main`, headings in order, `table` with headers, `label`). ARIA only where HTML cannot express it.
- Everything operable by keyboard, in a logical order, with a visible focus indicator; skip repeated navigation where the layout needs it.
- Contrast of at least 4.5:1 for text and 3:1 for large text and UI boundaries; check colors from the reference rather than assuming.
- Names for icon-only buttons, alt text for meaningful images, empty alt for decoration.
- Status changes and errors announced (`role="status"`, `role="alert"`, `aria-live`), form errors linked with `aria-describedby`.
- Respect `prefers-reduced-motion`; keep animation short and purposeful (state change feedback), never decorative loops.
- Do not rely on color, position or hover alone to convey meaning.

## Restraint

- Preserve existing functionality, routes, API contracts and business rules. A UI change that needs one of them to change is a separate decision for the person.
- No unnecessary dependencies, no heavy animation, no ornamental clutter, no arbitrary redesign, no unrelated file edits.
- Do not remove a feature to make a layout simpler; relocate it.
- Do not commit placeholder data, lorem ipsum, or debug styling.

## iConnectHub context (only when this project is detected)

Use the current interface as the functional reference, and check each area exists before touching it. Areas that may be present: hub management cards and hub details, registered guests and guest details, announcements and events, newsletter image or content management, Wi-Fi settings, guest chat and conversation lists, visitor analytics. In this project the visual language is defined by the tokens in the global CSS (blue brand, soft surfaces, DM Sans, rounded cards) and the shared pieces under `components/ui` and `components/dashboard`; read them rather than recalling values. Keep the sidebar, header and page-frame pattern consistent, and keep hub-scoped pages inside the existing hub page frame. Counts and totals shown in cards, badges and list footers must use the same data source for the same figure (see `backend-database-engineer`). Do not hardcode hub data, and do not assume a feature or field exists until you have seen it in the code or data.

## Final report

- What changed and why; files created, modified, removed; reused vs new components and any new tokens.
- How each state (loading, empty, error, success, permission denied) is handled.
- Verification: exact commands and real results; which widths, keyboard and contrast checks were actually done, with how (browser run, screenshot) and which were not.
- Differences from the reference and the reason; known gaps; anything the person must decide.
