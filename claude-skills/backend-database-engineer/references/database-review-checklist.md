# Database review checklist

Use when designing, changing or reviewing a schema, query, migration or data-handling code. Tick only what you actually checked. Where the store is not relational (document store, key-value, REST-driven realtime database), apply the intent of each item in that store's terms and say what does not apply.

## 1. Inspect first
- [ ] Engine, version, access layer (ORM, query builder, raw SQL, REST client) and migration tool identified from the code and config.
- [ ] Every reader and writer of the data found (app code, workers, jobs, other apps, reports).
- [ ] Existing naming, id and timestamp conventions noted and followed.

## 2. Schema and relationships
- [ ] Each entity has a stable primary key; ids are not reused or derived from mutable data.
- [ ] Relationships (one-to-many, many-to-many via a join table) are explicit; no comma-separated lists in a column or arrays used as a join.
- [ ] Foreign keys exist with a deliberate `ON DELETE` rule (restrict, cascade, set null) and a reason for it.
- [ ] Types fit the data (exact decimals for money, timestamps with time zone handling, enums or check constraints for fixed sets).
- [ ] `NOT NULL`, `UNIQUE`, `CHECK` and defaults express the real rules; nullable columns are nullable on purpose.
- [ ] Created and updated timestamps, and the author where it matters for audit.
- [ ] Soft delete vs hard delete decided; queries, uniqueness and counts respect it.
- [ ] Denormalised or duplicated values have one owner and a defined refresh path.
- [ ] Multi-hub: every tenant-owned row carries its hub, the hub is part of lookups and uniqueness (for example unique per hub, not globally) and cannot be changed by the client.

## 3. Queries
- [ ] Hub (tenant) scope is inside the query or path, not applied after fetching.
- [ ] Parameterised values only; sort and filter names come from an allow-list.
- [ ] Only needed columns and rows are fetched; every list is paginated with a stable, unique sort order.
- [ ] No N+1: related data fetched in batches or joins; independent reads run in parallel.
- [ ] No function or cast on an indexed column in a predicate; no leading-wildcard search on a big table without a plan.
- [ ] Deep `OFFSET` replaced by keyset pagination where lists are large.
- [ ] Execution plan read for new or slow queries; row estimates compared with reality.
- [ ] Timeouts set on queries and outbound calls.

## 4. Indexes
- [ ] Indexes cover foreign keys, common filters, sort keys and uniqueness rules.
- [ ] Composite index column order matches the query (equality columns first, then range or sort).
- [ ] No duplicate or unused indexes; write cost of each new index weighed.
- [ ] Large index builds done in a way that does not block writes, where the engine allows.

## 5. Integrity and concurrency
- [ ] Multi-step writes are atomic (transaction, atomic multi-path update, or a safely repeatable sequence).
- [ ] Transactions are short and contain no third-party network calls.
- [ ] Concurrent writers handled: optimistic version, conditional write, lock, or atomic increment as fits.
- [ ] No read-modify-write of shared lists or counters outside an atomic operation.
- [ ] Retried requests are safe (idempotency key, natural unique key, upsert).
- [ ] Orphans prevented or cleaned: deleting a parent handles its children (including chats, messages, files, subscriptions linked by a shared key).
- [ ] Rules or constraints in the database match the application's checks (security rules, row-level policies).
- [ ] Uniqueness races covered by a unique constraint, not only an application check.

## 6. Counts, totals and metrics
- [ ] Each number named exactly and classified: derived from records, stored counter, or existing aggregation.
- [ ] One source per metric, used on every screen that shows it.
- [ ] All writers of any counter found; increments are atomic.
- [ ] No double counting (duplicates, repeated page loads counted as visitors, overlapping hub and global totals).
- [ ] Filters (active, live, expired, deleted, date window, time zone) stated in the label and in the query.
- [ ] Badge, card and list totals for the same thing agree; disagreements between sources are reported, not hidden.
- [ ] Empty data returns zero, not an error or a blank.

## 7. Migrations
- [ ] Versioned, small, reviewed, and run through the project's migration tool (no hand edits on production).
- [ ] Expand, migrate, contract: new schema works with old code, and old schema works with new code, during the deploy.
- [ ] Backfills run in batches with a progress record, and can be stopped and resumed.
- [ ] Defaults and `NOT NULL` added in a way that avoids long locks on large tables.
- [ ] Tested on a copy of realistic data, including records written by older code.
- [ ] Rollback planned before running: down migration, restore point or forward fix, with who runs it and how long it takes.
- [ ] Backup or snapshot taken before any destructive step; destructive steps are separate, explicit and approved.
- [ ] Order relative to the code deploy written down.

## 8. Backward compatibility
- [ ] Consumers of the current shape listed (apps, workers, webhooks, other sites).
- [ ] Changes are additive; renamed or removed fields kept readable until consumers move.
- [ ] Readers supply defaults for missing fields in old records.
- [ ] Breaking changes versioned with a stated retirement date.

## 9. Access and security (with `application-security`)
- [ ] Authentication and authorization checked server-side on every path that reads or writes.
- [ ] The hub is resolved from trusted context or verified against the user's access; a client hub id is never trusted alone.
- [ ] Record ids from the client are looked up inside the authorized hub.
- [ ] Database credentials have the least privilege needed; no superuser or admin key in app code where a scoped one works.
- [ ] Sensitive fields (tokens, push subscriptions, passwords, contact details) are not returned to clients that do not need them and not written to logs.
- [ ] Cross-hub access tested for read, create, update and delete.

## 10. Operations
- [ ] Connection pool or client shared per process and sized for all instances against the database limit; released on all paths.
- [ ] Config from environment, validated at use, optional features off when unset, no secrets in the repo.
- [ ] Failures logged without personal data; user-facing errors are safe and specific enough to act on.
- [ ] Background jobs idempotent, retried with backoff and a limit, with a recorded outcome and a single owner.
- [ ] Monitoring or a way to see slow queries and failed jobs.

## 11. Tests
- [ ] Constraints, validation and calculation logic have unit tests.
- [ ] Endpoints or actions tested for success, invalid input, unauthenticated, wrong role, another hub's id and missing record.
- [ ] Transaction failure mid-way leaves no partial data.
- [ ] Pagination, sorting and totals tested at boundaries (empty, one page, exact page size, last page).
- [ ] Migration up and down (or forward fix) tested on a copy.
- [ ] Results reported exactly as they ran; skipped checks named.
