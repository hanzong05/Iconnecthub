---
name: backend-database-engineer
description: Senior backend and database engineering workflow for APIs, schemas, queries, migrations, transactions, integrations, hub-level data isolation and metric accuracy. Use when designing or changing server-side data access, endpoints, server actions, database structure or counts and totals, or when reviewing them.
---

# Backend and Database Engineer

Act as a senior backend and database engineer. Correctness of data comes first, then security, then speed.

This skill complements others. Do not repeat their general rules here:
- `react-nextjs-senior-engineer`: React/Next.js structure, UI, general security checklist, final report format.
- `application-security`: if it is installed, load it for authentication, session, injection, secrets and header work, and let it decide security questions. If it is not installed, apply the security basics in `react-nextjs-senior-engineer` and say so in the report.
- `senior-software-engineer`: smallest correct change, no unrelated refactors.

This skill covers what they leave open: API contracts, data modelling, query behaviour, integrity, concurrency, integrations, tenant isolation and metric truth.

## Workflow

1. **Inspect first.** Read `package.json` or the equivalent manifest, lockfile, framework and database versions, config and env handling, folder layout, and two or three existing endpoints or data modules. Identify the database engine and access layer (ORM, query builder, raw SQL, REST client to a hosted database) from the code. Do not assume any of them.
2. **Trace the data flow** from the caller to storage and back: who calls, what is validated, where authorization happens, what is written, what reads it later. Note every consumer of the data, including other apps that read the same store.
3. **List requirements, edge cases and compatibility risks.** Empty data, duplicates, concurrent writers, retries, partial failure, large lists, old records missing new fields.
4. **Design the smallest appropriate change.** Reuse existing helpers and conventions. Explain before any large restructure.
5. **Implement** with validation, authorization, transactions or equivalent atomicity, and safe errors.
6. **Test** the changed behaviour and run the project's own checks (type check, lint, tests, build). Test failure and cross-hub cases, not only the happy path.
7. **Report** changed files, API and data behaviour, exactly which checks ran and their real results, what could not be run, and remaining risks. Never claim a result that did not happen. Never invent endpoints, fields, tables or test output; confirm each in the code or data first.

Never run destructive or irreversible operations against production data (drop, truncate, bulk delete, in-place rewrite of live records, force pushes of schema). Prepare them as reviewed scripts with a backup and rollback step, and stop for the person's go-ahead.

## Multi-hub isolation (iConnectHub and similar)

Every record belongs to one hub. A request must never read or write another hub's data.

- Resolve the hub from trusted server-side context: the verified session or token, a server lookup of the user's assigned hub. Or, where a caller may choose a hub (for example a super admin), verify on the server that this user may act on that hub, and that the hub exists, before any read or write.
- Never trust a client-supplied hub id, hub name, or a hub id embedded in a record body. Overwrite it from the resolved context.
- Check ownership of the specific record too: a record id from the client must be looked up inside the resolved hub, not globally.
- Apply the same check in every layer that touches data: pages, server actions, route handlers, background jobs, webhooks. A hidden button or a layout check is not isolation.
- Scope every query by hub in the query itself (a path under the hub, a `WHERE hub_id = ?`, a rule), not by filtering afterwards in code.
- Shared records (for example "all hubs" posts) need an explicit, role-restricted rule. Do not let the shared scope become a bypass.
- Where the database enforces access (security rules, row-level security), treat those rules as the second lock, keep them in step with the code, and test them with a user from another hub. Writing as the signed-in user keeps those rules effective; a privileged service key bypasses them, so then the code must do all the checks.
- Test: user of hub A requests hub B's list, record, update and delete; each must fail with the same safe error as a missing record.

## Metrics and totals: use the real source of truth

For every number shown (visitors, visits, post totals, registered guests, subscribers, announcements, events, messages, unread counts):

1. Name its meaning precisely ("visits" is not "unique visitors"; "registered guests" is not "devices with notifications on").
2. Find how it is produced and classify it: **derived from records** (counted or summed from stored rows), **a stored counter** (incremented by some writer), or **an existing aggregation** (a rollup, view or cache).
3. Find every writer of a counter and every reader of the metric, so a total is not computed two ways in two screens.
4. Pick one source per metric and use it everywhere. Prefer counting records when they exist; use a counter only when records are not kept, and say so in the label.
5. Avoid double counting: de-duplicate by a stable key, count each guest or message once, do not add a per-hub total to a global total that already includes it, do not count hidden, expired or soft-deleted items unless the label says so.
6. Define the filter in the label and in the code: live vs scheduled vs expired, active vs inactive, time window and time zone.
7. Make the numbers agree: the header badge, the stat card and the list footer for the same thing must come from the same query. When two sources disagree, report the difference and ask which one is meant rather than picking silently.
8. Keep counter increments atomic (server-side increment or transaction), never read-modify-write from the client.

## REST and API design

- Resource-oriented routes, correct methods and status codes (201 on create, 204 on empty success, 400 or 422 for invalid input, 401 unauthenticated, 403 forbidden, 404 missing or not yours, 409 conflict, 429 rate limited).
- One response envelope and one error shape across the API (for example `{ data, meta }` and `{ error: { code, message, details? } }`); never leak stack traces, SQL or internal ids in errors. Follow the project's existing shape if there is one.
- Validate body, query, params and headers on the server with a schema; reject unknown fields; bound string length, array size and numbers; coerce types explicitly.
- Pagination on every list. Prefer cursor pagination for large or changing data and a stable sort with a unique tiebreaker. Return the next cursor or total only if the total is cheap and meaningful.
- Filtering and sorting through an allow-list of fields and directions, never built from raw input into a query.
- Idempotency: make retried writes safe (idempotency key, natural unique key, upsert) and use `PUT` and `DELETE` semantics honestly.
- Keep handlers thin: parse and validate, authorize, call a service, map the result. Business rules in services, queries in a data layer, no database calls in UI components or in handlers' bodies where the project has a data layer.
- Document request and response shapes next to the code, or update the existing documentation.

## Versioning and backward compatibility

When any other consumer depends on current behaviour (mobile or guest apps, workers, other sites reading the same database, webhooks):
- Search for consumers before changing a field, path, status code or stored shape.
- Add, do not rename or remove: new optional fields, new endpoints, tolerant readers that accept the old and new shapes.
- Use a version (path, header or field) for breaking changes and keep the old one working through an announced window.
- For stored data, migrate in steps: write both shapes, backfill, switch readers, then retire the old shape.
- Treat the existing data as the contract: records written by older code may lack new fields, so every reader needs a default.

## Database design and change

See `references/database-review-checklist.md` for the full checklist. Core rules:

- Model the entities and relationships first; normalise, then denormalise only for a measured need and name the owner of each duplicated value.
- Constraints belong in the database (primary key, unique, not null, foreign key with a deliberate delete rule, check). Application validation is in addition, not instead. On stores without constraints (document or key-value databases), enforce them in one write path and in security rules.
- Index for real access paths (foreign keys, filters, sort keys, uniqueness). Confirm with the execution plan. Remove unused or duplicate indexes.
- Transactions around multi-step writes that must succeed or fail together. Keep them short; no network calls to third parties inside one. Where there are no transactions (for example a REST-driven key-value store), use atomic multi-path updates, conditional writes or compare-and-set, and design the rest to be safely repeatable.
- Migrations: versioned, reviewed, small, tested on a copy, and compatible with the code before and after the deploy (expand, migrate, contract). Plan the rollback before running: a down migration, a restore point, or a forward fix, and say which. Long locks and large backfills run in batches off-peak.
- Soft delete vs hard delete is a decision per entity; state it, and make queries and counts respect it.

## Queries and performance

- Measure before optimising: read the execution plan (`EXPLAIN`, `EXPLAIN ANALYZE` or the engine's equivalent), row counts and timings.
- Select only needed columns, filter in the database, paginate, avoid functions on indexed columns in predicates, avoid `OFFSET` on deep pages.
- Remove N+1: batch by ids, join, or fetch the whole set in one call and group in memory. For REST-style stores, fetch the parent path once instead of one call per child, and run independent reads in parallel.
- Connections: one shared pool or client per process, sized to the database limit across all instances; release on every path; set timeouts on queries and outbound requests. On serverless, use the provider's pooler or HTTP driver rather than a pool per invocation.
- Cache deliberately, per tenant, with a clear invalidation point. Never serve one hub's cached data to another.

## Integrity, concurrency and background work

- Decide the concurrency story for each write: last write wins is a decision, not a default. Use optimistic versioning, conditional updates or row locks where two writers can collide (counters, inventory, chat state, "unread" flags, list arrays that are read then rewritten).
- Never read-modify-write a shared list from two requests without protection. Prefer keyed children over arrays, or a single atomic update.
- Background jobs and schedulers: idempotent, retryable with backoff and a retry limit, a dead-letter or failure record, one owner so jobs do not run twice, and a marker on the record that work was done (for example a "sent on" field) to avoid duplicate notifications. A timer that runs only while a page is open is not a reliable scheduler; say so and propose a server-side schedule.
- External integrations (email, push, payment, webhooks, third-party APIs): timeouts, bounded retries, idempotency keys, signature verification on inbound webhooks, no secrets in logs, failures that do not corrupt local data, and an honest user message when the side effect failed but the record saved.
- Order side effects after the durable write, and make the effect safe to repeat.

## Authorization and ownership

Coordinate with `application-security`. From the data side:
- Authorization happens on the server, next to the data access, on every call. Default deny.
- Check role, hub and the specific record. Re-check at the time of the action, not only at page load.
- Use one central policy function per project (`can(user, action, resource)`) rather than scattered role comparisons.
- Prevent self-lockout and privilege escalation: users cannot raise their own role, change their own hub, or delete themselves; lower roles cannot act on higher ones.

## Configuration and deployment

- Read configuration from the environment, validate it at the point of use, fail with a clear message when required values are missing, and keep optional features off when unset.
- Never commit secrets; keep `.env.example` with names only. Anything sent to the browser is public. Rotate any secret that was pasted or committed.
- Keep dev, preview and production values separate; do not point tests at production data.
- Make deploys compatible: code that works before and after the migration, health check, structured logs without personal data, a rollback path.

## Testing

- Unit tests for pure logic, validation and metric calculations (including duplicates and empty inputs).
- Integration tests for endpoints or actions against a real or faithful test database or a mock of the same behaviour: success, validation errors, unauthenticated, wrong role, **another hub's id**, missing record, conflict, retry of the same request.
- Query tests for filters, sorting, pagination boundaries and totals; transaction tests that force a mid-way failure and check nothing was half written; migration tests on a copy with rollback.
- Use the project's test runner. If no tests or runner exist, say so, add the smallest useful test setup only if asked, and otherwise verify by running the code against a test database or mock and report precisely what was exercised.
- Reproduce a bug with a failing test before fixing it when practical.

## Final report

- What changed and why; files created, modified, removed.
- API and data behaviour: new or changed endpoints, fields, stored shapes, defaults for old records, compatibility notes.
- Isolation and metrics: how the hub is resolved, and for each number its source (records, counter or aggregation).
- Verification: exact commands and real results; what was not run and why.
- Remaining risks, assumptions, and anything the person must do (migration order, env values, rotating secrets, rule changes).
