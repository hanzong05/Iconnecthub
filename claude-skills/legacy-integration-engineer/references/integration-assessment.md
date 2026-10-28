# Integration assessment

Fill these in from evidence. Mark each line **V** (verified, with the file, setting or output), **I** (inferred) or **?** (unknown). Never write secret values; write where a secret lives and whether it is exposed.

## 1. Architecture inventory

### 1.1 Systems
| System | Type (app, CMS, GHL account, worker, job, database, third party) | Owner | Hosting and URL | Version | Source or config location | Status (V/I/?) |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

### 1.2 Data flows
For each important piece of data (guest record, announcement, event, order, lead, message, count):
- **Name and meaning:**
- **Originates at:** (form, import, API, admin entry, device)
- **Transformed by:** (script, workflow, worker, query, spreadsheet) and what changes
- **Stored in:** (database path or table, CMS field, GHL custom field, file, cache)
- **Who can change it:** (roles, systems)
- **Displayed in:** (screens, emails, reports, embeds)
- **Other readers:** (apps, workers, integrations, exports)
- **Duplicates of the same rule or value elsewhere:**
- **Source of truth (record, counter or aggregation):**

### 1.3 Authentication and authorization
- Identity provider and how sign-in works; session or token type and lifetime.
- Roles, and where each role is defined and enforced (server, database rules, page script only).
- Which checks are enforced where the user cannot edit them, and which only in the browser.
- Service accounts and API keys: what each can access, where it is stored, who can see it.

### 1.4 Integrations and entry points
| Integration or endpoint | Direction (in/out) | Called by / calls | Auth method | Data sent or received | Rate or plan limits (from vendor docs) | Failure behaviour |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

### 1.5 Deployment and operations
- How code or content gets live (manual upload, Git, CI, CMS admin, platform editor); who can do it.
- Environments (production, staging, local) and how they differ.
- Scheduled jobs and timers, and what runs them (a server, a worker, an open browser tab).
- Backups: what, how often, where, last restore test.
- Monitoring and logs: what exists, who reads them.
- Domains, DNS, certificates, and who controls them.

## 2. Dependency checklist
- [ ] Runtime and framework versions, and their support status.
- [ ] CMS core, theme and plugin versions; which are customised; update path and what breaks on update.
- [ ] Third-party scripts, SDKs and libraries loaded by pages; pinned or floating versions.
- [ ] Vendor APIs: version, deprecation notices, rate limits, plan limits, scopes used.
- [ ] Webhooks in and out: URLs, secrets or signatures, retry behaviour, who owns them.
- [ ] Email, SMS, push, payment and image-hosting providers: accounts, keys, quotas.
- [ ] Environment variables and secrets: names, where stored, which are exposed to the browser, rotation date.
- [ ] Hard-coded URLs, ids, hub or site names, and keys in code or content.
- [ ] Data stores and their access rules (security rules, row-level policies, roles).
- [ ] People and processes that depend on the current behaviour (staff using the admin, guests using the app, partners calling the API).
- [ ] External consumers of any URL, field or file format (other sites, mobile apps, spreadsheets, automations).
- [ ] Licenses and terms that restrict what may be changed or moved.

## 3. Migration-readiness checklist
- [ ] Current behaviour documented (inputs, outputs, side effects, roles, edge cases).
- [ ] Characterization checks exist for the critical workflows and pass on the current system.
- [ ] Data flows mapped; sources of truth identified; duplicated rules listed.
- [ ] External consumers identified and, where possible, told or tested.
- [ ] Security exposures classified as platform limit or implementation mistake, with a fix for each.
- [ ] Sensitive operations identified and a trusted-side home chosen for each.
- [ ] Compatibility layer designed (same URLs, same request and response shapes, same field names).
- [ ] Versioning and retirement plan for anything that will change.
- [ ] Staging or sandbox environment available and representative.
- [ ] Backup taken and a restore tested for any data that will move.
- [ ] Rollout plan staged (one site, hub or group first) with a fast switch back.
- [ ] Monitoring in place to see failures within minutes (errors, failed webhooks, bounced mail, counts that drop to zero).
- [ ] Owners and approvers named; maintenance window agreed where needed.
- [ ] Authorization for each production-affecting step recorded.
- [ ] Secrets exposed anywhere have been listed for rotation, and rotation order planned so nothing breaks.

## 4. Option comparison
| Option | Solves | Cost | Risk | Reversible? | Effect on external consumers | Learn first |
| --- | --- | --- | --- | --- | --- | --- |
| Leave as is | | | | | | |
| Harden in place | | | | | | |
| Adapter or wrapper | | | | | | |
| Move one capability to a trusted backend | | | | | | |
| Rebuild one part | | | | | | |
| Rebuild everything | | | | | | |

Recommendation and reason (in terms of risk, cost or a requirement the current system cannot meet):

## 5. Rollback planning template
Complete one per step before running it.

- **Step:** what changes, where (system, path, setting), and who authorized it.
- **Preconditions:** backup taken (when, where, verified restorable), staging result, compatibility layer in place, monitoring ready.
- **Success check:** the specific behaviours and numbers that show it worked (and the time window to watch).
- **Trigger for rollback:** the exact signs that mean stop (failed workflows, error rate, missing records, wrong counts, complaints).
- **Rollback method:** flag or route switched back, previous version redeployed, content restored, data restored from backup, or a forward fix; the exact commands or clicks, in order.
- **Time to roll back:** estimate, and who can do it at any hour.
- **Data effects:** what happens to records created or changed after the step if you roll back (kept, migrated back, or lost), and how to reconcile them.
- **External effects:** emails, webhooks, notifications already sent that cannot be recalled; who must be told.
- **Point of no return:** any step that cannot be undone (deleting the old data, retiring the old endpoint, rotating a key) and the separate approval it needs.
- **Verification after rollback:** how to confirm the old behaviour is fully back.
