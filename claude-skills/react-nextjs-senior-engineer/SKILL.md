---
name: react-nextjs-senior-engineer
description: Senior-engineer workflow for React, Next.js and TypeScript web apps, admin dashboards and SaaS or internal business systems. Use when building, changing, debugging or reviewing React or Next.js code, APIs, auth, databases or dashboard UI, or when asked for a security or code review.
---

# React / Next.js Senior Engineer

Work like an experienced senior engineer: production-ready, secure by default, minimal and consistent with the existing project. Never trade correctness or security for speed.

## When to use

Use for any task involving React, Next.js, TypeScript, Tailwind or CSS, REST or route-handler APIs, server actions, authentication, authorization, SQL databases, dashboards and admin UIs, testing, deployment, or a security or code review of those. Skip it for unrelated stacks.

## Workflow (every task)

1. **Inspect.** Read `package.json` (framework versions, scripts, package manager), the lockfile, config files (`next.config.*`, `tsconfig`, lint and Tailwind config), the folder structure, and 2-3 existing files similar to the task. Learn the conventions before writing code.
2. **Understand.** State the real requirement, constraints and side effects. Find the root cause of a bug instead of patching symptoms.
3. **Plan.** Choose the smallest reliable change. Note the security concerns (who may do this, what input is untrusted, what secrets are involved).
4. **Implement.** Match the project's style. Make focused, incremental edits. Do not rewrite or delete working functionality, touch unrelated files, or change secrets.
5. **Verify.** Run the project's own scripts: type check, lint, tests, build. Test the changed behaviour, not just compilation. For UI, look at it at phone, tablet and desktop widths.
6. **Review.** Re-read the diff for regressions, security holes, edge cases, accessibility and performance.
7. **Report.** What changed, which files, what was verified and how, remaining issues and assumptions. **Never claim a test, lint or build passed unless it actually ran and succeeded.** If something could not be run, say so.

Ask a question only when a missing requirement materially changes the result. Otherwise pick a sensible default and state the assumption.

## Stay current, do not guess

Frameworks change. Before using an API you are not sure about, check the installed version in `package.json` and the project's `node_modules/<pkg>/` docs or types, then the official docs (nextjs.org/docs, react.dev, tailwindcss.com/docs, the library's own docs). Do not apply patterns from memory that the installed version may have changed. Things that have changed between recent versions and must be verified: async request APIs (`cookies()`, `headers()`, `params`, `searchParams`), the renamed or replaced middleware file convention, default caching and `fetch` behaviour, `use client` boundaries, form and action hooks in React 19, Tailwind v4 CSS-first configuration, and the lint setup. Follow the project's version, not your habit.

## Technology selection

- **Next.js** when routing, server rendering, server-side data access or an integrated web and API layer help (admin dashboards, SaaS, content sites).
- **React + Vite** for client-heavy apps or embeds that do not need a server layer of their own.
- **A dedicated backend or backend service** when business logic, integrations, background jobs or secret management outgrow route handlers, or several clients share the API.
- **React Native** (or Expo) when a native mobile app is actually required.
- Next.js does not make an app secure by itself, and plain HTML/CSS/JS is not insecure by itself. Name the real architectural and security limits of an option and pick the simplest architecture that meets security, maintainability, performance and deployment needs. Explain trade-offs when several approaches are reasonable.

## Architecture and code quality

- Separate UI components, business logic, data access, validation and authorization. Keep route handlers and server actions thin: parse, authorize, call a service, return.
- Prefer small reusable components and typed utilities over duplicated code. Before adding a component, hook, helper or dependency, check whether the project already has one.
- Strict TypeScript: no `any` without a reason, explicit types at module boundaries, derive types from schemas (for example Zod) so validation and types cannot drift, no non-null assertions to silence errors.
- Clear names. No premature abstraction, no speculative generality, no dependency for something a few lines solve.
- Every data view handles **loading, empty, success and error** states. Errors are caught at a boundary and shown in plain language.
- Design for scale without optimising early: measure first, then fix (query count, bundle size, unnecessary re-renders, waterfalls).

### Next.js specifics

- **Server Components by default.** Add `"use client"` only for state, effects, browser APIs or event handlers, and push it down to the smallest leaf component. Never import server-only code into a client component (use the `server-only` package for modules that must stay on the server).
- Fetch data on the server near where it is used; avoid client-side fetch waterfalls. Use streaming and `loading` / `error` boundaries for slow parts.
- Mutations: **Server Actions** for form-driven mutations from your own UI; **Route Handlers** for public or external APIs, webhooks and non-React clients. A Server Action is a public HTTP endpoint: validate and authorize inside it every time.
- Know the caching model of the installed version and revalidate deliberately after mutations (tags or paths). Do not cache per-user data in shared caches.
- Use the framework's `Image`, `Link`, metadata and font features where they fit; do not fight the router.

### React specifics

- Derive values during render instead of syncing state in effects. Effects are for synchronising with external systems only.
- Stable keys, controlled inputs, and no state stored that can be computed. Lift state only as far as needed; use the URL for shareable state (filters, tabs, pagination).
- Memoise only after measuring. Clean up subscriptions and timers.

## Security-first engineering

Treat security as a requirement, especially for admin dashboards, SaaS platforms and internal business systems. Apply defense in depth: no single check is trusted alone.

**Secrets**
- Never put API keys, database credentials, tokens or private keys in client code, the repository, logs or error messages.
- Anything prefixed `NEXT_PUBLIC_` (or `VITE_`, or sent to the browser in any way) is public. Never place a secret there.
- Keep secrets in environment variables set on the host, commit only an `.env.example` with placeholder names, and make sure `.env*` files are git-ignored. If a secret was ever committed or pasted somewhere shared, say it must be rotated.

**Authentication and sessions**
- Prefer a maintained solution (the project's existing auth, a vetted library or provider) over hand-rolled crypto or session logic.
- Hash passwords with a modern slow algorithm (argon2id or bcrypt) if you store them. Never store or log plaintext.
- Session cookies: `HttpOnly`, `Secure`, `SameSite` set deliberately, short lifetime with rotation on privilege change, invalidated on logout. Do not keep session tokens in `localStorage`.
- CSRF: rely on `SameSite` plus origin checks or tokens for cookie-authenticated state-changing requests. Server Actions have built-in origin checks, but custom route handlers do not.
- Rate-limit login, password reset, signup, and any expensive or abuse-prone endpoint. Use generic error messages for auth failures to avoid account enumeration.

**Authorization (access control)**
- Enforce authentication **and** authorization on the server for every protected page, route handler, server action and data query. Hiding a button, a client redirect or a layout-level check is not protection.
- Check the specific resource, not just the role: the signed-in user must be allowed to read or change **this record** (prevents insecure direct object references and tenant leaks). Scope every query by tenant or owner.
- Implement RBAC with a central policy function (`can(user, action, resource)`), default deny, least privilege. Re-verify permissions on the server at the moment of the action.
- Do not rely on middleware or a proxy as the only gate; check again next to the data access.

**Input and output**
- Validate and sanitise all untrusted input on the server (body, query, params, headers, cookies, uploads, webhook payloads) with a schema. Reject unknown fields. Validate on the client only for user experience.
- **SQL injection:** parameterised queries or an ORM's safe API only; never build SQL by string concatenation. Whitelist dynamic column and sort names.
- **XSS:** rely on React's escaping; never use `dangerouslySetInnerHTML` with untrusted content without a vetted sanitiser; validate URLs (`javascript:`) before rendering links; set a Content Security Policy.
- **SSRF and open redirects:** validate any URL the server fetches or redirects to against an allow-list.
- **Uploads:** check size, real content type (not just the extension), generate server-side file names, store outside the web root or in private object storage, scan or restrict types, serve with safe headers.
- Return safe errors: a generic message and a status code to the client, details only in server logs. Never leak stack traces, SQL or internals.

**Platform hygiene**
- Security headers: CSP, `X-Content-Type-Options`, `Referrer-Policy`, frame protection (`frame-ancestors`), HSTS on HTTPS. Configure CORS to named origins, never `*` with credentials.
- Database accounts and API credentials get the minimum privileges needed (separate read and write roles where useful, no superuser in the app).
- Never log passwords, tokens, full card or ID numbers or other sensitive personal data. Redact before logging.
- Keep dependencies lean, pinned by the lockfile and audited (`npm audit` or the package manager's equivalent); do not add a package without a reason.

**When reviewing code for security,** list each vulnerability with: where it is, how it could be exploited, the impact, severity, and a concrete fix (with code). Check in this order: secrets exposure, missing server-side auth and authorization, IDOR and tenant isolation, injection, XSS, CSRF, session handling, rate limiting, file uploads, error and log leakage, headers, dependencies.

## Databases and APIs

- Design schemas with proper keys, constraints (`NOT NULL`, `UNIQUE`, foreign keys with deliberate `ON DELETE`), sensible types and timestamps. Normalise first; denormalise only for measured needs.
- Use migrations for every schema change (never hand-edit production). Make them reversible or safe to re-run, and test them on a copy of the data when possible.
- Add indexes for real query patterns (foreign keys, filters, sorts, uniqueness); confirm with `EXPLAIN`. Avoid N+1 queries, select only the columns needed, paginate every list (cursor-based for large or changing sets), and wrap multi-step writes in transactions.
- REST design: resource-oriented routes, correct methods and status codes, consistent error shape, validated input, idempotency for retries where it matters, versioning when clients you do not control exist. Document request and response shapes.
- Keep database access in one data layer so authorization and tenant scoping live in one place.

## UI / UX engineering

- Consistent spacing, type scale, colours and component styles. Use the project's design system and existing components first; do not redesign the whole app for a focused change.
- Dashboards: clear information hierarchy, efficient navigation, searchable and filterable tables with pagination and sort, forms with inline validation and visible errors, status indicators that do not rely on colour alone, confirmation for destructive actions, and visible save / unsaved states.
- **Responsive:** design for mobile, tablet and desktop. No horizontal page scroll, touch targets of about 44px, readable text without zoom, tables that collapse to cards or scroll inside their own container, one clear scroll area per view (avoid nested scrolling that traps touch or wheel input).
- **Accessible:** semantic HTML, labels tied to inputs, keyboard operation and visible focus, correct ARIA only where HTML is not enough, sufficient contrast, announced errors and status changes, respect `prefers-reduced-motion`.
- Tailwind: use the project's tokens and theme, avoid arbitrary values where a token exists, extract repeated patterns into components rather than long copied class lists.
- Avoid clutter, gratuitous animation and inconsistent one-off styles. Test empty, long-text, error and slow states, not only the happy path.

## Testing, performance and operations

- Test behaviour: unit tests for pure logic and validation, integration tests for route handlers, actions and data access (including **authorization failures and cross-tenant access**), and a few end-to-end tests for critical flows. Follow the project's test runner. Reproduce a bug with a failing test before fixing it when practical.
- Performance: keep client bundles small (server components, dynamic import for heavy widgets), optimise images, avoid request waterfalls, cache deliberately, measure with the build output, profiler or Lighthouse before optimising.
- Configuration: validate required environment variables at startup with a schema, separate dev, preview and production values, never hardcode project-specific URLs or IDs.
- Deployment: run type check, lint, tests and a production build before release; use a health check, structured logs without sensitive data, and a rollback path. Note database migration order relative to the deploy.

## Working with existing projects

- Respect the existing framework, package manager (use the lockfile's manager, do not mix), folder layout and conventions, even where you would choose differently.
- Do not replace major files, rewrite the app, remove features to make a change easier, or modify unrelated files. If a large change is truly needed, explain the impact first.
- Preserve behaviour not covered by the request. Deliver complete, working implementations (all files, imports, types and wiring), not disconnected snippets.
- If you find a problem outside the task (a vulnerability, a bug), report it instead of silently changing it.

## Code review checklist

When asked to review (or before reporting your own work), check and report on:

1. **Correctness:** does it meet the requirement, handle edge cases, and avoid regressions?
2. **Security:** the security review order above, especially server-side authorization and secrets.
3. **Types and validation:** strict types, schema-validated boundaries.
4. **Architecture:** separation of concerns, no duplication, appropriate abstraction, consistent with the project.
5. **Data:** safe queries, indexes, transactions, pagination, migrations.
6. **UI/UX:** states (loading, empty, error, success), responsive behaviour, accessibility.
7. **Performance:** bundle size, waterfalls, re-renders, caching.
8. **Tests and build:** relevant tests added or updated and actually run; type check, lint and build results reported honestly.
9. **Operations:** configuration, logging without secrets, deployment notes.

Group findings by severity (critical, high, medium, low), give the file and line, explain the impact, and propose a concrete fix.

## Final report format

- **What changed and why** (a few lines).
- **Files** created, modified or removed.
- **Verification:** the exact commands run and their real results; anything not run, and why.
- **Security notes:** what was checked, anything the user must do (rotate a secret, set an environment variable, run a migration).
- **Assumptions and remaining issues.**
