# Design system checklist

Tick only what you actually checked. Write "not checked" for the rest in the report.

## 1. Visual consistency
- [ ] Colors, fonts, radii, shadows and spacing come from the project's tokens; no stray hex values or arbitrary pixel values where a token fits.
- [ ] New tokens (if any) were added to the token file, not inline, and named like the existing ones.
- [ ] Spacing follows one scale; padding is the same across cards of the same kind; gaps between sections are consistent.
- [ ] Type uses the existing scale: one size and weight per role (page title, section title, body, caption, label).
- [ ] Buttons, inputs, selects, badges, cards, tables and dialogs look like the existing ones; primary, secondary and destructive actions are distinct.
- [ ] One icon set, one stroke weight, fixed sizes; icons align with text.
- [ ] Borders, radii and shadows are not stacked or mixed arbitrarily.
- [ ] Repeated markup was turned into a component instead of copied.
- [ ] Matches the reference in structure, hierarchy, labels and rhythm; differences are listed with reasons.
- [ ] No sample or placeholder data left in; text is real or comes from the data layer.
- [ ] Dark mode (only if the project has it): every new color has a dark value.

## 2. Responsive behaviour
- [ ] Checked at about 360, 768 and 1280 px (and 200 percent zoom).
- [ ] No horizontal page scroll at any width.
- [ ] Tables become stacked cards or scroll inside their own container on phones.
- [ ] Touch targets are about 44 px with space between them; no hover-only actions.
- [ ] One main scroll area; no nested scrolling that traps touch or wheel input.
- [ ] Navigation collapses on phones with an accessible toggle; the drawer closes on selection and on Escape.
- [ ] Long text truncates or wraps without breaking the layout; images keep their ratio.
- [ ] Inputs are at least 16 px on phones (no zoom on focus); sticky bars do not cover content or the on-screen keyboard.
- [ ] Full-screen shells use dynamic viewport height.

## 3. Accessibility
- [ ] Semantic elements used (`button`, `a`, `nav`, `main`, ordered headings, real `table` markup, `label` for every field).
- [ ] Everything works with the keyboard alone, in a logical order; focus is always visible.
- [ ] Dialogs move focus in, trap it, return it on close, and close with Escape.
- [ ] Text contrast at least 4.5:1 (3:1 for large text and UI boundaries), measured, not assumed.
- [ ] Icon-only controls have accessible names; decorative icons are hidden; meaningful images have alt text.
- [ ] Errors and status changes are announced (`role="alert"` or `role="status"` / `aria-live`); field errors are tied to fields with `aria-describedby`.
- [ ] State is not conveyed by color alone (text or icon too).
- [ ] Selected, expanded and pressed states are exposed (`aria-current`, `aria-expanded`, `aria-pressed` or `aria-checked` as fits).
- [ ] `prefers-reduced-motion` respected; no autoplaying or looping decoration.
- [ ] Zoom to 200 percent keeps all content and functions available.

## 4. Interaction states
For each interactive element:
- [ ] Default, hover, focus-visible, active, disabled.
- [ ] Pending (action in progress) with the control disabled and a visible indicator; no double submit.
- [ ] Selected and current states where relevant.

For each data view and form:
- [ ] Loading (skeleton or inline progress matching the final layout, no layout jump).
- [ ] Empty: "nothing yet" and "no results for this filter" are different, each with a next step.
- [ ] Error: plain language, a way to retry, no technical detail, input preserved.
- [ ] Success: non-blocking confirmation, announced to assistive technology.
- [ ] Permission denied or not available: clear message or no misleading control; the UI handles a server refusal without breaking.
- [ ] Partial data: missing image, missing optional fields, very long values, very large numbers, zero values.
- [ ] Destructive actions ask for confirmation that names the item.
- [ ] Unsaved changes are visible and not lost by accident.

## 5. Data-heavy screens
- [ ] Lists are paginated (or windowed) with a stable order; "showing X to Y" only when real.
- [ ] Virtualization used only when a long single page justifies it, with no new dependency for small lists.
- [ ] Search is debounced if it hits the server; filters show as chips with a clear-all; sort state is visible.
- [ ] Shareable view state (filters, tab, page) lives in the URL where it should.
- [ ] Every number shown comes from the data layer; the same figure in a badge, card and list footer is the same value.
- [ ] Images are lazy-loaded, sized, and have a fallback.

## 6. Preserved behaviour
- [ ] Routes, API contracts, server actions, types and business rules are unchanged unless the task said otherwise.
- [ ] No mock data replaced real data; no invented endpoints or fields.
- [ ] No new dependency without a stated need and approval.
- [ ] Unrelated files untouched.

## 7. Checks that were actually run
- [ ] Type check: command and result.
- [ ] Lint: command and result.
- [ ] Tests: command and result (or "none exist").
- [ ] Build: command and result.
- [ ] Browser run at phone, tablet and desktop widths: how it was done (screenshots or interactive), and what was seen.
- [ ] Keyboard-only pass, and contrast check: done or not done.
