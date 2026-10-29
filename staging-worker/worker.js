// ─────────────────────────────────────────────────────────────────────────
// BlueSpot Hub — Push / Email / SMS Notification Worker
// ─────────────────────────────────────────────────────────────────────────
// Handles notifications for hub announcements and events:
//   POST /                  → FCM push notifications
//   POST /send-sms          → Twilio SMS to active hub guests
//   POST /send-email        → Resend (legacy, basic HTML + carrier SMS)
//   POST /send-email-resend → Resend (rich HTML emails + carrier SMS, active guests only)
//
// ENVIRONMENT VARIABLES (Cloudflare Worker → Settings → Variables → Encrypt):
//   FIREBASE_PROJECT_ID   = bluespot-hub
//   FIREBASE_CLIENT_EMAIL = <service account email>
//   FIREBASE_PRIVATE_KEY  = <service account private key>
//   DATABASE_URL          = https://bluespot-hub-default-rtdb.firebaseio.com
//   ALLOWED_ORIGIN        = * (or your domain)
//   RESEND_API_KEY        = re_xxxxxxxx               ← resend.com → API Keys
//   RESEND_FROM_EMAIL     = noreply@mail.yourdomain.com ← verified sender
//   RESEND_SENDER_NAME    = BlueSpot Hub              ← display name in inbox
//   SENDBLUE_API_KEY      = <your api key>            ← sendblue.co API key
//   SENDBLUE_API_SECRET   = <your api secret>         ← sendblue.co API secret
//   TWILIO_ACCOUNT_SID    = ACxxxxxxxxxxxxxxxx        ← Twilio (optional)
//   TWILIO_AUTH_TOKEN     = xxxxxxxxxxxxxxxx          ← Twilio (optional)
//   TWILIO_FROM_NUMBER    = +1xxxxxxxxxx              ← Twilio (optional)
// ─────────────────────────────────────────────────────────────────────────

// REVIEW COPY (F-17, F-06/F-08 groundwork). NOT DEPLOYED. Differences from the original:
//   - Every send route checks the caller's role and hub (super: any hub; manager / super_manager: own hub only),
//     refuses deactivated callers, and honours the per-hub "guest notifications" switch.
//   - /send-welcome only mails an account that already exists, and only a super admin / super manager may call it.
//   - Adds the routes the admin app already calls: GET /vapid-public-key, POST /save-manager-subscription,
//     POST /chat-guest-push, and POST /send-test.
//   - Unexpected errors are logged, not echoed to the caller.
// Variables used in addition to the ones above: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (web push), OWNER_UID (optional).

export default {
  // Cron Trigger (see wrangler cron "* * * * *"): the schedule runs here, with no browser open.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduler(env, event && event.scheduledTime ? event.scheduledTime : Date.now()).then((r) => console.log('scheduler', JSON.stringify(r))));
  },

  async fetch(request, env) {
    const corsHeaders = corsFor(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);

    // Fail closed: a worker that is missing the settings it checks permissions with must not send anything.
    if (url.pathname !== '/vapid-public-key' && (!env.FIREBASE_PROJECT_ID || !env.DATABASE_URL || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY)) {
      console.error('push worker is missing required configuration');
      return json({ error: 'The notification service is not configured.' }, 503, corsHeaders);
    }

    // The public half of the web-push key is safe to hand out; the app reads it with GET.
    if (url.pathname === '/vapid-public-key') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, corsHeaders);
      if (!env.VAPID_PUBLIC_KEY) return json({ error: 'Push is not configured on the server.' }, 503, corsHeaders);
      return json({ publicKey: env.VAPID_PUBLIC_KEY }, 200, corsHeaders);
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders);

    try {
      if (url.pathname === '/save-manager-subscription') {
        return await handleSaveManagerSubscription(request, env, corsHeaders);
      }
      if (url.pathname === '/chat-guest-push') {
        return await handleChatGuestPush(request, env, corsHeaders);
      }
      if (url.pathname === '/send-test') {
        return await handleTestSend(request, env, corsHeaders);
      }
      if (url.pathname === '/send-sms') {
        return await handleSms(request, env, corsHeaders);
      }
      if (url.pathname === '/send-sms-sendblue') {
        return await handleSendBlueSms(request, env, corsHeaders);
      }
      if (url.pathname === '/send-email') {
        return await handleEmail(request, env, corsHeaders);
      }
      if (url.pathname === '/send-email-resend') {
        return await handleResendEmail(request, env, corsHeaders);
      }
      if (url.pathname === '/send-welcome') {
        return await handleWelcomeEmail(request, env, corsHeaders);
      }
      // Default: FCM push
      return await handlePush(request, env, corsHeaders);
    } catch (err) {
      if (err instanceof SyntaxError) return json({ error: 'The request could not be read.' }, 400, corsHeaders);
      // Only the message is logged, never the request body (it carries the caller's sign-in token and the notification text).
      console.error('push worker error:', err && err.message ? err.message : String(err));
      return json({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }
  },
};

// ── FCM Push (existing behaviour) ─────────────────────────────────────────

async function handlePush(request, env, corsHeaders) {
  const { hubId, title, body, idToken } = await request.json();
  if (!hubId || !title || !idToken) return json({ error: 'Missing fields' }, 400, corsHeaders);

  const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!callerUid) return json({ error: 'Unauthorized' }, 401, corsHeaders);
  {
    const denied = await checkSendAllowed(env, callerUid, hubId, corsHeaders);
    if (denied) return denied;
  }
  return json(await sendPushCore(env, hubId, title, body), 200, corsHeaders);
}

// The sending itself, shared by the signed-in route above and the scheduler. Callers must already have been authorized.
async function sendPushCore(env, hubId, title, body) {
  const accessToken = await getServiceAccountAccessToken(env);
  const today = new Date().toISOString().split('T')[0];

  // ── Active guests: departure not yet passed (or no departure date on file) ──
  const allGuests = await loadGuests(env.DATABASE_URL, hubId, accessToken);
  const activeGuests = allGuests.filter(g => {
    const dep = g.departureDate || g.stayDetails?.departureDate;
    return !dep || dep >= today;
  });

  // ── FCM tokens from active guest records ─────────────────────────────────
  const guestTokens = activeGuests.map(g => g.fcmToken?.token).filter(Boolean);
  const guestTokenSet = new Set(guestTokens);

  // Also include tokens in the raw bucket that aren't linked to any guest
  // (users who enabled push without completing a guest profile)
  const hubTokensData = await dbGet(env.DATABASE_URL, `hubs/${hubId}/fcmTokens`, accessToken) || {};
  const unlinkedTokens = Object.values(hubTokensData)
    .map(t => t.token)
    .filter(t => t && !guestTokenSet.has(t));

  const tokens = [...guestTokens, ...unlinkedTokens];

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`;
  let sent = 0, webSent = 0;
  const staleTokens = [];

  for (const token of tokens) {
    const res = await fetch(fcmUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          webpush: {
            headers: { Urgency: 'high', TTL: '86400' },
            notification: {
              title, body,
              icon: 'https://assets.cdn.filesafe.space/Sk7XUXxjVtIrJHKp3GhX/media/6a2ff4421b95dbb2c2e8e5c1.png',
              badge: 'https://assets.cdn.filesafe.space/Sk7XUXxjVtIrJHKp3GhX/media/6a2ff4421b95dbb2c2e8e5c1.png',
              vibrate: [200, 100, 200],
              requireInteraction: false,
            },
            fcm_options: { link: '/' },
          },
        },
      }),
    });
    if (res.ok) {
      sent++;
    } else {
      const err = await res.json().catch(() => ({}));
      if (err?.error?.details?.some(d => d.errorCode === 'UNREGISTERED')) staleTokens.push(token);
    }
  }

  for (const token of staleTokens) {
    const key = token.replace(/\./g, '_');
    await dbDelete(env.DATABASE_URL, `hubs/${hubId}/fcmTokens/${key}`, accessToken).catch(() => {});
    await dbDelete(env.DATABASE_URL, `hubs/_global/fcmTokens/${key}`, accessToken).catch(() => {});
  }

  // ── Web Push subscriptions (iOS 16.4+) — active guests only ────────────
  const webErrors = [];
  if (env.VAPID_PRIVATE_KEY && env.VAPID_PUBLIC_KEY) {
    // Collect subs stored on active guest records
    const guestSubs = activeGuests
      .map(g => g.webPushSub)
      .filter(s => s && s.endpoint && s.p256dh && s.auth);
    const guestEndpoints = new Set(guestSubs.map(s => s.endpoint));

    // Also include subs in the raw bucket not linked to any guest
    const rawSubs = await dbGet(env.DATABASE_URL, `hubs/${hubId}/webPushSubs`, accessToken) || {};
    const unlinkedSubs = Object.values(rawSubs)
      .filter(s => s && s.endpoint && s.p256dh && s.auth && !guestEndpoints.has(s.endpoint));

    const subs = [...guestSubs, ...unlinkedSubs];
    for (const sub of subs) {
      try {
        await sendWebPush(sub, { title, body }, env);
        webSent++;
      } catch (e) {
        webErrors.push(e.message);
      }
    }
  } else {
    webErrors.push('VAPID_PRIVATE_KEY or VAPID_PUBLIC_KEY not set in env');
  }

  return { sent, webSent, total: tokens.length, staleRemoved: staleTokens.length, webErrors };
}

// ── Native Web Push — RFC 8291 (aes128gcm) for iOS 16.4+ ─────────────────
async function sendWebPush(sub, payload, env) {
  const enc = s => new TextEncoder().encode(s);

  // ── VAPID JWT ────────────────────────────────────────────────────────────
  const audience = new URL(sub.endpoint).origin;
  const expiry   = Math.floor(Date.now() / 1000) + 12 * 3600;
  const jwtHeader = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const jwtClaims = base64UrlEncode(JSON.stringify({ aud: audience, exp: expiry, sub: 'mailto:admin@bluespotguide.com' }));
  const unsigned  = `${jwtHeader}.${jwtClaims}`;

  // Import VAPID private key: raw 32-byte EC key → wrap in PKCS8 DER
  const rawPriv = base64urlToBytes(env.VAPID_PRIVATE_KEY);
  const pkcs8   = wrapP256InPkcs8(rawPriv);
  const privKey = await crypto.subtle.importKey(
    'pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sigBytes = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privKey, enc(unsigned)
  ));
  const jwt = `${unsigned}.${bytesToBase64Url(sigBytes)}`;

  // ── RFC 8291 payload encryption (aes128gcm) ──────────────────────────────
  const plaintext        = enc(JSON.stringify({ title: payload.title, body: payload.body }));
  const subscriberPub    = base64urlToBytes(sub.p256dh);
  const authSecret       = base64urlToBytes(sub.auth);
  const salt             = crypto.getRandomValues(new Uint8Array(16));

  // Ephemeral ECDH key pair
  const ephKP      = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ephPubRaw  = new Uint8Array(await crypto.subtle.exportKey('raw', ephKP.publicKey));
  const subPubKey  = await crypto.subtle.importKey('raw', subscriberPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: subPubKey }, ephKP.privateKey, 256));

  // PRK = HKDF-Extract(auth_secret, ecdh_secret)
  const prk = await hkdfExtract(authSecret, ecdhSecret);

  // IKM = HKDF-Expand(PRK, "WebPush: info\x00" || sub_pub || eph_pub, 32)
  const keyInfo = wpConcat(enc('WebPush: info\x00'), subscriberPub, ephPubRaw);
  const ikm     = await hkdfExpand(prk, wpConcat(keyInfo, new Uint8Array([1])), 32);

  // PRK2 = HKDF-Extract(salt, ikm)
  const prk2  = await hkdfExtract(salt, ikm);
  const cek   = await hkdfExpand(prk2, enc('Content-Encoding: aes128gcm\x00\x01'), 16);
  const nonce = await hkdfExpand(prk2, enc('Content-Encoding: nonce\x00\x01'), 12);

  // AES-GCM encrypt: plaintext + \x02 delimiter (no padding)
  const toEncrypt = wpConcat(plaintext, new Uint8Array([0x02]));
  const aesKey    = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, toEncrypt));

  // RFC 8291 content header: salt(16) + rs(4 BE) + keyid_len(1) + eph_pub(65) + ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const body = wpConcat(salt, rs, new Uint8Array([65]), ephPubRaw, ciphertext);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`WebPush ${res.status}: ${txt}`);
  }
}

// Wrap raw 32-byte P-256 private key in PKCS8 DER structure
function wrapP256InPkcs8(rawKey) {
  const prefix = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07,
    0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08,
    0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04,
    0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const out = new Uint8Array(prefix.length + rawKey.length);
  out.set(prefix); out.set(rawKey, prefix.length);
  return out;
}

function base64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  return base64ToBytes(b64 + pad);
}

async function hkdfExtract(salt, ikm) {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm));
}

async function hkdfExpand(prk, info, length) {
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, info)).slice(0, length);
}

function wpConcat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function concat(...arrays) {
  return wpConcat(...arrays);
}

// ── Carrier email-to-SMS gateways (100% free) ─────────────────────────────

const CARRIER_GATEWAYS = {
  // ── USA ──
  att:        'txt.att.net',
  verizon:    'vtext.com',
  tmobile:    'tmomail.net',
  sprint:     'messaging.sprintpcs.com',
  boost:      'sms.myboostmobile.com',
  cricket:    'sms.cricketwireless.net',
  metro:      'mymetropcs.com',
  uscellular: 'email.uscc.net',

  // ── CANADA ──
  bell:       'txt.bell.ca',
  rogers:     'pcs.rogers.com',
  telus:      'msg.telus.com',

  // ── UK ──
  o2:         'mms.o2.co.uk',
  vodafone:   'vodafone.net.uk',
  ee:         'orange.net',
  three:      'x.co.uk',

  // ── EUROPE ──
  dt:         't-mobile.de',
  orange:     'orange.fr',
  swisscom:   'bluewin.ch',
  tim:        'tim.it',
  movistar:   'movistar.es',
  proximus:   'sms.proximus.be',

  // ── AUSTRALIA ──
  telstra:    'telstra.com.au',
  vodafone_au: 'voicemail.vodafone.com.au',
  optus:      'optus.com.au',

  // ── INDIA ──
  airtel:     'airtelxstream.in',
  jio:        'jio.com',
  vodafone_in: 'vodafone.in',
  bsnl:       'bsnlmobil.com',

  // ── PHILIPPINES ──
  globe:      'globetxt.com.ph',
  smart:      'smtpgateway.smart.com.ph',
};

// ── SMS via Twilio ─────────────────────────────────────────────────────────

async function handleSms(request, env, corsHeaders) {
  const { hubId, title, body, idToken } = await request.json();
  if (!hubId || !title || !idToken) return json({ error: 'Missing fields' }, 400, corsHeaders);
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER)
    return json({ error: 'Twilio env vars not configured' }, 500, corsHeaders);

  const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!callerUid) return json({ error: 'Unauthorized' }, 401, corsHeaders);
  {
    const denied = await checkSendAllowed(env, callerUid, hubId, corsHeaders);
    if (denied) return denied;
  }

  const accessToken = await getServiceAccountAccessToken(env);
  const guests      = await loadGuests(env.DATABASE_URL, hubId, accessToken);

  const smsText = `${title}\n\n${body}`;
  let sent = 0, failed = 0;

  for (const g of guests) {
    if (!g.phone) continue;
    const phone = normalizePhone(g.phone);
    if (!phone) continue;

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: env.TWILIO_FROM_NUMBER, To: phone, Body: smsText }),
      }
    );
    res.ok ? sent++ : failed++;
  }

  return json({ sent, failed, total: guests.length }, 200, corsHeaders);
}

// ── SMS via SendBlue ───────────────────────────────────────────────────────

async function handleSendBlueSms(request, env, corsHeaders) {
  const { hubId, title, body, idToken } = await request.json();
  if (!hubId || !title || !idToken) return json({ error: 'Missing fields' }, 400, corsHeaders);
  if (!env.SENDBLUE_API_KEY || !env.SENDBLUE_API_SECRET)
    return json({ error: 'SendBlue env vars not configured' }, 500, corsHeaders);

  const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!callerUid) return json({ error: 'Unauthorized' }, 401, corsHeaders);
  {
    const denied = await checkSendAllowed(env, callerUid, hubId, corsHeaders);
    if (denied) return denied;
  }

  const accessToken = await getServiceAccountAccessToken(env);
  const guests      = await loadGuests(env.DATABASE_URL, hubId, accessToken);

  const smsText = `Announcement from ${name}:\n${title}\n\nView details: hub.bluespotguide.com`.slice(0, 160);
  let sent = 0, failed = 0, errors = [];

  for (const g of guests) {
    if (!g.phone) continue;
    const phone = normalizePhone(g.phone);
    if (!phone) continue;

    try {
      const res = await fetch('https://api.sendblue.co/api/send-message', {
        method: 'POST',
        headers: {
          'sb-api-key-id': env.SENDBLUE_API_KEY,
          'sb-api-secret-key': env.SENDBLUE_API_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_number: env.SENDBLUE_FROM_NUMBER,
          number: phone,
          content: smsText,
        }),
      });

      if (res.ok) {
        sent++;
      } else {
        failed++;
        const errData = await res.json().catch(() => ({}));
        errors.push(`${phone}: ${errData.message || res.statusText}`);
      }
    } catch (e) {
      failed++;
      errors.push(`${phone}: ${e.message}`);
    }
  }

  return json({
    sent,
    failed,
    total: guests.length,
    errors: errors.slice(0, 5), // include first 5 errors for debugging
  }, 200, corsHeaders);
}

// ── Email via Resend ───────────────────────────────────────────────────────

async function handleEmail(request, env, corsHeaders) {
  const { hubId, title: rawTitle, body: rawBody, hubName, idToken } = await request.json();
  if (!hubId || !rawTitle || !idToken) return json({ error: 'Missing fields' }, 400, corsHeaders);
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL)
    return json({ error: 'Resend env vars not configured' }, 500, corsHeaders);

  const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!callerUid) return json({ error: 'Unauthorized' }, 401, corsHeaders);
  {
    const denied = await checkSendAllowed(env, callerUid, hubId, corsHeaders);
    if (denied) return denied;
  }

  const accessToken = await getServiceAccountAccessToken(env);
  const guests      = await loadGuests(env.DATABASE_URL, hubId, accessToken);

  const name = escapeHtml(hubName || hubId);
  const title = escapeHtml(rawTitle);
  const body  = escapeHtml(rawBody);
  let sent = 0, smsSent = 0, failed = 0;

  for (const g of guests) {
    // ── Email ──
    if (g.email) {
      const html = `
        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;color:#0f172a;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;">
            <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#2563eb,#60a5fa);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span style="color:#fff;font-size:18px;">📍</span>
            </div>
            <div>
              <div style="font-size:17px;font-weight:700;">${name}</div>
              <div style="font-size:12px;color:#94a3b8;">Guest Announcement</div>
            </div>
          </div>
          <h2 style="font-size:20px;font-weight:800;margin:0 0 12px;">${title}</h2>
          <p style="font-size:14px;line-height:1.7;color:#475569;margin:0 0 28px;">${body.replace(/\n/g, '<br>')}</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:20px;">
          <p style="font-size:11px;color:#94a3b8;">You're receiving this because you registered as a guest at ${name}.</p>
        </div>`;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${name} <${env.RESEND_FROM_EMAIL}>`,
          to:   [g.email],
          subject: `${title} — ${name}`,
          html,
        }),
      });
      res.ok ? sent++ : failed++;
    }

    // ── Free SMS via carrier email gateway ──
    const gateway = g.carrier && CARRIER_GATEWAYS[g.carrier];
    if (gateway && g.phone && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
      const digits = g.phone.replace(/\D/g, '').slice(-10);
      if (digits.length === 10) {
        const smsAddress = `${digits}@${gateway}`;
        // SMS body must be short — carriers truncate long messages
        const smsBody = `${name}: ${title}\n${body.slice(0, 140)}`;
        const smsRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: env.RESEND_FROM_EMAIL,
            to:   [smsAddress],
            subject: title,
            text: smsBody,   // plain text only — SMS gateways ignore HTML
          }),
        });
        if (smsRes.ok) smsSent++;
      }
    }
  }

  return json({ sent, smsSent, failed, total: guests.length }, 200, corsHeaders);
}

// ── Email via Resend (rich HTML, active guests only) ───────────────────────

async function handleResendEmail(request, env, corsHeaders) {
  const { hubId, type, title: rawTitle, body: rawBody, hubName, eventDate, eventHours, idToken } = await request.json();
  if (!hubId || !rawTitle || !idToken) return json({ error: 'Missing fields' }, 400, corsHeaders);
  if (!env.RESEND_API_KEY) return json({ error: 'RESEND_API_KEY not configured' }, 500, corsHeaders);

  const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!callerUid) return json({ error: 'Unauthorized' }, 401, corsHeaders);
  {
    const denied = await checkSendAllowed(env, callerUid, hubId, corsHeaders);
    if (denied) return denied;
  }
  return json(await sendEmailCore(env, { hubId, type, rawTitle, rawBody, hubName, eventDate, eventHours }), 200, corsHeaders);
}

// The sending itself, shared by the signed-in route above and the scheduler. Callers must already have been authorized.
async function sendEmailCore(env, { hubId, type, rawTitle, rawBody, hubName, eventDate, eventHours }) {
  const accessToken = await getServiceAccountAccessToken(env);
  const guests = await loadGuests(env.DATABASE_URL, hubId, accessToken);
  const today = new Date().toISOString().split('T')[0];
  const activeGuests = guests.filter(g => {
    const dep = g.stayDetails?.departureDate;
    if (!dep) return true;  // no stay info yet — include them
    return dep >= today;    // active = departure is today or future
  });
  const emailGuests = activeGuests.filter(g => g.email);
  const smsGuestsForSendBlue = activeGuests.filter(g => g.phone);

  const name        = escapeHtml(hubName || hubId);
  const title       = escapeHtml(rawTitle);
  const body        = escapeHtml(rawBody);
  const senderEmail = env.RESEND_FROM_EMAIL   || 'noreply@bluespotconnect.com';
  let sent = 0, smsSent = 0, failed = 0, smsFailed = 0;

  for (const g of emailGuests) {
    const toName  = escapeHtml(`${g.firstName || ''} ${g.lastName || ''}`.trim()) || 'Guest';
    const isEvent = type === 'event';
    const html    = isEvent
      ? buildEventEmail(name, title, body, toName, escapeHtml(eventDate || ''), escapeHtml(eventHours || ''))
      : buildAnnouncementEmail(name, title, body, toName);
    const subject = isEvent
      ? `🔔 Happening Now at ${name}: ${title}`
      : `Hey ${toName}, ${name} has a new update for you!`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: senderEmail,
        to:   [g.email],
        subject,
        html,
      }),
    });
    res.ok ? sent++ : failed++;
  }

  // ── SMS: SendBlue only ──
  for (const g of smsGuestsForSendBlue) {
    const phone = normalizePhone(g.phone);
    if (!phone) continue;

    if (!env.SENDBLUE_API_KEY || !env.SENDBLUE_API_SECRET) continue;

    try {
      const smsBody = `${name}: ${title}`.slice(0, 160);
      const smsRes = await fetch('https://api.sendblue.co/api/send-message', {
        method: 'POST',
        headers: {
          'sb-api-key-id': env.SENDBLUE_API_KEY,
          'sb-api-secret-key': env.SENDBLUE_API_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_number: env.SENDBLUE_FROM_NUMBER,
          number: phone,
          content: smsBody,
        }),
      });
      if (smsRes.ok) {
        smsSent++;
      } else {
        smsFailed++;
        const errData = await smsRes.json().catch(() => ({}));
        console.error(`[SendBlue SMS] Failed for ${phone}: ${smsRes.status} ${JSON.stringify(errData)}`);
      }
    } catch (e) {
      smsFailed++;
      console.error(`[SendBlue SMS] Error for ${phone}: ${e.message}`);
    }
  }

  return { sent, smsSent, smsFailed, failed, total: emailGuests.length, smsSentTo: smsGuestsForSendBlue.length };
}

// ── Welcome / account-created email to a single new user (Resend) ──────────
async function handleWelcomeEmail(request, env, corsHeaders) {
  const { idToken, email, name, password, loginUrl } = await request.json();
  if (!idToken || !email || !password) return json({ error: 'Missing fields' }, 400, corsHeaders);
  if (!env.RESEND_API_KEY) return json({ error: 'RESEND_API_KEY not configured' }, 500, corsHeaders);

  // Only an authenticated admin may trigger this.
  const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!callerUid) return json({ error: 'Unauthorized' }, 401, corsHeaders);

  // CHANGED: only a super admin / super manager may send this, and only to an account that already exists
  // (a super manager: one in their own hub). Before, any signed-in account could mail any address with
  // any text and link.
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return json({ error: 'Invalid email address.' }, 400, corsHeaders);
  if (typeof password !== 'string' || password.length > 128) return json({ error: 'Invalid password.' }, 400, corsHeaders);
  const accessToken = await getServiceAccountAccessToken(env);
  const caller = await dbGet(env.DATABASE_URL, `users/${callerUid}`, accessToken);
  if (!caller || caller.active === false || (caller.role !== 'super' && caller.role !== 'super_manager')) return json({ error: 'Only Super Admins and Super Managers can send this.' }, 403, corsHeaders);
  const recipientUid = await lookupAuthUidByEmail(env.FIREBASE_PROJECT_ID, email, accessToken);
  const recipient = recipientUid ? await dbGet(env.DATABASE_URL, `users/${recipientUid}`, accessToken) : null;
  if (!recipient) return json({ error: 'No account exists for that email.' }, 404, corsHeaders);
  if (caller.role === 'super_manager' && (recipient.role === 'super' || recipient.hubId !== caller.hubId)) return json({ error: 'You can only send this to accounts in your own hub.' }, 403, corsHeaders);

  const senderEmail = env.RESEND_FROM_EMAIL || 'noreply@bluespotconnect.com';
  const senderName  = env.RESEND_SENDER_NAME || 'BlueSpot Hub';
  // CHANGED: the sign-in link must be https and on the admin app's own host (env.ADMIN_ORIGIN); otherwise it is left out.
  let safeLoginUrl = '';
  try {
    const u = new URL(String(loginUrl || ''));
    if (u.protocol === 'https:' && env.ADMIN_ORIGIN && u.origin === new URL(env.ADMIN_ORIGIN).origin) safeLoginUrl = u.origin + '/';
  } catch (e) { /* no link */ }
  const html = buildWelcomeEmail(escapeHtml(String(name || 'there').slice(0, 100)), escapeHtml(email), escapeHtml(password), safeLoginUrl);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${senderName} <${senderEmail}>`,
      to:   [email],
      subject: 'Your BlueSpot Hub account is ready',
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return json({ error: err?.message || 'Resend send failed', sent: 0 }, 502, corsHeaders);
  }
  return json({ sent: 1 }, 200, corsHeaders);
}

function buildWelcomeEmail(toName, loginEmail, loginPassword, loginUrl) {
  // Twemoji PNGs instead of raw emoji glyphs — Outlook/Windows Mail fall back
  // to a broken monochrome outline for many emoji codepoints (that's what
  // produced the grayscale "broken icon" look for 📰/⚙️). A real hosted image
  // renders identically in every client instead of depending on the reader's
  // OS emoji font.
  const TW = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/';
  const icon = (code, size) => `<img src="${TW}${code}.png" width="${size}" height="${size}" alt="" style="width:${size}px;height:${size}px;display:inline-block;vertical-align:middle;border:0;outline:none;">`;

  const TOOLS = [
    { code: '1f514', title: 'Push Notifications', body: 'Send instant alerts, updates, and important messages.' },
    { code: '1f4c5', title: 'Events', body: 'Create and promote events your guests will love.' },
    { code: '1f4f0', title: 'Newsletter', body: 'Keep guests informed with news and updates.' },
    { code: '1f4f6', title: 'Control WiFi', body: 'Manage access, settings, and guest connectivity.' },
    { code: '1f4ca', title: 'Insights', body: "See what's working with real time analytics." },
    { code: '2699', title: 'Easy Management', body: 'Update info, hours, amenities, and more in minutes.' },
  ];
  // Two-per-row table grid — the widest layout most email clients (Gmail,
  // Outlook desktop, Apple Mail) render consistently without CSS Grid/Flexbox.
  let toolRows = '';
  for (let i = 0; i < TOOLS.length; i += 2) {
    const a = TOOLS[i], b = TOOLS[i + 1];
    const cell = t => t ? `
      <td width="50%" valign="top" style="padding:0 10px 24px;">
        <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 10px;"><tr><td width="52" height="52" align="center" valign="middle" style="width:52px;height:52px;border-radius:50%;border:1.5px solid #005baa;line-height:52px;font-size:0;mso-line-height-rule:exactly;">${icon(t.code, 22)}</td></tr></table>
          <div style="font-size:14px;font-weight:700;color:#0b2a4a;margin-bottom:4px;">${t.title}</div>
          <div style="font-size:12px;color:#5b7290;line-height:1.5;">${t.body}</div>
        </td></tr></table>
      </td>` : `<td width="50%"></td>`;
    toolRows += `<tr>${cell(a)}${cell(b)}</tr>`;
  }

  const btn = loginUrl
    ? `<a href="${loginUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:16px 34px;border-radius:999px;">Access Your iConnectHub Dashboard →</a>`
    : '';

  const logoUrl = 'https://assets.cdn.filesafe.space/Sk7XUXxjVtIrJHKp3GhX/media/6a5634ab46ff6bf8017aab21.png';
  // Fixed-size table cell (not a bare <img>) so a blocked/failed load shows a
  // small blank box instead of overflowing alt text on top of the next line.
  const logo = size => `<table cellpadding="0" cellspacing="0" style="width:${size}px;height:${size}px;border-radius:50%;background:#fff;overflow:hidden;"><tr><td style="width:${size}px;height:${size}px;overflow:hidden;"><img src="${logoUrl}" width="${size}" height="${size}" alt="" style="width:${size}px;height:${size}px;display:block;border:0;outline:none;object-fit:cover;"></td></tr></table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f7;font-family:'Segoe UI',Arial,sans-serif;color:#0b2a4a;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e3e8f0;border-radius:20px;">

  <!-- HERO -->
  <tr><td style="background:#0b2a4a;padding:36px 32px;border-radius:19px 19px 0 0;" align="center">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;"><tr><td style="box-shadow:0 0 0 3px #005baa;border-radius:50%;">${logo(52)}</td></tr></table>
    <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
      <div style="color:#fff;font-size:22px;font-weight:800;margin-bottom:18px;">BlueSpot</div>
      <h1 style="color:#fff;font-size:26px;font-weight:800;margin:0 0 10px;line-height:1.25;">Welcome to iConnect<span style="color:#005baa;">Hub</span>!</h1>
      <p style="color:#cfe0f0;font-size:14px;line-height:1.6;margin:0 0 22px;max-width:380px;">Your <strong style="color:#fff;">no-download app</strong> to manage everything, anywhere — just add it to your home screen and go.</p>
    </td></tr></table>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr><td style="padding:6px 0;" valign="middle"><table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-right:10px;"><tr><td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;border-radius:50%;background:#005baa;line-height:34px;font-size:0;mso-line-height-rule:exactly;">${icon('1f4f1', 16)}</td></tr></table><span style="color:#fff;font-size:13px;font-weight:700;vertical-align:middle;">No Download — Just Add and Go!</span></td></tr>
      <tr><td style="padding:6px 0;" valign="middle"><table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-right:10px;"><tr><td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;border-radius:50%;background:#005baa;line-height:34px;font-size:0;mso-line-height-rule:exactly;">${icon('1f3e0', 16)}</td></tr></table><span style="color:#fff;font-size:13px;font-weight:700;vertical-align:middle;">Add to Your Home Screen</span></td></tr>
      <tr><td style="padding:6px 0;" valign="middle"><table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-right:10px;"><tr><td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;border-radius:50%;background:#005baa;line-height:34px;font-size:0;mso-line-height-rule:exactly;">${icon('2b50', 16)}</td></tr></table><span style="color:#fff;font-size:13px;font-weight:700;vertical-align:middle;">One-Tap Access, Every Time</span></td></tr>
    </table>
  </td></tr>

  <!-- CREDENTIALS -->
  <tr><td style="padding:44px 32px 8px;" align="center">
    <h2 style="font-size:22px;font-weight:800;margin:0 0 10px;">Great news, ${toName}! Your account is ready.</h2>
    <p style="font-size:14px;color:#5b7290;line-height:1.6;margin:0 0 26px;max-width:420px;">You can now manage your iConnectHub, connect with your guests, and control everything from one easy place.</p>
  </td></tr>
  <tr><td style="padding:0 32px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f8;border-radius:16px;">
      <tr><td style="padding:18px 22px;border-bottom:1px solid #dbe3ee;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;border-radius:50%;background:#dfe7f5;line-height:34px;font-size:0;mso-line-height-rule:exactly;">${icon('2709', 16)}</td>
          <td style="padding-left:12px;"><span style="display:block;font-size:11px;font-weight:700;color:#0b2a4a;text-transform:uppercase;letter-spacing:.04em;">Email</span><span style="font-size:15px;color:#1f3a5c;font-weight:600;">${loginEmail}</span></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:18px 22px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;border-radius:50%;background:#dfe7f5;line-height:34px;font-size:0;mso-line-height-rule:exactly;">${icon('1f512', 16)}</td>
          <td style="padding-left:12px;"><span style="display:block;font-size:11px;font-weight:700;color:#0b2a4a;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Temporary Password</span><span style="display:inline-block;font-family:'Courier New',monospace;font-size:14px;color:#0b2a4a;font-weight:700;background:#ffffff;border:1px solid #dbe3ee;border-radius:6px;padding:3px 10px;letter-spacing:.03em;">${loginPassword}</span></td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:0 32px 12px;">${btn}</td></tr>
  <tr><td align="center" style="padding:0 32px 40px;">
    <p style="font-size:13px;color:#5b7290;margin:0;">🛡️ For your security, please change your password after your first sign-in.</p>
  </td></tr>

  <!-- DIVIDER -->
  <tr><td style="padding:0 32px;"><div style="height:1px;background:#e9edf5;line-height:1px;font-size:0;">&nbsp;</div></td></tr>

  <!-- TOOLS -->
  <tr><td style="padding:36px 24px 8px;" align="center">
    <h2 style="font-size:20px;font-weight:800;margin:0 0 6px;">Powerful Tools to Enhance the <span style="color:#005baa;">Guest</span> Experience</h2>
    <div style="width:56px;height:3px;background:#005baa;border-radius:2px;margin:12px auto 28px;"></div>
  </td></tr>
  <tr><td style="padding:0 22px 8px;">
    <table width="100%" cellpadding="0" cellspacing="0">${toolRows}</table>
  </td></tr>

  <!-- DIVIDER -->
  <tr><td style="padding:8px 32px 0;"><div style="height:1px;background:#e9edf5;line-height:1px;font-size:0;">&nbsp;</div></td></tr>

  <!-- HELP -->
  <tr><td style="padding:28px 32px 36px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f8;border-radius:16px;">
      <tr><td style="padding:22px 26px;">
        <div style="font-size:15px;font-weight:800;color:#0b2a4a;margin-bottom:4px;">Need help?</div>
        <div style="font-size:13px;color:#5b7290;margin-bottom:16px;">We're here to help you every step of the way.</div>
        <div style="font-size:13px;color:#0b2a4a;font-weight:600;line-height:2;">
          support@bluespotconnect.com<br>
          (888) 922-8726<br>
          bluespotconnect.com
        </div>
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#081f39;padding:22px 32px;border-radius:0 0 19px 19px;" align="center">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
      <td style="padding-right:8px;">${logo(18)}</td>
      <td><span style="color:#fff;font-weight:800;font-size:15px;vertical-align:middle;">BlueSpot</span><span style="color:#cfe0f0;font-size:13px;vertical-align:middle;"> &nbsp;·&nbsp; Enhancing the <strong style="color:#005baa;">Guest</strong> Experience</span></td>
    </tr></table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

function buildAnnouncementEmail(hubName, title, body, toName) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
  <tr><td align="center" style="padding-bottom:20px;">
    <div style="display:inline-block;background:#dbeafe;border:1px solid #93c5fd;border-radius:30px;padding:6px 18px;">
      <span style="color:#1d4ed8;font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;">📍 ${hubName}</span>
    </div>
  </td></tr>
  <tr><td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:36px 36px 28px;">
      <p style="margin:0 0 6px;color:rgba(255,255,255,0.75);font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">New Announcement</p>
      <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;line-height:1.25;">${title}</h1>
    </div>
    <div style="padding:32px 36px;">
      <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#0f172a;">Hey, ${toName}! 👋</p>
      <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;"><strong style="color:#1e293b;">${hubName}</strong> just posted a new announcement for you. Here's what you need to know:</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:22px 24px;margin-bottom:28px;">
        <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">${title}</p>
        <p style="margin:0;font-size:14px;color:#475569;line-height:1.7;">${body.replace(/\n/g,'<br>')}</p>
      </div>
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.6;">Make sure to check your hub for more updates. We'll keep you posted on everything happening at <strong>${hubName}</strong>!</p>
      <div style="text-align:center;"><div style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#3b82f6);border-radius:10px;padding:13px 32px;"><span style="color:#ffffff;font-size:14px;font-weight:700;">Check Your Hub</span></div></div>
    </div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 36px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.8;">You're getting this because you're a registered guest at <strong style="color:#64748b;">${hubName}</strong>.<br>Questions? Contact the front office directly.</p>
    </div>
  </td></tr>
  <tr><td align="center" style="padding-top:20px;"><p style="margin:0;font-size:11px;color:#94a3b8;">&copy; ${hubName} · Powered by BlueSpot Hub</p></td></tr>
</table></td></tr></table>
</body></html>`;
}

function buildEventEmail(hubName, title, body, toName, eventDate, eventHours) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
  <tr><td align="center" style="padding-bottom:20px;">
    <div style="display:inline-block;background:#fef3c7;border:1px solid #f59e0b;border-radius:30px;padding:6px 18px;">
      <span style="color:#d97706;font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;">🔔 Happening Now · ${hubName}</span>
    </div>
  </td></tr>
  <tr><td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#d97706,#f59e0b);padding:36px 36px 28px;">
      <p style="margin:0 0 6px;color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Event Starting Now</p>
      <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;line-height:1.25;">${title}</h1>
    </div>
    <div style="padding:32px 36px;">
      <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#0f172a;">Hey, ${toName}! 👋</p>
      <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">Don't miss it — an event at <strong style="color:#1e293b;">${hubName}</strong> is happening right now!</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:14px;padding:22px 24px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:18px;font-weight:800;color:#0f172a;">${title}</p>
        ${body ? `<p style="margin:0 0 16px;font-size:13px;color:#78716c;line-height:1.6;">${body.replace(/\n/g,'<br>')}</p>` : ''}
        <table cellpadding="0" cellspacing="0" width="100%"><tr>
          <td style="padding:8px 14px;background:#fff;border-radius:8px;border:1px solid #fde68a;width:48%;">
            <div style="font-size:9px;font-weight:700;color:#a16207;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Date</div>
            <div style="font-size:13px;font-weight:700;color:#0f172a;">${eventDate}</div>
          </td>
          <td style="width:4%;"></td>
          <td style="padding:8px 14px;background:#fff;border-radius:8px;border:1px solid #fde68a;width:48%;">
            <div style="font-size:9px;font-weight:700;color:#a16207;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Time</div>
            <div style="font-size:13px;font-weight:700;color:#0f172a;">${eventHours}</div>
          </td>
        </tr></table>
      </div>
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.6;">Head over now and enjoy the experience! Check your hub for location details.</p>
      <div style="text-align:center;"><div style="display:inline-block;background:linear-gradient(135deg,#d97706,#f59e0b);border-radius:10px;padding:13px 32px;"><span style="color:#ffffff;font-size:14px;font-weight:700;">View Event Details</span></div></div>
    </div>
    <div style="background:#fffbeb;border-top:1px solid #fde68a;padding:20px 36px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#a16207;line-height:1.8;">You're getting this because you're a registered guest at <strong>${hubName}</strong>.</p>
    </div>
  </td></tr>
  <tr><td align="center" style="padding-top:20px;"><p style="margin:0;font-size:11px;color:#94a3b8;">&copy; ${hubName} · Powered by BlueSpot Hub</p></td></tr>
</table></td></tr></table>
</body></html>`;
}

// ── Safety checks (added) ──────────────────────────────────────────────────
// Before this, any valid Firebase sign-in (including a guest's) could send to any hub, even '_global'.

function escapeHtml(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Who may send to this hub: a super admin (any hub), or a manager / super manager whose own hub it is.
// Roles and hubId are read from users/{uid} using the service account, never from the request.
function mayAdministerHub(user, hubId) {
  if (!user || typeof user !== 'object') return false;
  if (user.active === false) return false; // CHANGED: a deactivated account sends nothing
  if (user.role === 'super') return true;
  if (hubId === '_global') return false;
  return (user.role === 'manager' || user.role === 'super_manager') && user.hubId === hubId;
}

// Returns a Response to send back when the send must NOT go ahead, or null when it may.
// Every doubt is a refusal: a bad hub id, an unreadable user record, an unreadable hub or an unreadable notification switch.
async function checkSendAllowed(env, uid, hubId, corsHeaders) {
  if (typeof hubId !== 'string' || !ID_RE.test(hubId)) return json({ error: 'Invalid hub.' }, 400, corsHeaders);
  try {
    const accessToken = await getServiceAccountAccessToken(env);
    const user = await dbGet(env.DATABASE_URL, `users/${uid}`, accessToken);
    if (!mayAdministerHub(user, hubId)) return json({ error: 'You are not allowed to send to this hub.' }, 403, corsHeaders);
    if (hubId !== '_global') {
      // The hub has to exist, so a super admin cannot send to a made-up hub.
      const name = await dbGet(env.DATABASE_URL, `hubs_meta/${hubId}/name`, accessToken);
      if (name === null) return json({ error: 'That hub does not exist.' }, 404, corsHeaders);
      // Per-hub switch in the admin: Settings > Notifications to guests. Missing = on; only an explicit false turns it off.
      const allowed = await dbGet(env.DATABASE_URL, `hubs/${hubId}/settings/guestNotifications`, accessToken);
      if (allowed === false) return json({ error: 'Guest notifications are turned off for this hub.', blocked: true }, 403, corsHeaders);
    }
    return null;
  } catch (e) {
    console.error('permission check failed:', e && e.message ? e.message : String(e));
    return json({ error: 'Could not verify permission, so nothing was sent. Please try again.' }, 500, corsHeaders);
  }
}

// Both shapes exist in the wild: flat {endpoint,p256dh,auth} and PushSubscription.toJSON() {endpoint,keys:{p256dh,auth}}.
function normalizeSub(v) {
  if (!v || typeof v !== 'object' || typeof v.endpoint !== 'string') return null;
  const p256dh = v.p256dh || (v.keys && v.keys.p256dh);
  const auth = v.auth || (v.keys && v.keys.auth);
  return p256dh && auth ? { endpoint: v.endpoint, p256dh, auth } : null;
}

// ── Test send: a notification to the signed-in manager's own saved device only ──
async function handleTestSend(request, env, corsHeaders) {
  const { hubId, title, body, idToken } = await request.json();
  if (!hubId || !title || !idToken) return json({ error: 'Missing fields' }, 400, corsHeaders);
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return json({ error: 'Push is not configured on the server.' }, 500, corsHeaders);

  const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!callerUid) return json({ error: 'Unauthorized' }, 401, corsHeaders);

  const accessToken = await getServiceAccountAccessToken(env);
  const user = await dbGet(env.DATABASE_URL, `users/${callerUid}`, accessToken);
  if (!mayAdministerHub(user, hubId)) return json({ error: 'You are not allowed to send to this hub.' }, 403, corsHeaders);

  // Deliberately ignores the hub's guest-notification switch: it only ever reaches this one device.
  const sub = normalizeSub(user.webPushSub);
  if (!sub) return json({ error: 'No device is saved for you yet. Turn on notifications on this device first.', noDevice: true }, 409, corsHeaders);

  try {
    await sendWebPush(sub, { title: `[TEST] ${String(title).slice(0, 100)}`, body: String(body || '').slice(0, 120) }, env);
  } catch (e) {
    console.error('test send failed:', e && e.message ? String(e.message).slice(0, 120) : 'unknown');
    return json({ error: 'The test could not be delivered to your device.' }, 502, corsHeaders);
  }
  return json({ sent: 1 }, 200, corsHeaders);
}

// ── Added routes the admin app already calls ───────────────────────────────

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

async function lookupAuthUidByEmail(projectId, email, accessToken) {
  const res = await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + projectId + '/accounts:lookup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: [email] }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data && Array.isArray(data.users) && data.users[0] && data.users[0].localId ? data.users[0].localId : null;
}

// A manager saves their own device so test notifications can reach them. Written with the service account,
// but only ever to the caller's own record and only after the shape is checked.
async function handleSaveManagerSubscription(request, env, corsHeaders) {
  const { idToken, subscription } = await request.json();
  if (!idToken || !subscription) return json({ error: 'Missing fields' }, 400, corsHeaders);
  const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!callerUid) return json({ error: 'Unauthorized' }, 401, corsHeaders);
  const accessToken = await getServiceAccountAccessToken(env);
  const user = await dbGet(env.DATABASE_URL, `users/${callerUid}`, accessToken);
  if (!user || user.active === false || !user.role) return json({ error: 'Not allowed.' }, 403, corsHeaders);
  const sub = normalizeSub(subscription);
  if (!sub || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 2000 || String(sub.p256dh).length > 200 || String(sub.auth).length > 100) return json({ error: 'That subscription is not valid.' }, 400, corsHeaders);
  const res = await fetch(`${env.DATABASE_URL}/users/${callerUid}/webPushSub.json`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth }, savedAt: new Date().toISOString() }),
  });
  if (!res.ok) return json({ error: 'Could not save the subscription.' }, 502, corsHeaders);
  return json({ saved: true }, 200, corsHeaders);
}

// A chat reply goes to the one guest who owns the thread, never to the whole hub.
async function handleChatGuestPush(request, env, corsHeaders) {
  const { hubId, guestToken, title: rawTitle, body: rawBody, idToken } = await request.json();
  if (!hubId || !guestToken || !rawTitle || !idToken) return json({ error: 'Missing fields' }, 400, corsHeaders);
  if (!ID_RE.test(String(hubId)) || !ID_RE.test(String(guestToken))) return json({ error: 'Invalid id.' }, 400, corsHeaders);
  const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!callerUid) return json({ error: 'Unauthorized' }, 401, corsHeaders);
  const denied = await checkSendAllowed(env, callerUid, hubId, corsHeaders);
  if (denied) return denied;

  const accessToken = await getServiceAccountAccessToken(env);
  const guest = await dbGet(env.DATABASE_URL, `hubs/${hubId}/guests/${guestToken}`, accessToken);
  if (!guest) return json({ sent: 0 }, 200, corsHeaders);
  const title = String(rawTitle).slice(0, 100);
  const body = String(rawBody || '').slice(0, 300);
  let sent = 0;
  const webSub = normalizeSub(guest.webPushSub);
  if (webSub) {
    try { await sendWebPush(webSub, { title, body }, env); sent++; } catch (e) { /* stale subscription */ }
  }
  const fcmToken = guest.fcmToken && guest.fcmToken.token;
  if (fcmToken) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: fcmToken, webpush: { headers: { Urgency: 'high', TTL: '86400' }, notification: { title, body }, fcm_options: { link: '/' } } } }),
    });
    if (res.ok) sent++;
  }
  return json({ sent }, 200, corsHeaders);
}


// ═════════════════════════════════════════════════════════════════════════════
// Scheduler (F-06 / F-08) — runs from a Cloudflare Cron Trigger, no browser involved.
//
// Every minute it (1) publishes scheduled announcements that are due and (2) sends "starting now" alerts for
// events, both through the SAME send code and the SAME rules as a manager pressing "notify" in the admin:
//   - the hub must exist, be active, and have guest notifications on (settings/guestNotifications !== false);
//   - the person who scheduled the item must still be an active user allowed on that hub;
//   - the same message to the same hub within 10 minutes is not sent twice (same key as the admin app);
//   - every outcome (published, sent, skipped and why, failed, gave up) is written to hubs/{id}/audit.
// Duplicate protection across overlapping runs uses Firebase's conditional writes (ETag / if-match).
// Retries: a notification that reached nobody is retried 1, 5 and 15 minutes later, then given up on.
// Turn the whole thing off without redeploying: set the worker variable SCHEDULER_ENABLED to "false".
// ═════════════════════════════════════════════════════════════════════════════

const SCHED = {
  eventGraceMin: 30,            // an event alert is still sent up to 30 minutes after the start time (covers short outages)
  maxAttempts: 3,
  backoffMs: [60_000, 5 * 60_000, 15 * 60_000],
  leaseMs: 2 * 60_000,          // another run will not touch a notification that is being sent for this long
  dupWindowMs: 10 * 60_000,     // same as the admin app (lib/notify.ts)
  maxLateMs: 6 * 3600_000,      // a scheduled post found more than 6 hours late is still published, but guests are not pinged
  maxRetryAgeMs: 24 * 3600_000,
  hubParallel: 4,
};

async function fbFetch(env, token, method, path, { body, etag, query } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (etag === true) headers['X-Firebase-ETag'] = 'true';
  else if (typeof etag === 'string') headers['if-match'] = etag;
  return fetch(`${env.DATABASE_URL}/${path}.json${query ? `?${query}` : ''}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function fbGet(env, token, path, query) {
  const res = await fbFetch(env, token, 'GET', path, { query });
  if (!res.ok) throw new Error(`database read failed (${res.status})`);
  return res.json();
}
async function fbGetEtag(env, token, path) {
  const res = await fbFetch(env, token, 'GET', path, { etag: true });
  if (!res.ok) throw new Error(`database read failed (${res.status})`);
  return { value: await res.json(), etag: res.headers.get('ETag') };
}
/** Writes only if nobody changed the value since it was read. false = somebody else got there first. */
async function fbPutIfMatch(env, token, path, value, etag) {
  const res = await fbFetch(env, token, 'PUT', path, { body: value, etag });
  if (res.status === 412) return false;
  if (!res.ok) throw new Error(`database write failed (${res.status})`);
  return true;
}
async function fbPut(env, token, path, value) {
  const res = await fbFetch(env, token, 'PUT', path, { body: value });
  if (!res.ok) throw new Error(`database write failed (${res.status})`);
}
async function fbPatch(env, token, path, value) {
  const res = await fbFetch(env, token, 'PATCH', path, { body: value });
  if (!res.ok) throw new Error(`database write failed (${res.status})`);
}

const isoOf = (ms) => new Date(ms).toISOString();
const tsOf = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : null);

async function schedAudit(env, token, hubId, action, summary, by = 'scheduler', extra = {}) {
  try {
    const at = Date.now();
    const key = `s${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await fbPut(env, token, `hubs/${hubId}/audit/${isoOf(at).slice(0, 7)}/${key}`, { at: isoOf(at), by: String(by).slice(0, 200), action, summary: String(summary).slice(0, 400), ...extra });
  } catch (e) { /* the history is a record, not a gate */ }
}

function validZone(tz) {
  if (typeof tz !== 'string' || !tz) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch (e) { return null; }
}
/** The hub's own calendar date and minutes since midnight at an instant. */
function localParts(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
function startMinutes(hours) {
  const m = String(hours || '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2] || '0', 10);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h > 23 || min > 59 ? null : h * 60 + min;
}
async function messageKey(n) {
  const data = new TextEncoder().encode(`${n.pushTitle}\n${n.pushBody}\n${n.emailTitle}\n${n.emailBody}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(hash).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24); // same key as lib/notify.ts
}

async function loadPeople(env, token) {
  const users = (await fbGet(env, token, 'users')) || {};
  const byEmail = new Map();
  for (const [uid, p] of Object.entries(users)) if (p && typeof p === 'object' && typeof p.email === 'string') byEmail.set(p.email.toLowerCase(), { uid, ...p });
  return { byEmail };
}
/** May the person who scheduled this item still act for the hub? An item with no recorded author is a legacy one and is allowed. */
function authorStatus(people, email, hubId) {
  if (!email) return { ok: true, note: 'author not recorded' };
  const u = people.byEmail.get(String(email).toLowerCase());
  if (!u) return { ok: false, reason: 'the person who scheduled it no longer has an account' };
  if (u.active === false) return { ok: false, reason: 'the person who scheduled it is deactivated' };
  return mayAdministerHub(u, hubId) ? { ok: true } : { ok: false, reason: 'the person who scheduled it no longer has access to this hub' };
}
/** The hub-level gate every automatic send passes (the signed-in routes apply the same switch in checkSendAllowed). */
async function systemSendAllowed(env, token, hubId) {
  const meta = await fbGet(env, token, `hubs_meta/${hubId}`);
  if (!meta || typeof meta !== 'object') return { ok: false, reason: 'the hub no longer exists' };
  if (meta.active === false) return { ok: false, reason: 'the hub is inactive' };
  const allowed = await fbGet(env, token, `hubs/${hubId}/settings/guestNotifications`);
  if (allowed === false) return { ok: false, reason: 'guest notifications are turned off for this hub' };
  return { ok: true, meta };
}

const pushOk = (r) => (r.sent || 0) + (r.webSent || 0) > 0 || (r.total === 0 && (r.webErrors || []).every((e) => /not set in env/.test(e)));
const emailOk = (r) => (r.sent || 0) > 0 || (r.total || 0) === 0;

/**
 * One notification, from "due" to "done", safe to call again and again (every minute, from overlapping runs).
 * State lives at jobPath: { status: sending | failed | done | skipped | gave_up, attempts, push, email, next, lease, date? }.
 */
async function runNotifyJob(env, token, hubId, jobPath, n, nowMs, opts = {}) {
  const { value: stored, etag } = await fbGetEtag(env, token, jobPath);
  const job = stored && typeof stored === 'object' && (opts.date === undefined || stored.date === opts.date) ? stored : null;
  if (job && ['done', 'skipped', 'gave_up', 'canceled'].includes(job.status)) return { state: job.status };
  if (job && job.status === 'queued' && (job.runAfter || 0) > nowMs) return { state: 'waiting' };
  if (job && job.status === 'failed' && (job.next || 0) > nowMs) return { state: 'waiting' };
  if (job && job.status === 'sending' && (job.lease || 0) > nowMs) return { state: 'busy' };
  const stamp = { ...(opts.keep || {}), ...(opts.date === undefined ? {} : { date: opts.date }) };
  const audit = (summary) => schedAudit(env, token, hubId, opts.auditAction || 'scheduled-notify', summary, opts.auditBy || 'scheduler', opts.jobId ? { jobId: opts.jobId } : {});
  const finish = async (status, reason, extra = {}) => {
    await fbPut(env, token, jobPath, { ...stamp, status, reason: reason || null, attempts: job ? job.attempts || 0 : 0, at: isoOf(nowMs), ...extra });
    await audit(`${String(n.pushTitle).slice(0, 80)}: ${status}${reason ? ` (${reason})` : ''}.`);
    return { state: status, reason };
  };

  const gate = await systemSendAllowed(env, token, hubId);
  if (!gate.ok) {
    if (!(await fbPutIfMatch(env, token, jobPath, { ...stamp, status: 'skipped', reason: gate.reason, attempts: job ? job.attempts || 0 : 0, at: isoOf(nowMs) }, etag))) return { state: 'busy' };
    await audit(`${String(n.pushTitle).slice(0, 80)}: not sent, ${gate.reason}.`);
    return { state: 'skipped', reason: gate.reason };
  }
  if (opts.dueAtMs && nowMs - opts.dueAtMs > SCHED.maxLateMs) {
    if (!(await fbPutIfMatch(env, token, jobPath, { ...stamp, status: 'skipped', reason: 'too late to be useful', attempts: 0, at: isoOf(nowMs) }, etag))) return { state: 'busy' };
    await audit(`${String(n.pushTitle).slice(0, 80)}: not sent, it was found more than 6 hours late.`);
    return { state: 'skipped', reason: 'late' };
  }
  const key = await messageKey(n);
  const last = await fbGet(env, token, `hubs/${hubId}/notifyLog/${key}`);
  if (!job && typeof last === 'number' && nowMs - last < SCHED.dupWindowMs) {
    if (!(await fbPutIfMatch(env, token, jobPath, { ...stamp, status: 'skipped', reason: 'duplicate', attempts: 0, at: isoOf(nowMs) }, etag))) return { state: 'busy' };
    await audit(`${String(n.pushTitle).slice(0, 80)}: not sent, the same message went to guests a few minutes ago.`);
    return { state: 'skipped', reason: 'duplicate' };
  }

  const attempts = (job ? job.attempts || 0 : 0) + 1;
  let pushDone = !!(job && job.push);
  let emailDone = !!(job && job.email);
  // Claim the notification. If two runs overlap, only one write matches the ETag and the other stops here.
  if (!(await fbPutIfMatch(env, token, jobPath, { ...stamp, status: 'sending', attempts, push: pushDone, email: emailDone, lease: nowMs + SCHED.leaseMs, at: isoOf(nowMs) }, etag))) return { state: 'busy' };
  if (!job) await fbPut(env, token, `hubs/${hubId}/notifyLog/${key}`, nowMs).catch(() => null);

  const errors = [];
  // What the services ACCEPTED. Push services give no delivery receipt, so "accepted" is the strongest claim available.
  const result = { ...((job && job.result) || {}) };
  if (!pushDone) {
    try {
      const pr = await sendPushCore(env, hubId, n.pushTitle, String(n.pushBody).slice(0, 120));
      result.pushAttempted = pr.total || 0;
      result.pushAccepted = (pr.sent || 0) + (pr.webSent || 0);
      pushDone = pushOk(pr);
      if (!pushDone) errors.push('push reached nobody');
    } catch (e) { errors.push('push failed'); }
  }
  if (!emailDone) {
    if (!env.RESEND_API_KEY) emailDone = true; // email is not set up on this worker: nothing to retry
    else {
      try {
        const er = await sendEmailCore(env, { hubId, type: n.emailType, rawTitle: n.emailTitle, rawBody: n.emailBody, hubName: gate.meta.name || hubId, eventDate: n.eventDate, eventHours: n.eventHours });
        result.emailAttempted = er.total || 0;
        result.emailAccepted = er.sent || 0;
        result.smsAccepted = er.smsSent || 0;
        emailDone = emailOk(er);
        if (!emailDone) errors.push('email reached nobody');
      } catch (e) { errors.push('email failed'); }
    }
  }
  const at = isoOf(nowMs);
  if (pushDone && emailDone) {
    await fbPut(env, token, jobPath, { ...stamp, status: 'done', attempts, push: true, email: true, result, at });
    await audit(`${String(n.pushTitle).slice(0, 80)}: sent${attempts > 1 ? ` on attempt ${attempts}` : ''}.`);
    return { state: 'done' };
  }
  if (attempts >= SCHED.maxAttempts) {
    await fbPut(env, token, jobPath, { ...stamp, status: 'gave_up', attempts, push: pushDone, email: emailDone, result, reason: errors.join(', ').slice(0, 200), at });
    await audit(`${String(n.pushTitle).slice(0, 80)}: gave up after ${attempts} tries (${errors.join(', ')}).`);
    return { state: 'gave_up' };
  }
  await fbPut(env, token, jobPath, { ...stamp, status: 'failed', attempts, push: pushDone, email: emailDone, result, reason: errors.join(', ').slice(0, 200), next: nowMs + SCHED.backoffMs[attempts - 1], at });
  await audit(`${String(n.pushTitle).slice(0, 80)}: attempt ${attempts} failed (${errors.join(', ')}); will retry.`);
  return { state: 'failed' };
}

const retriable = (job, nowMs) => !!job && ((job.status === 'failed' && (job.next || 0) <= nowMs) || (job.status === 'sending' && (job.lease || 0) <= nowMs));

async function processAnnouncements(env, token, hubId, meta, people, nowMs, out) {
  const anns = await fbGet(env, token, `hubs/${hubId}/announcements`);
  for (const [id, a] of Object.entries(anns && typeof anns === 'object' ? anns : {})) {
    if (!a || typeof a !== 'object') continue;
    const path = `hubs/${hubId}/announcements/${id}`;
    const due = tsOf(a.scheduledAt);
    const content = { pushTitle: String(a.title || ''), pushBody: String(a.message || ''), emailType: 'announcement', emailTitle: String(a.title || ''), emailBody: String(a.message || '') };

    if (a.active === false && due !== null && due <= nowMs && !a.publishedAt && !a.scheduleStatus) {
      const expires = tsOf(a.expiresAt);
      if (expires !== null && expires <= nowMs) {
        await fbPatch(env, token, path, { scheduleStatus: 'expired' });
        await schedAudit(env, token, hubId, 'scheduled-publish', `"${String(a.title).slice(0, 80)}" was not published: it had already expired.`);
        out.expired++;
        continue;
      }
      const who = authorStatus(people, a.updatedBy || a.createdBy, hubId);
      if (!who.ok) {
        await fbPatch(env, token, path, { scheduleStatus: 'blocked', scheduleNote: who.reason });
        await schedAudit(env, token, hubId, 'scheduled-publish', `"${String(a.title).slice(0, 80)}" was not published: ${who.reason}.`);
        out.blocked++;
        continue;
      }
      const { value: fresh, etag } = await fbGetEtag(env, token, path);
      if (!fresh || fresh.active !== false || fresh.publishedAt) continue;
      const claimed = await fbPutIfMatch(env, token, path, { ...fresh, active: true, publishedAt: isoOf(nowMs), publishedBy: 'scheduler', scheduleStatus: 'published' }, etag);
      if (!claimed) continue; // another run or an edit got there first
      out.published++;
      await schedAudit(env, token, hubId, 'scheduled-publish', `"${String(a.title).slice(0, 80)}" went live.`);
      if (a.notifyOnPublish !== false) {
        const r = await runNotifyJob(env, token, hubId, `${path}/notify`, content, nowMs, { dueAtMs: due });
        out.notify[r.state] = (out.notify[r.state] || 0) + 1;
      }
    } else if (a.publishedBy === 'scheduler' && a.notifyOnPublish !== false && retriable(a.notify, nowMs) && nowMs - (tsOf(a.publishedAt) || 0) < SCHED.maxRetryAgeMs) {
      const r = await runNotifyJob(env, token, hubId, `${path}/notify`, content, nowMs, { dueAtMs: due });
      out.notify[r.state] = (out.notify[r.state] || 0) + 1;
    }
  }
}

async function processEventAlerts(env, token, hubId, meta, people, nowMs, out) {
  const tz = validZone(meta.timezone);
  if (!tz) {
    // Without the hub's time zone "starting now" cannot be worked out, and a wrong guess would alert at the wrong hour.
    const day = isoOf(nowMs).slice(0, 10);
    const flag = await fbGet(env, token, `hubs/${hubId}/schedulerState/noTimezoneOn`);
    if (flag !== day) {
      await fbPut(env, token, `hubs/${hubId}/schedulerState/noTimezoneOn`, day);
      await schedAudit(env, token, hubId, 'scheduled-notify', 'Event alerts are paused: set this hub’s time zone in Hubs so they go out at the right time.');
    }
    out.noTimezone++;
    return;
  }
  const { date, minutes } = localParts(nowMs, tz);
  const acts = await fbGet(env, token, `hubs/${hubId}/activities`);
  for (const [id, a] of Object.entries(acts && typeof acts === 'object' ? acts : {})) {
    if (!a || typeof a !== 'object' || a.active === false) continue;
    const dates = Array.isArray(a.dates) ? a.dates : a.dates && typeof a.dates === 'object' ? Object.values(a.dates) : [];
    if (!dates.includes(date)) continue;
    const start = startMinutes(a.hours);
    if (start === null || minutes < start || minutes >= start + SCHED.eventGraceMin) continue;
    const path = `hubs/${hubId}/activities/${id}`;
    const job = a.alert && typeof a.alert === 'object' && a.alert.date === date ? a.alert : null;
    if (job) {
      if (['done', 'skipped', 'gave_up'].includes(job.status)) { if (a.alertedOn !== date) await fbPut(env, token, `${path}/alertedOn`, date).catch(() => null); continue; }
      if (!retriable(job, nowMs)) continue; // being sent, or waiting for its next try
    } else if (a.alertedOn === date) continue; // an older admin page already sent this one today
    const who = authorStatus(people, a.updatedBy || a.createdBy, hubId);
    if (!who.ok) {
      await fbPut(env, token, `${path}/alert`, { date, status: 'skipped', reason: who.reason, attempts: 0, at: isoOf(nowMs) });
      await fbPut(env, token, `${path}/alertedOn`, date);
      await schedAudit(env, token, hubId, 'scheduled-notify', `"${String(a.title).slice(0, 80)}" alert not sent: ${who.reason}.`);
      out.blocked++;
      continue;
    }
    const dateLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const content = {
      pushTitle: `📅 ${a.title || 'Event'} is starting now!`,
      pushBody: [a.hours, a.location].filter(Boolean).join(' · ') || a.description || '',
      emailType: 'event', emailTitle: String(a.title || 'Event'), emailBody: String(a.description || a.fullDesc || ''), eventDate: dateLabel, eventHours: String(a.hours || ''),
    };
    const r = await runNotifyJob(env, token, hubId, `${path}/alert`, content, nowMs, { date });
    out.alerts[r.state] = (out.alerts[r.state] || 0) + 1;
    // Old admin pages use alertedOn to avoid repeating an alert; keep it in step once the alert is finished one way or the other.
    if (['done', 'skipped', 'gave_up'].includes(r.state)) await fbPut(env, token, `${path}/alertedOn`, date).catch(() => null);
  }
}

/**
 * Manual sends the admin app queued (hubs/{id}/notifyJobs/{jobId}). They go through the same runNotifyJob as scheduled
 * posts: one conditional claim, a lease, bounded retries with backoff, per-hub gates. A job a person cancelled while it
 * was still queued is terminal and is never claimed.
 */
async function processNotifyJobs(env, token, hubId, meta, people, nowMs, out) {
  const jobs = await fbGet(env, token, `hubs/${hubId}/notifyJobs`);
  for (const [id, j] of Object.entries(jobs && typeof jobs === 'object' ? jobs : {})) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !j || typeof j !== 'object' || !j.content || typeof j.content !== 'object') continue;
    const ready = (j.status === 'queued' && (j.runAfter || 0) <= nowMs) || retriable(j, nowMs);
    if (!ready || nowMs - (tsOf(j.createdAt) || nowMs) > SCHED.maxRetryAgeMs) continue;
    const path = `hubs/${hubId}/notifyJobs/${id}`;
    const who = authorStatus(people, j.by, hubId);
    const c = j.content;
    const content = { pushTitle: String(c.pushTitle || ''), pushBody: String(c.pushBody || ''), emailType: c.emailType === 'event' ? 'event' : 'announcement', emailTitle: String(c.emailTitle || ''), emailBody: String(c.emailBody || ''), eventDate: c.eventDate, eventHours: c.eventHours };
    const keep = { by: j.by, createdAt: j.createdAt, runAfter: j.runAfter, content: j.content, title: j.title };
    if (!who.ok || !j.by) {
      // A queued send needs a known, still-authorised sender. Fail closed.
      const { etag } = await fbGetEtag(env, token, path);
      if (await fbPutIfMatch(env, token, path, { ...keep, status: 'skipped', reason: who.ok ? 'no sender recorded' : who.reason, attempts: j.attempts || 0, at: isoOf(nowMs) }, etag)) {
        await schedAudit(env, token, hubId, 'notify', `${content.pushTitle.slice(0, 80)}: not sent, ${who.ok ? 'no sender recorded' : who.reason}.`, String(j.by || 'unknown'), { jobId: id });
        out.jobs.skipped = (out.jobs.skipped || 0) + 1;
      }
      continue;
    }
    const r = await runNotifyJob(env, token, hubId, path, content, nowMs, { keep, dueAtMs: j.runAfter, auditAction: 'notify', auditBy: j.by, jobId: id });
    out.jobs[r.state] = (out.jobs[r.state] || 0) + 1;
  }
}

/** One scheduler pass. Exported for tests; the Cron Trigger calls it through scheduled(). */
export async function runScheduler(env, nowMs = Date.now()) {
  const out = { hubs: 0, published: 0, expired: 0, blocked: 0, noTimezone: 0, notify: {}, alerts: {}, jobs: {}, errors: [] };
  if (String(env.SCHEDULER_ENABLED).toLowerCase() === 'false') return { ...out, disabled: true };
  const token = await getServiceAccountAccessToken(env);
  const ids = Object.keys((await fbGet(env, token, 'hubs_meta', 'shallow=true')) || {}).filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id));
  const people = await loadPeople(env, token);
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        const meta = await fbGet(env, token, `hubs_meta/${id}`);
        if (!meta || typeof meta !== 'object' || meta.active === false) continue;
        out.hubs++;
        await processAnnouncements(env, token, id, meta, people, nowMs, out);
        await processEventAlerts(env, token, id, meta, people, nowMs, out);
        await processNotifyJobs(env, token, id, meta, people, nowMs, out);
      } catch (e) {
        out.errors.push(`${id}: ${String((e && e.message) || e).slice(0, 120)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCHED.hubParallel, queue.length || 1) }, worker));
  if (out.errors.length) console.error('scheduler errors:', out.errors.join(' | '));
  return out;
}

export { mayAdministerHub, normalizeSub, escapeHtml };

// ── Shared helpers ─────────────────────────────────────────────────────────

async function loadGuests(databaseUrl, hubId, accessToken) {
  const hubsToRead = hubId === '_global'
    ? Object.keys(await dbGet(databaseUrl, 'hubs', accessToken) || {})
    : [hubId];
  const guests = [];
  for (const hid of hubsToRead) {
    const data = await dbGet(databaseUrl, `hubs/${hid}/guests`, accessToken);
    if (data) Object.values(data).forEach(g => guests.push(g));
  }
  return guests;
}

function normalizePhone(raw) {
  if (!raw) return null;
  // If already has +, return as-is
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
}

// ── Firebase helpers (unchanged) ───────────────────────────────────────────

// ALLOWED_ORIGIN may list several origins, separated by commas. A request from a listed origin is answered with that origin;
// any other browser origin gets no CORS header and is blocked by the browser. Unset keeps the old wildcard (staging only).
function corsFor(request, env) {
  const base = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  const list = String(env.ALLOWED_ORIGIN || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!list.length || list.includes('*')) return { ...base, 'Access-Control-Allow-Origin': '*' };
  const origin = request.headers.get('Origin') || '';
  return list.includes(origin) ? { ...base, 'Access-Control-Allow-Origin': origin } : base;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function verifyFirebaseIdToken(idToken, projectId) {
  // Any malformed, expired, mis-signed or unverifiable token is "not signed in": it never throws and never passes.
  try {
    if (typeof idToken !== 'string' || idToken.length > 4096 || !projectId) return null;
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    if (!headerB64 || !payloadB64 || !sigB64) return null;
    const header  = JSON.parse(base64UrlDecode(headerB64));
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    if (typeof payload.iat === 'number' && payload.iat > now + 300) return null;
    if (payload.aud !== projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) return null;
    const jwkRes = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    if (!jwkRes.ok) return null;
    const { keys } = await jwkRes.json();
    const jwk = Array.isArray(keys) ? keys.find(k => k.kid === header.kid) : null;
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const data      = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlToBytes(sigB64);
    const valid     = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
    return valid ? payload.sub : null;
  } catch (e) {
    return null;
  }
}

async function getServiceAccountAccessToken(env) {
  const now    = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: [
      'https://www.googleapis.com/auth/firebase.messaging',
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const claimsB64 = base64UrlEncode(JSON.stringify(claims));
  const unsigned  = `${headerB64}.${claimsB64}`;
  const key       = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt       = `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

async function importPrivateKey(pem) {
  const cleaned = pem.replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
  return crypto.subtle.importKey('pkcs8', base64ToBytes(cleaned), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

// A failed read throws. It is never mistaken for "nothing there", which would let a send go ahead on a guess.
async function dbGet(databaseUrl, path, accessToken) {
  const res = await fetch(`${databaseUrl}/${path}.json`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Database read failed (HTTP ${res.status})`);
  return res.json();
}

async function dbDelete(databaseUrl, path, accessToken) {
  await fetch(`${databaseUrl}/${path}.json`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
}

function base64UrlEncode(str)    { return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64UrlDecode(str)    { return atob(str.replace(/-/g, '+').replace(/_/g, '/')); }
function base64UrlToBytes(str)   { const bin = base64UrlDecode(str); return Uint8Array.from(bin, c => c.charCodeAt(0)); }
function bytesToBase64Url(bytes) { let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); }); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64ToBytes(b64)      { const bin = atob(b64); return Uint8Array.from(bin, c => c.charCodeAt(0)); }
