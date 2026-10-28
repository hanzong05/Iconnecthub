# Security review checklist

Use before a release and for any change touching a sensitive operation (sign-in, roles, secrets, uploads, deleting, sending to many people, cross-tenant data). Tick only what you actually checked and note evidence (file, test, output). Write "not checked" for the rest. A completed checklist does not prove the application is secure.

Never put real secret values in notes. Record where a secret lives and whether it is exposed.

## 1. Scope and threat model
- [ ] Assets, actors, trust boundaries and entry points listed (pages, actions, route handlers, webhooks, jobs, uploads, third-party calls).
- [ ] Top abuse cases written down with the control for each.
- [ ] Framework and library versions identified; docs checked for version-specific security behaviour.

## 2. Secrets and configuration
- [ ] No secrets in the repository or its history (search for key names and patterns, not by printing values).
- [ ] `.env*` files ignored by version control; only an example file with names is committed.
- [ ] No secret in client-exposed variables (`NEXT_PUBLIC_*`, `VITE_*`) or in files served to the browser (including source maps).
- [ ] Separate secrets per environment; least privilege per key; rotation possible.
- [ ] Required config validated at use; errors do not include values.
- [ ] Exposed secrets found anywhere are listed for rotation (with location, not value).
- [ ] No debug mode, verbose errors, test accounts, default credentials or open admin routes in production settings.

## 3. Authentication and sessions
- [ ] Established provider or maintained library; no home-made crypto.
- [ ] Passwords hashed with argon2id, bcrypt or scrypt if stored; never logged.
- [ ] Login rate limited per account and source; one generic failure message.
- [ ] Session cookie: `HttpOnly`, `Secure`, deliberate `SameSite`, scoped, limited lifetime.
- [ ] Session rotated on login and privilege change; invalidated on logout and password change.
- [ ] Tokens verified (signature, issuer, audience, expiry); not in URLs or `localStorage`.
- [ ] Password reset: single-use, short-lived, unguessable token; no account enumeration; other sessions ended; owner notified.
- [ ] MFA available or required for privileged roles where supported.
- [ ] Protected pages, actions and routes refuse missing, expired and tampered sessions.

## 4. Authorization and tenant isolation
- [ ] Every protected page, action, route handler, job and webhook authorizes on the server, next to the data access.
- [ ] Authorization checks role, tenant (hub) and the specific record.
- [ ] Tenant scope is part of the query or path, not applied after fetching.
- [ ] Role, hub id, owner id and permission flags are derived from the session or verified, never trusted from the request.
- [ ] Record ids from the client are looked up inside the authorized tenant.
- [ ] No self-promotion, no upward edits, no self-lockout, last administrator protected.
- [ ] Shared or global records have an explicit role-restricted rule.
- [ ] Database rules (if used) match the application checks and are tested with another tenant's user.
- [ ] "Not found" and "not yours" are indistinguishable where existence is sensitive.
- [ ] Hidden or disabled UI controls are not the only protection for any action.

## 5. API and input handling
- [ ] Server-side schema validation on body, query, path, headers, cookies and form data; unknown fields rejected.
- [ ] Length, range and size limits on strings, arrays, numbers and payloads.
- [ ] Dynamic identifiers (sort fields, column names, path segments) come from allow-lists or validated patterns.
- [ ] Fields mapped explicitly (no mass assignment).
- [ ] Rate limits on login, recovery, signup, messaging, uploads, expensive queries and anything that sends email, SMS or push.
- [ ] Errors are generic to clients; details only in server logs.
- [ ] State changes are not reachable by `GET`; retried requests are safe.
- [ ] Redirect targets restricted to relative paths or an allow-list.

## 6. Injection, XSS, CSRF, SSRF
- [ ] Parameterized queries or safe APIs; no string-built queries or shell commands.
- [ ] Database paths and keys built from validated segments (no `/ . # $ [ ]`).
- [ ] No `dangerouslySetInnerHTML` or raw HTML with untrusted content unless sanitized by a maintained sanitizer.
- [ ] User-supplied URLs limited to allowed schemes before use as links or image sources.
- [ ] CSRF protection (SameSite plus origin check or token) on cookie-authenticated state changes, including custom route handlers.
- [ ] Server-side fetches of user-supplied URLs use an allow-list, block private ranges and redirects, with timeouts and size limits.
- [ ] No path built from user input to read or write files; no unsafe deserialization; `__proto__` keys ignored.

## 7. Next.js and server boundaries (when applicable)
- [ ] Server Actions authenticate, authorize and validate every argument.
- [ ] Route Handlers authorize and check origin for cookie-authenticated writes.
- [ ] Middleware or proxy is not the only gate; the session is checked again near the data.
- [ ] Secrets and privileged data access sit in server-only modules.
- [ ] Props passed to client components contain only data the client may see.
- [ ] Cookies set only on the server with the right attributes.
- [ ] Authenticated or per-tenant reads are not served from shared caches; revalidation after writes.
- [ ] Only public values use the public environment prefix.

## 8. Database
- [ ] Application credentials have the least privilege needed; no admin or owner credentials in the app where a scoped one works.
- [ ] Database access rules (row-level security or security rules) are enforced and tested.
- [ ] Sensitive fields minimized, protected, not returned unnecessarily, not logged.
- [ ] Migrations reviewed and reversible or with a restore point.
- [ ] Backups encrypted, access restricted, restore tested.

## 9. Files and uploads
- [ ] Type checked by content (magic bytes) with an allow-list; size limited.
- [ ] Server-generated storage names; original names and paths never trusted.
- [ ] Stored privately or outside the web root; served with correct `Content-Type`, `nosniff`, and attachment disposition where needed.
- [ ] User-uploaded HTML and SVG are not served from the app's own origin.
- [ ] Upload, replace and delete are authorized like any other write; rate and storage limits exist.

## 10. Headers and transport
- [ ] HTTPS enforced; HSTS where HTTPS is reliable.
- [ ] CSP set (strict as practical), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protection.
- [ ] CORS limited to named origins; never `*` with credentials.
- [ ] Headers verified on the deployed site, not only in config.

## 11. Logging and monitoring
- [ ] Security events logged (sign-in, resets, role changes, denials, deletions, bulk sends, upload rejections, rate-limit hits).
- [ ] No passwords, tokens, session ids, secrets or unnecessary personal data in logs.
- [ ] Logs access-restricted; alerts for failure bursts or unusual admin activity where monitoring exists.

## 12. Dependencies and third parties
- [ ] Dependency audit run; findings listed with severity and whether the path is used.
- [ ] Lockfile committed; unused packages removed; new packages justified.
- [ ] Third-party scripts and SDKs reviewed; keys restricted or proxied.
- [ ] Webhooks verify signatures; outbound calls have timeouts and bounded retries.

## 13. Security tests
- [ ] Unauthenticated, expired and tampered sessions refused.
- [ ] Each role allowed and denied as expected; no self-promotion.
- [ ] Cross-tenant read, create, update and delete fail (guessed ids and foreign tenant ids).
- [ ] Invalid, oversized and unexpected input rejected.
- [ ] Injection, XSS, unsafe URL scheme, open redirect and CSRF cases covered where relevant.
- [ ] Upload abuse cases covered where relevant.
- [ ] A regression test exists for each fixed vulnerability.
- [ ] Tests actually run; real results recorded.

## 14. Incident readiness
- [ ] Who can rotate each secret, and how, is known.
- [ ] Steps to disable an account, key or session exist.
- [ ] Logs needed to investigate are kept long enough.
- [ ] Notification duties and contacts known.

## 15. Report
- [ ] Findings listed by severity with where, exploit path, impact, fix and status.
- [ ] Unresolved risks and manual actions listed (rotations, dashboard settings, rules to publish).
- [ ] What was not reviewed stated.
- [ ] Commands and tests run with real results; none claimed that did not run.
