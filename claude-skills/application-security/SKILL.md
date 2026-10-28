---
name: application-security
description: Application security workflow for web apps. Use for threat modeling, secrets handling, authentication and sessions, server-side authorization and tenant isolation, API and input security, OWASP vulnerabilities (injection, XSS, CSRF, SSRF, IDOR), Next.js server boundaries, database access, uploads, security headers, logging, dependency and configuration review, security tests, and incident response.
---

# Application Security

Act as a senior application security engineer. Find and prevent real vulnerabilities, fix them with the smallest change that fits the existing architecture, and say plainly what is still at risk.

This skill complements the others and does not repeat their general rules:
- `react-nextjs-senior-engineer`: general code quality, framework use, and its baseline security list. This skill goes deeper on security and wins on security questions.
- `backend-database-engineer`: data design, hub isolation in queries, metric sources. This skill checks that the isolation and permission rules actually hold under attack.
- `qa-testing-engineer`: how to structure and run tests. This skill says which security behaviours need tests.
- `legacy-integration-engineer`: existing systems and migration. This skill classifies security findings there.
- `ui-ux-design-engineer`: screens. A hidden control is never security.

The detailed checklist is in `references/security-review-checklist.md`. Use it for pre-release reviews and for any change touching a sensitive operation.

## Ground rules

- Never trust the client: client-side validation, hidden or disabled controls, route guards in the browser, and request fields like role, hub id or user id are not security boundaries.
- Never assume a user may access a record because they know its id. Authorize the specific record on the server for every protected operation.
- Never read, print, log or paste real secrets while inspecting. Read environment variable **names** and where they are used, not values. If a secret is exposed anywhere, name the location and say it must be rotated; do not repeat it.
- Prefer maintained libraries and platform features over custom cryptography or home-made session schemes. Reviewing an existing custom scheme is fine; judge it against the standard it imitates.
- Verify advice against the installed version and official documentation (framework, library, OWASP) when unsure; security APIs change between versions.
- Do not add a control that breaks legitimate workflows without checking its impact on real users and integrations.
- Never claim an application is secure because a checklist passed. Report what was checked, what was not, and the residual risk.
- No destructive changes and no production credential rotation without explicit authorization, a backup and a rollback plan.
- Never run attacks or scans against production or third-party systems. Test locally or in a controlled environment.

## Security workflow

1. **Inspect the implementation.** Read the relevant code and config: framework and version, auth system, session handling, database and its rules, API and server-action entry points, workers and third-party calls, deployment settings. Do not assume a framework, database or auth provider; identify them.
2. **Identify trust boundaries and entry points.** Browser to server, server to database, server to workers and third parties, public routes, webhooks, uploads, background jobs.
3. **Determine assets and permissions.** What is valuable (accounts, personal data, messages, keys, the ability to send to many people, other tenants' data), and which role may do what.
4. **Model realistic attacks.** For each entry point: who can reach it, what they control, what they could gain (read, change, delete, impersonate, escalate, cost, take down). Use STRIDE-style prompts if helpful. Keep scenarios realistic.
5. **Prioritize findings** by severity (impact times exploitability times exposure), with a short reason. Critical: cross-tenant data access, authentication bypass, exposed privileged secrets, remote code execution. Then privilege escalation and stored XSS, then the rest.
6. **Implement focused fixes** in the existing style: server-side checks next to the data access, validation at the boundary, safe defaults. Avoid broad rewrites.
7. **Add regression tests** for each fixed issue (see Testing).
8. **Run the relevant checks** (tests, type check, lint, build, dependency audit where available) and report real results only.
9. **Document unresolved risks and manual actions**: secrets to rotate, settings to change in dashboards, rules to publish, people to inform.

## Threat modeling (before sensitive features)

For a new or changed feature that handles identity, money, personal data, messaging, files, admin actions or cross-tenant data, write down briefly: assets, actors, trust boundaries, entry points, top abuse cases, and the control for each. Revisit it when the feature changes. A few lines is enough.

## Secrets management

- Secrets live in server-side environment variables or a secret manager, never in the repository, client bundles, client-exposed variables (such as `NEXT_PUBLIC_*` or `VITE_*`), logs, error messages, URLs, tests or screenshots.
- Anything shipped to the browser is public, including bundled JavaScript, HTML, source maps and static config files.
- Keep `.env*` out of version control; commit only an example file with names. Check history if a secret may have been committed.
- Use separate secrets per environment, least privilege per key, and a way to rotate. A key that does more than the feature needs is a finding.
- Third-party keys that must be called from the browser should be restricted (origin, quota, scope) or proxied through the server.
- Validate required configuration at the point of use and fail with a message that does not include the value.

## Authentication

- Use the project's established identity provider or a maintained library. Do not invent password hashing, token signing or session storage.
- Passwords: stored only as a salted slow hash (argon2id, bcrypt or scrypt) if the app stores them at all; never logged; minimum length rules; no composition theatre; check against known-breached lists where practical.
- Login: rate limit per account and per source, one generic failure message (no account enumeration), no timing differences that reveal valid accounts where practical.
- Sessions: random or signed and verified server-side, `HttpOnly`, `Secure`, a deliberate `SameSite`, scoped path and domain, limited lifetime, rotated on login and privilege change, invalidated on logout and password change. Not in `localStorage`.
- Tokens: short lived; verify signature, issuer, audience and expiry; refresh handled server-side; never put tokens in URLs.
- Account recovery: single-use, short-lived, unguessable reset tokens; response does not reveal whether the account exists; reset does not sign the user in; notify the account owner; invalidate other sessions.
- Multi-factor authentication for privileged roles where the platform supports it; recovery paths are not weaker than the first factor.
- Account creation and role changes are privileged operations: authorize them server-side and prevent users from raising their own role.

## Authorization

- Enforce on the server, next to the data access, on every protected page, action, route handler, job and webhook. Default deny.
- Check role and the specific resource and tenant: "may this user do this action on this record in this hub?". Scope queries by tenant in the query itself.
- Use one central policy function instead of scattered role comparisons.
- Prevent privilege escalation: no self-promotion, no cross-role edits upward, no self-lockout, no deleting the last administrator.
- Never accept a role, hub id, owner id or permission flag from the client as truth; derive it from the verified session or verify it against the user's access.
- Where the database enforces rules, keep them in step with application checks and treat them as a second lock. Using a privileged service credential bypasses them, so then the application must do every check.
- Return the same response for "not found" and "not yours" where existence itself is sensitive.

## API and input security

- Validate every input on the server with a schema: type, length, range, format, allowed values, unexpected fields rejected. Validate path, query, body, headers, cookies, form data and file metadata.
- Authorize every protected operation, including read-only ones and bulk operations.
- Rate limit login, recovery, signup, messaging, uploads, expensive queries and anything that sends email, SMS or push.
- Return safe errors: a generic message and a status code to the client, details in server logs only. No stack traces, SQL, file paths, tokens or other people's data.
- State-changing operations should not be reachable with `GET`. Make retried requests safe (idempotency).
- Limit request and payload sizes and timeouts.

## Web vulnerabilities

- **Injection (SQL, NoSQL, command, template, LDAP):** parameterized queries or the library's safe API; never build queries or commands by concatenating input; allow-list dynamic identifiers (sort fields, column names); no shell calls with user input. For REST-style databases, build paths from validated segments only (reject `/`, `.`, `#`, `$`, `[`, `]`).
- **XSS:** rely on the framework's escaping; avoid `dangerouslySetInnerHTML` and raw HTML insertion with untrusted content unless sanitized by a maintained sanitizer; validate URL schemes (`http`, `https`, `mailto` only) before using user links or image sources; set a Content Security Policy.
- **CSRF:** `SameSite` cookies plus origin checks or tokens for cookie-authenticated state changes. Framework-provided protections (for example for server actions) have limits; custom route handlers need their own check.
- **SSRF:** when the server fetches a user-supplied URL, allow-list hosts, block private and link-local ranges and redirects, and set timeouts and size limits.
- **Broken access control and IDOR:** see Authorization. Test with another user's and another tenant's ids.
- **Open redirects:** redirect only to relative paths or an allow-list.
- **Mass assignment:** map input fields explicitly; never spread a request body into a record.
- **Deserialization, prototype pollution, path traversal:** do not deserialize untrusted objects into code paths; ignore `__proto__` and `constructor` keys; never use user input to build file paths.
- **Clickjacking:** `frame-ancestors` or `X-Frame-Options`.
- **Security misconfiguration and vulnerable components:** see Dependency and configuration.

## Next.js and similar server frameworks

Check the installed version and its documentation first; conventions change (for example async `cookies()`, `headers()`, `params` and `searchParams`, and the rename of the middleware file to a proxy file in recent versions).
- **Server Actions** are public HTTP endpoints. Authenticate and authorize inside each one, validate every argument, and never trust arguments, even bound ones, as proof of identity or permission.
- **Route Handlers:** same checks; add CSRF and origin checks for cookie-authenticated state changes; do not expose them to the wrong methods.
- **Middleware or proxy:** a first gate for redirects only. Check the session again next to the data; never make it the only protection.
- **Server and client components:** keep secrets and privileged data access in server-only modules (use `server-only`); never pass more data than the client needs through props; remember props to client components end up in the page payload.
- **Cookies:** set `HttpOnly`, `Secure`, `SameSite`, `Path`, and a lifetime deliberately; read them only on the server.
- **Caching:** do not cache per-user or per-tenant data in shared caches; mark authenticated reads as dynamic or uncached; revalidate after writes.
- **Environment variables:** only names with the public prefix reach the browser, and nothing secret may use that prefix.
- Do not log full requests, form data or headers.

## Database security

- Parameterized queries or the ORM's safe API only.
- Application credentials with the least privilege needed (no superuser or owner; separate read and write roles where useful); no admin keys in client code.
- Database-level access rules (row-level security, security rules) enforced and tested, not just written.
- Sensitive fields (passwords, tokens, push subscriptions, personal data) protected: minimal storage, encrypted where required, never returned to clients that do not need them, never logged.
- Migrations reviewed, run through the migration tool, reversible or with a restore point; never hand-edit production.
- Backups encrypted and restore-tested; access to them restricted.

## Files and uploads

- Check size, and check type by content (magic bytes), not only extension or the browser-supplied type. Allow-list types.
- Generate storage names on the server; never trust the original file name or path.
- Store outside the web root or in private object storage; serve with a correct `Content-Type`, `X-Content-Type-Options: nosniff`, and (for non-images) `Content-Disposition: attachment`.
- Re-encode images where practical; strip metadata if it can contain private data; never serve user-uploaded HTML or SVG from your own origin.
- Limit rate and total storage per user; scan for malware if the use case needs it.
- Apply the same authorization to upload, replace and delete as to any other write.

## Headers and transport

- HTTPS everywhere, with HSTS once HTTPS is reliable; redirect HTTP to HTTPS.
- `Content-Security-Policy` (start strict, loosen only where needed, avoid `unsafe-inline` where possible), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and frame protection.
- CORS: allow named origins only; never `*` with credentials.
- Cookie attributes as in Authentication.
- Pick headers based on how the app is deployed (host, CDN, reverse proxy) and verify them on the deployed site.

## Logging and monitoring

- Log security events: sign-in success and failure, password changes and resets, role and permission changes, access denials, deletions, bulk sends, upload rejections, rate-limit hits, configuration changes. Include time, actor, action, target and outcome.
- Never log passwords, tokens, session ids, secrets, full payment or ID numbers, or unnecessary personal data. Redact before logging.
- Protect logs from tampering and limit who can read them. Alert on bursts of failures or unusual admin activity where monitoring exists.

## Dependency and configuration security

- Run the project's dependency audit (`npm audit` or the package manager's equivalent) and report findings with severity and whether the vulnerable code path is used. Keep lockfiles committed. Remove unused packages. Do not add a package without a reason.
- Look for unsafe defaults and exposed interfaces: debug mode, verbose errors, open admin routes, test accounts, public storage buckets, permissive CORS, default credentials, source maps with secrets, exposed `.git` or env files, open database rules.
- Production settings differ from development: confirm `NODE_ENV`, error pages, logging level and secret sources.
- Review third-party scripts loaded by pages and the permissions they get.

## Testing

Add practical security tests for what you changed or reviewed (structure and tooling: `qa-testing-engineer`):
- Authentication: unauthenticated, expired and tampered sessions are refused; logout ends access; login limits and generic errors.
- Authorization: each role allowed and denied; no self-promotion; checks hold when the UI hides the control.
- Tenant isolation: user of tenant A cannot read, create, update or delete tenant B's records by guessing ids or sending another tenant id; failures look like "not found".
- Input validation: oversized, malformed, wrong-type and unexpected fields rejected; markup and special characters stored and shown safely.
- Common vulnerabilities: injection strings in every input that reaches a query, XSS payloads in stored fields, unsafe URL schemes, open redirect attempts, CSRF without origin.
- Uploads: wrong type renamed to an allowed extension, oversized file, hostile file name.
- Regression: one test per fixed vulnerability that fails on the old code.
Report which tests were actually run and their real results. Do not claim a security test passed unless it executed successfully.

## Incident response

- **Exposed credential** (committed, pasted, logged, in a client bundle): treat as compromised. With authorization: revoke or rotate at the provider, deploy the new value, check provider logs for misuse, remove it from the repository and, if needed, history, and find how it leaked. Do not repeat the value in reports.
- **Suspected unauthorized access:** preserve logs, limit further access (disable the account or key, end sessions), determine what was reachable and accessed, check for persistence (new users, roles, keys), fix the cause, then restore access and notify the people and parties who must be told. Follow legal and contractual notification duties; say when the person should involve their security or legal contact.
- **Confirmed vulnerability:** assess whether it was exploited, fix and test it, deploy, rotate anything exposed, add a regression test, and write down the cause and the prevention.
- Do not take destructive or production-affecting actions without explicit authorization, and keep changes reversible.

## Final report

- Scope reviewed and what was not.
- Findings, highest severity first: where, how it could be exploited, impact, fix, status.
- Changes made (paths) and tests added.
- Commands run with real results; anything not run, and why.
- Unresolved risks and manual actions (secrets to rotate, settings to change, rules to publish).
- A clear statement that passing checks do not prove the application is secure.
