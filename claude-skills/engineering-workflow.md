# Engineering workflow

A short guide for working on this project. It does not replace any skill; it says in what order to use them. This file is a plain guide, not a skill: Claude Code does not load it by itself. Point Claude at it ("follow `.claude/skills/engineering-workflow.md`") or reference it from the project's instructions file.

## Skills in this project

Checked against the files on 2026-10-28.

| Skill | Use it for | Status |
| --- | --- | --- |
| `react-nextjs-senior-engineer` | React, Next.js and TypeScript application code, APIs, general security and review | Present on the PC at `.claude/skills/`. Not in the cloud copy of the project. |
| `application-security` | Authentication, sessions, secrets, injection, and other sensitive boundaries | Present (created 2026-10-28) |
| `backend-database-engineer` | Data operations, APIs, queries, migrations, hub isolation, counts and totals | Present |
| `ui-ux-design-engineer` | Screens, components, states, responsiveness, accessibility | Present |
| `qa-testing-engineer` | Writing and running tests, regression and security checks, honest reporting | Present |
| `legacy-integration-engineer` | Changing existing systems (the old admin, CMS, GHL, workers, external APIs), staged migration | Present |

Which skills Claude actually loads depends on each skill's description, the way Claude Code is configured, and the task. Skills are not all active at once and none is guaranteed to load. When a task clearly needs one, name it in the request ("use backend-database-engineer for this").

## The workflow

1. **Understand the task.** State the goal, the features affected, the acceptance criteria and the constraints (deadline, scope, things that must not change). Ask only if the answer would change what you build.
2. **Inspect before changing.** Read the relevant code, trace the data flow from source to screen, find the existing APIs, actions and types, and review dependencies and the framework version. Do not rely on memory of how it works.
3. **Select the relevant skills.**
   - Application code: `react-nextjs-senior-engineer`.
   - Sensitive boundaries (sign-in, roles, secrets, uploads, anything that sends or deletes): `application-security`.
   - Data operations, queries, counts, anything per hub: `backend-database-engineer`.
   - Interface work: `ui-ux-design-engineer`.
   - Verification and tests: `qa-testing-engineer`.
   - Changing something that already works and is used by others: `legacy-integration-engineer`.
4. **Plan the smallest safe change.** List the files, the data it reads and writes, the risks and the compatibility concerns (routes, stored data, external callers). Prefer reversible steps. Show the plan first when the change is large.
5. **Implement.** Keep existing business logic. Use the real data sources and the existing actions. Do not invent endpoints, tables or fields; if something is missing, say so and ask. Do not touch unrelated files.
6. **Review security.** Confirm authentication on every protected path, authorization checked on the server for the specific record, secrets kept out of the browser and the repository, and hub-level isolation (the hub comes from trusted context or is verified, never taken from the request alone).
7. **Verify behavior.** Run what exists: tests, type check, lint, build, and a browser check at phone, tablet and desktop widths. Check loading, empty, error and permission-denied states, and another hub's data. Read the output.
8. **Report honestly.** Say what changed (file paths), the commands run with their real results, what was not run and why, assumptions made, and the risks left. Never say something passed unless it ran.

## Conflicts between instructions

- Security and data-integrity requirements always win over visual or convenience requests. If a design needs a client-side shortcut that weakens a check, keep the check and adjust the design.
- When two skills overlap, follow the more specialized one for that topic (for example `backend-database-engineer` for how a count is computed, `ui-ux-design-engineer` for how it looks), and keep the core standards of the others: smallest correct change, real data, tested, reported honestly.
- If a request would break existing behavior, routes, data shapes or other people's integrations, stop and say so before doing it.
- If a needed skill is missing or did not load, say which, apply the closest available guidance, and note it in the report.

## Checks before calling a task done

- The acceptance criteria are met, and nothing outside the scope changed.
- No invented endpoints, fields or mock data in place of real data.
- Authorization and hub isolation hold for the changed paths.
- Type check, lint, tests and build were run where they exist, with results quoted.
- Visual and accessibility checks were actually done, or listed as not done.
- Open risks and decisions are written down.
