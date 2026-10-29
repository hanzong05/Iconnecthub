// Checks that a VAPID private key matches the public key the live worker serves. Sends nothing. Run: node scripts/ops/check-vapid.cjs
const crypto = require('crypto'), rl = require('readline').createInterface({ input: process.stdin, output: process.stdout })
const URL_ = process.env.WORKER_URL || 'https://bluespot-push.bluespotadvertising.workers.dev'
rl.question('Paste the VAPID PRIVATE key (stays on this computer): ', async (a) => {
  rl.close()
  try {
    const e = crypto.createECDH('prime256v1'); e.setPrivateKey(Buffer.from(a.trim(), 'base64url'))
    const derived = e.getPublicKey().toString('base64url')
    const live = (await (await fetch(`${URL_}/vapid-public-key`)).json()).publicKey
    console.log(derived === live ? '\nMATCH: the private key belongs to the public key the worker serves.' : '\nDIFFERENT: this private key does NOT match the public key the worker serves.')
  } catch (err) { console.log('\nCould not check:', err.message) }
  console.log('Now clear the screen: cls')
})
