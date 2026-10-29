/**
 * REAL Firebase Realtime Database emulator run of scripts/staging/rules.protected-paths.cases.mjs.
 * STATUS: NOT RUN in the environment this was written in (emulator download blocked). Run on a machine with Java 11+:
 *   RULES=strict npx firebase emulators:exec --only database --project demo-iconnecthub "node --test scripts/staging/rules.protected-paths.emulator.test.mjs"
 *   RULES=compat ... (same, compat file)
 * "demo-" project ids never reach a real Firebase project. Never point this at a live database.
 */
import { test, before, after } from 'node:test'
import fs from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { cases, seed } from './rules.protected-paths.cases.mjs'

const which = process.env.RULES === 'compat' ? 'database.rules.proposed-compat.json' : 'database.rules.proposed.json'
const rules = process.env.RULES_FILE ? fs.readFileSync(process.env.RULES_FILE, 'utf8') : fs.readFileSync(new URL(`../../security/review/${which}`, import.meta.url), 'utf8')
const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':')
if (!/^(127\.0\.0\.1|localhost)$/.test(host)) throw new Error('Refusing to run: the database host is not local')

let env
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-iconnecthub', database: { host, port: Number(port), rules } })
})
after(async () => { await env?.cleanup() })

for (const [name, who, op, p, value, want] of cases) {
  test(`${want ? 'allowed' : 'refused'}: ${name}`, async () => {
    await env.clearDatabase()
    await env.withSecurityRulesDisabled(async (ctx) => { await ctx.database().ref('/').set(seed) })
    const email = who ? seed.users[who]?.email : undefined
    const ctx = who ? env.authenticatedContext(who, email ? { email } : {}) : env.unauthenticatedContext()
    const run = (async () => { // an invalid path throws on the client before reaching the rules: also a refusal
      const ref = ctx.database().ref(p)
      return op === 'read' ? ref.get() : op === 'set' ? ref.set(value) : ref.update(value)
    })()
    if (want) return assertSucceeds(run)
    // An invalid path (for example "j.new") is rejected by the client SDK before it reaches the database.
    // That is a real refusal, but NOT proved by the rules, so it is reported as such.
    try { await assertFails(run) } catch (e) {
      if (/invalid path/i.test(String(e?.message ?? e))) { console.log(`NOTE client-side refusal, rules not exercised: ${name}`); return }
      throw e
    }
  })
}
