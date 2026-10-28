# Test strategy

Use this to decide what kind of test to write for a risk, and how. Keep the pyramid: many fast unit tests, a moderate number of integration tests, few end-to-end tests for the critical paths. Move a check down a level when it can be proven there.

## Choosing the level

| Risk | Best level |
| --- | --- |
| Calculation, formatting, parsing, mapping, permission function | Unit |
| Endpoint or server action behaviour, validation, status codes, stored result | Integration |
| Database query, constraint, transaction, migration | Integration against a test database (or a faithful fake of the same behaviour) |
| Session and role boundaries, tenant isolation | Integration (and one end-to-end check per critical case) |
| A user can finish a key task through the real UI | End-to-end |
| Layout, focus, keyboard and responsive behaviour | End-to-end or manual browser run, reported as such |
| Something that broke before | Regression test at the lowest level that reproduces it |

## 1. Unit tests

- Scope: pure functions and small modules without network, database, clock or file system.
- Cases: normal, empty, single, many, boundary values, duplicates, wrong types, very long input, missing optional fields, records in older shapes.
- Time: inject a clock or pass the date in; test around midnight, month ends, time zones and daylight saving where dates matter.
- Totals and counts: build the input records, compute, and compare with a number worked out by hand in the test.
- Keep them fast (milliseconds) and independent. No shared mutable state.
- Do not mock the thing under test. Mock only the boundary the unit calls.

## 2. Integration tests

- Scope: a request or action through validation, authorization, the service and the data layer, against a real test database, an emulator, or a fake that behaves like the real one (same status codes, same missing-data behaviour, same permission failures).
- For every endpoint or action, cover:
  - success and the exact stored result;
  - invalid input: missing, wrong type, too long, unexpected fields, bad ids;
  - unauthenticated, expired and tampered sessions;
  - each role that is allowed, and each that is not;
  - another tenant's id (read, update, delete, create with a foreign hub id);
  - record not found;
  - conflict and concurrent update;
  - the same request twice (idempotency, duplicate submission);
  - a failing dependency (the database, an email or push service, an upload host): safe message, no half-written data, no secret in the output.
- Data setup: create fixtures per test with fixed ids and timestamps, clean up after, and never share rows between tests.
- Transactions and multi-step writes: force a failure in the middle and assert nothing was left behind.
- Lists: page size boundaries, stable ordering with ties, filter combinations, search with special characters, empty result.
- External services: replace with recording fakes; assert the recipient, the content and the count; assert no duplicate sends on retry.

## 3. End-to-end tests

- Scope: a small set of critical user journeys in a real browser against a test environment with fake external services. Examples: sign in and see the right menu for the role; create, edit and delete a record and see the list change; a role without access is refused; upload and replace an image; switch between hubs; a chat reply appears for the right guest.
- Use the project's browser-test tool where it exists. If it has none, say so; do not present a one-off exploratory run as part of the suite.
- Selectors: roles, labels and visible text. Wait on conditions, not fixed delays. Each test creates its own data and signs in as a known test user.
- Capture a screenshot or trace on failure and keep them out of the repository unless asked.
- Check the states users can reach: loading, empty, error, success, permission denied, and a phone-width pass for key screens.
- Keep the suite small and stable; push detail down to unit and integration tests.

## 4. Regression testing

- Before a change to shared code, write characterization tests that capture what it does now (including odd but relied-on behaviour). Change the code. They must still pass, or each difference must be explained and approved.
- For each fixed bug, add a test that fails on the old code and passes on the new.
- Keep a short list of "must never break" workflows and run them before every release.
- Compare totals and counts before and after changes to query or aggregation code, on the same fixture.
- Check backward compatibility: records and requests in the old shape still work; old clients and workers still get what they expect.
- Run the full suite, type check, lint and build, not only the new tests.

## 5. Security testing

Test the behaviours; use `application-security` (when installed) and the security section of `react-nextjs-senior-engineer` for the rules.
- Authentication: protected routes and actions refuse requests without a valid session; expired and tampered tokens fail; sign-out ends access; login is rate limited and gives one generic failure message.
- Authorization: each role can do only what it should; lower roles cannot act on higher ones; users cannot change their own role, hub or status; checks happen on the server even when the button is hidden.
- Tenant isolation: for every entry point (page, action, route handler, background job, webhook), a user from hub A cannot read or change hub B; guessing record ids or sending another hub id fails the same way as "not found"; shared records follow their explicit rule.
- Input: oversized, malformed, wrong-type and unexpected fields are rejected; strings containing markup, quotes and control characters are stored and shown safely; links accept only allowed schemes; file uploads check type by content, size and name handling.
- Output: errors reveal no stack traces, queries, tokens or other people's data; sensitive fields are not returned to callers who do not need them; logs hold no secrets or personal data.
- Abuse: repeated requests, large payloads, duplicate submissions and replayed requests do not cause damage or duplicate side effects.
- Secrets: none in the repository, test fixtures, screenshots or client bundles (search the build output for known key names).
- Run the dependency audit when the project supports it, and report findings without hiding them.
- Do not run attacks against production or third-party systems. Use a local or test environment you control.

## 6. Environments and data

- Use a local or emulated backend, a test project, or a throwaway database, with fake credentials and reserved test email domains.
- Check the target before any run that writes: refuse if URLs or project ids look like production.
- Deterministic clocks, ids and seeds. No dependence on the current date or test order.
- Reset state between tests; run in random order and in parallel at least once before calling a suite stable.

## 7. Reporting

- List the commands run and the real counts (passed, failed, skipped).
- List what was not tested and why, with the risk of each gap.
- Name flaky tests, the evidence, and the suspected cause.
- Distinguish defects in the product, defects in the tests, and environment problems.
- Never claim a pass that was not run, and never weaken or remove a test to reach green.
