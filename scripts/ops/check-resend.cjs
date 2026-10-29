// Sends ONE email to YOUR address with a Resend key, to prove the key works. Run: node scripts/ops/check-resend.cjs
const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((r) => rl.question(q, r))
;(async () => {
  const key = (await ask('Resend API key (stays on this computer): ')).trim()
  const from = (await ask('From address (a verified sender): ')).trim()
  const to = (await ask('YOUR OWN email address: ')).trim()
  rl.close()
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, subject: 'Key check', text: 'Resend key works.' }) })
  console.log('\nResend answered', res.status, res.status === 200 ? '(sent: check your inbox)' : String(await res.text()).slice(0, 200))
  console.log('Now clear the screen: cls')
})()
