// ─────────────────────────────────────────────────────────────────────────
// BlueSpot Hub — Password Reset Worker
// ─────────────────────────────────────────────────────────────────────────
//   POST /send-reset    { email }           → sends reset email via Resend
//   POST /verify-reset  { token, password } → validates token, updates password
//
// ENVIRONMENT VARIABLES (Cloudflare Worker → Settings → Variables):
//   FIREBASE_PROJECT_ID   = bluespot-hub                              ✓ set
//   FIREBASE_CLIENT_EMAIL = firebase-adminsdk-fbsvc@bluespot-hub...   ✓ set
//   FIREBASE_PRIVATE_KEY  = -----BEGIN PRIVATE KEY----- ...           ✓ set (Encrypt this one)
//   DATABASE_URL          = https://bluespot-hub-default-rtdb...      ✓ set
//   ALLOWED_ORIGIN        = *                                          ✓ set
//   RESEND_API_KEY        = re_PpeJCSZs_...                           ✓ set
//   RESEND_FROM_EMAIL     = noreply@send.bluespotconnect.com          ✓ set
//   RESEND_SENDER_NAME    = BlueSpot                                  ✓ set
//   RESET_PAGE_URL        = https://YOURSITE.com/reset-password.html  ← ADD THIS
// ─────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders);

    const url = new URL(request.url);

    try {
      if (url.pathname === '/send-reset') {
        return await handleSendReset(request, env, corsHeaders);
      }
      if (url.pathname === '/verify-reset') {
        return await handleVerifyReset(request, env, corsHeaders);
      }
      if (url.pathname === '/send-guest-reset') {
        return await handleSendGuestReset(request, env, corsHeaders);
      }
      if (url.pathname === '/verify-guest-reset') {
        return await handleVerifyGuestReset(request, env, corsHeaders);
      }
      if (url.pathname === '/send-guest-code') {
        return await handleSendGuestCode(request, env, corsHeaders);
      }
      if (url.pathname === '/verify-guest-code') {
        return await handleVerifyGuestCode(request, env, corsHeaders);
      }
      if (url.pathname === '/set-guest-password') {
        return await handleSetGuestPassword(request, env, corsHeaders);
      }
      if (url.pathname === '/guest-login') {
        return await handleGuestLogin(request, env, corsHeaders);
      }
      return json({ error: 'Not found' }, 404, corsHeaders);
    } catch (err) {
      return json({ error: err.message || String(err) }, 500, corsHeaders);
    }
  },
};

// ── POST /send-reset ──────────────────────────────────────────────────────
async function handleSendReset(request, env, corsHeaders) {
  const { email } = await request.json();
  if (!email) return json({ error: 'Email is required.' }, 400, corsHeaders);

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    return json({ error: 'Email service not configured.' }, 500, corsHeaders);
  }

  // Verify the email exists in Firebase Auth before sending anything.
  const accessToken = await getServiceAccountAccessToken(env);
  const uid = await lookupUidByEmail(env.FIREBASE_PROJECT_ID, email, accessToken);
  const requesterHubId = uid ? await dbGet(env.DATABASE_URL, `users/${uid}/hubId`, accessToken) : null;
  // Always return success to prevent email enumeration — don't tell the caller if the account exists.
  if (!uid) return json({ ok: true }, 200, corsHeaders);

  // Generate a cryptographically random token (UUID).
  const token = crypto.randomUUID();
  const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  // Store in Firebase DB: passwordResets/{token}
  await dbSet(env.DATABASE_URL, `passwordResets/${token}`, { email, uid, expires }, accessToken);

  const resetUrl = `${env.RESET_PAGE_URL || 'https://yourdomain.com/reset-password.html'}?token=${token}`;
  const senderName = env.RESEND_SENDER_NAME || 'BlueSpot Hub';

  const emailBody = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#1a1d27;border-radius:12px;padding:40px;border:1px solid #2a2d3a;">
        <tr><td align="center" style="padding-bottom:28px;">
          <div style="font-size:28px;font-weight:800;color:#4fa3e8;letter-spacing:-0.5px;">BlueSpot Hub</div>
        </td></tr>
        <tr><td>
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f0f2f8;">Reset your password</p>
          <p style="margin:0 0 24px;font-size:15px;color:#8b90a8;line-height:1.6;">
            We received a request to reset the password for your account (<strong style="color:#c0c4d8;">${email}</strong>).
            Click the button below to set a new password. This link expires in <strong style="color:#c0c4d8;">1 hour</strong>.
          </p>
          <a href="${resetUrl}" style="display:inline-block;background:#4fa3e8;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;margin-bottom:28px;">
            Reset Password
          </a>
          <p style="margin:0 0 8px;font-size:13px;color:#5a5f75;line-height:1.6;">
            Or copy and paste this link into your browser:
          </p>
          <p style="margin:0 0 24px;font-size:12px;color:#4fa3e8;word-break:break-all;">${resetUrl}</p>
          <hr style="border:none;border-top:1px solid #2a2d3a;margin:0 0 20px;">
          <p style="margin:0;font-size:12px;color:#5a5f75;line-height:1.6;">
            If you didn't request this, you can safely ignore this email — your password won't change.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${senderName} <${env.RESEND_FROM_EMAIL}>`,
      to: [email],
      subject: 'Reset your password',
      html: emailBody,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Failed to send email: ' + (err?.message || res.status));
  }

  // Optional copy of the SAME reset link to the hub's configured notify
  // email — lets a manager who doesn't have access to the account's own
  // inbox (e.g. resetting a shared/front-desk login) still complete the
  // reset themselves. Configured per-hub in the admin panel's Settings tab
  // by that hub's own manager, so it's trusted at the same level as the
  // account owner; failure here must never block the real reset email above.
  if (requesterHubId) {
    await notifyPasswordResetRequested(env, requesterHubId, email, senderName, resetUrl).catch(() => {});
  }

  return json({ ok: true }, 200, corsHeaders);
}

// ── Copy of the reset link to a hub's configured notify address ──────────
async function notifyPasswordResetRequested(env, hubId, requestedForEmail, senderName, resetUrl) {
  const accessToken = await getServiceAccountAccessToken(env);
  const settings = await dbGet(env.DATABASE_URL, `hubs/${hubId}/settings/passwordResetNotify`, accessToken);
  if (!settings || !settings.enabled || !settings.email) return;

  const when = new Date().toUTCString();
  const notifyBody = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#1a1d27;border-radius:12px;padding:40px;border:1px solid #2a2d3a;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f0f2f8;">Password reset requested for another account</p>
          <p style="margin:0 0 16px;font-size:13px;color:#e8a33d;line-height:1.6;">
            This is not a reset link for your own login — you're receiving a copy because you're the configured
            notification contact for this property.
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#8b90a8;line-height:1.6;">
            <strong style="color:#c0c4d8;">${requestedForEmail}</strong> requested a password reset on the admin panel
            at ${when}. Use the button below to set a new password for that account. This link expires in
            <strong style="color:#c0c4d8;">1 hour</strong>.
          </p>
          <a href="${resetUrl}" style="display:inline-block;background:#4fa3e8;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;margin-bottom:28px;">
            Reset Password
          </a>
          <p style="margin:0 0 8px;font-size:13px;color:#5a5f75;line-height:1.6;">
            Or copy and paste this link into your browser:
          </p>
          <p style="margin:0;font-size:12px;color:#4fa3e8;word-break:break-all;">${resetUrl}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${senderName} <${env.RESEND_FROM_EMAIL}>`,
      to: [settings.email],
      subject: `Copy: password reset for ${requestedForEmail} (not your account)`,
      html: notifyBody,
    }),
  });
}

// ── POST /verify-reset ────────────────────────────────────────────────────
async function handleVerifyReset(request, env, corsHeaders) {
  const { token, password } = await request.json();
  if (!token || !password) return json({ error: 'Missing token or password.' }, 400, corsHeaders);
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400, corsHeaders);

  const accessToken = await getServiceAccountAccessToken(env);

  // Read the reset record from Firebase DB.
  const record = await dbGet(env.DATABASE_URL, `passwordResets/${token}`, accessToken);
  if (!record) return json({ error: 'Reset link is invalid or has already been used.' }, 400, corsHeaders);

  const now = Math.floor(Date.now() / 1000);
  if (record.expires < now) {
    // Clean up expired token.
    await dbDelete(env.DATABASE_URL, `passwordResets/${token}`, accessToken).catch(() => {});
    return json({ error: 'Reset link has expired. Please request a new one.' }, 400, corsHeaders);
  }

  // Update the user's password in Firebase Auth.
  await updateAuthUserPassword(env.FIREBASE_PROJECT_ID, record.uid, password, accessToken);

  // Delete the token so it can't be reused.
  await dbDelete(env.DATABASE_URL, `passwordResets/${token}`, accessToken).catch(() => {});

  return json({ ok: true }, 200, corsHeaders);
}

// ── POST /send-guest-reset ────────────────────────────────────────────────
// Resets the PASSWORD ON THE GLOBAL GUEST RECORD (guests/{guestId}/passwordHash)
// — the same field /guest-login checks — so a completed reset actually fixes
// the guest's real cross-property login. hubId is only used to build the
// email's reset link back to the hub the guest requested from; the lookup
// itself is global via guestsByEmail, same as /send-guest-code.
async function handleSendGuestReset(request, env, corsHeaders) {
  const { hubId, email, hubUrl } = await request.json();
  if (!hubId || !email || !hubUrl) return json({ error: 'Missing hubId, email, or hubUrl.' }, 400, corsHeaders);

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    return json({ error: 'Email service not configured.' }, 500, corsHeaders);
  }

  const accessToken = await getServiceAccountAccessToken(env);
  const emailNormalized = String(email).toLowerCase().trim();

  const guestId = await dbGet(env.DATABASE_URL, `guestsByEmail/${emailKeyOf(emailNormalized)}`, accessToken);
  // Always return success to prevent email enumeration.
  if (!guestId) return json({ ok: true }, 200, corsHeaders);

  const token = crypto.randomUUID();
  const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  await dbSet(env.DATABASE_URL, `guestPasswordResets/${token}`, { guestId, email: emailNormalized, expires }, accessToken);

  const resetUrl = `${hubUrl}${hubUrl.includes('?') ? '&' : '?'}resetToken=${token}`;
  const senderName = env.RESEND_SENDER_NAME || 'BlueSpot Hub';

  const emailBody = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#1a1d27;border-radius:12px;padding:40px;border:1px solid #2a2d3a;">
        <tr><td align="center" style="padding-bottom:28px;">
          <div style="font-size:28px;font-weight:800;color:#4fa3e8;letter-spacing:-0.5px;">${senderName}</div>
        </td></tr>
        <tr><td>
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f0f2f8;">Reset your password</p>
          <p style="margin:0 0 24px;font-size:15px;color:#8b90a8;line-height:1.6;">
            We received a request to reset the password for your guest account (<strong style="color:#c0c4d8;">${emailNormalized}</strong>).
            Click the button below to set a new password. This link expires in <strong style="color:#c0c4d8;">1 hour</strong>.
          </p>
          <a href="${resetUrl}" style="display:inline-block;background:#4fa3e8;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;margin-bottom:28px;">
            Reset Password
          </a>
          <p style="margin:0 0 8px;font-size:13px;color:#5a5f75;line-height:1.6;">
            Or copy and paste this link into your browser:
          </p>
          <p style="margin:0 0 24px;font-size:12px;color:#4fa3e8;word-break:break-all;">${resetUrl}</p>
          <hr style="border:none;border-top:1px solid #2a2d3a;margin:0 0 20px;">
          <p style="margin:0;font-size:12px;color:#5a5f75;line-height:1.6;">
            If you didn't request this, you can safely ignore this email — your password won't change.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${senderName} <${env.RESEND_FROM_EMAIL}>`,
      to: [emailNormalized],
      subject: 'Reset your password',
      html: emailBody,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Failed to send email: ' + (err?.message || res.status));
  }

  return json({ ok: true }, 200, corsHeaders);
}

// ── POST /verify-guest-reset ──────────────────────────────────────────────
async function handleVerifyGuestReset(request, env, corsHeaders) {
  const { token, passwordHash } = await request.json();
  if (!token || !passwordHash) return json({ error: 'Missing token or passwordHash.' }, 400, corsHeaders);

  const accessToken = await getServiceAccountAccessToken(env);

  const record = await dbGet(env.DATABASE_URL, `guestPasswordResets/${token}`, accessToken);
  if (!record) return json({ error: 'Reset link is invalid or has already been used.' }, 400, corsHeaders);

  const now = Math.floor(Date.now() / 1000);
  if (record.expires < now) {
    await dbDelete(env.DATABASE_URL, `guestPasswordResets/${token}`, accessToken).catch(() => {});
    return json({ error: 'Reset link has expired. Please request a new one.' }, 400, corsHeaders);
  }

  // The password itself is never sent to the worker — the guest hub hashes it
  // client-side the same way it does at registration, we just store the hash.
  // Same field /guest-login checks, so this fixes login on every property.
  await dbSet(env.DATABASE_URL, `guests/${record.guestId}/passwordHash`, passwordHash, accessToken);
  await dbDelete(env.DATABASE_URL, `guestPasswordResets/${token}`, accessToken).catch(() => {});

  return json({ ok: true }, 200, corsHeaders);
}

// ─────────────────────────────────────────────────────────────────────────
// PASSWORDLESS GUEST IDENTITY — global guests/{guestId}, one record per
// PERSON (not per property). A property visit becomes a guestStays/{propertyId}/
// {guestId} record, and hubs/{propertyId}/guests/{guestId} is still written
// as before (same key) so the existing admin panel, guest chat, and push
// subscription code — all keyed on that per-hub guest doc — keep working
// completely unchanged. This endpoint pair replaces the password field in
// the guest hub's registration/login flow with a 6-digit emailed code:
//
//   POST /send-guest-code   { email, propertyId, propertyName,
//                              firstName?, lastName?, phone?,
//                              arrivalDate?, departureDate? }
//     - Unknown email + no name fields  → { ok:true, needsInfo:true }
//       (client should show the name/phone fields, then call this again)
//     - Otherwise                       → emails a 6-digit code, returns
//                                          { ok:true, guestId, isNewGuest }
//
//   POST /verify-guest-code { guestId, code }
//     - Confirms the code, creates/updates guests/{guestId}, the email/phone
//       lookup indexes, guestStays/{propertyId}/{guestId}, and the legacy
//       hubs/{propertyId}/guests/{guestId} doc. Returns the guest profile.
// ─────────────────────────────────────────────────────────────────────────

function emailKeyOf(email) {
  // RTDB keys can't contain '.', '#', '$', '[', ']', '/'
  return String(email).toLowerCase().trim().replace(/[.#$\[\]\/]/g, ',');
}

function generateGuestId() {
  return 'guest_' + crypto.randomUUID().replace(/-/g, '');
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendGuestCodeEmail(env, email, code, propertyName) {
  const senderName = env.RESEND_SENDER_NAME || 'BlueSpot Hub';
  const emailBody = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#1a1d27;border-radius:12px;padding:40px;border:1px solid #2a2d3a;">
        <tr><td align="center" style="padding-bottom:28px;">
          <div style="font-size:28px;font-weight:800;color:#4fa3e8;letter-spacing:-0.5px;">${senderName}</div>
        </td></tr>
        <tr><td>
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f0f2f8;">Your verification code</p>
          <p style="margin:0 0 24px;font-size:15px;color:#8b90a8;line-height:1.6;">
            ${propertyName ? `Confirm your stay at <strong style="color:#c0c4d8;">${propertyName}</strong> with this code. ` : ''}It expires in <strong style="color:#c0c4d8;">10 minutes</strong>.
          </p>
          <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#4fa3e8;text-align:center;padding:20px 0;background:#0f1117;border-radius:8px;margin-bottom:24px;">${code}</div>
          <hr style="border:none;border-top:1px solid #2a2d3a;margin:0 0 20px;">
          <p style="margin:0;font-size:12px;color:#5a5f75;line-height:1.6;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${senderName} <${env.RESEND_FROM_EMAIL}>`,
      to: [email],
      subject: `Your verification code: ${code}`,
      html: emailBody,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Failed to send email: ' + (err?.message || res.status));
  }
}

// ── POST /send-guest-code ─────────────────────────────────────────────────
async function handleSendGuestCode(request, env, corsHeaders) {
  const { email, propertyId, propertyName, firstName, lastName, phone, arrivalDate, departureDate, siteNumber } = await request.json();
  if (!email || !propertyId) return json({ error: 'Missing email or propertyId.' }, 400, corsHeaders);
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    return json({ error: 'Email service not configured.' }, 500, corsHeaders);
  }

  const accessToken = await getServiceAccountAccessToken(env);
  const emailNormalized = String(email).toLowerCase().trim();
  const eKey = emailKeyOf(emailNormalized);

  let guestId = await dbGet(env.DATABASE_URL, `guestsByEmail/${eKey}`, accessToken);
  const isNewGuest = !guestId;

  // Unknown email with no name supplied — this is a "Welcome back" login
  // attempt for an email we don't recognize. Tell the client to collect
  // name/phone and resubmit as a registration, instead of silently emailing
  // a code tied to no usable profile.
  if (isNewGuest && (!firstName || !lastName)) {
    return json({ ok: true, needsInfo: true }, 200, corsHeaders);
  }

  if (!guestId) guestId = generateGuestId();

  const code = generateSixDigitCode();
  const codeHash = await sha256Hex(code);
  const expires = Math.floor(Date.now() / 1000) + 600; // 10 minutes

  await dbSet(env.DATABASE_URL, `guests/${guestId}/pendingCode`, {
    codeHash, expires,
    email: emailNormalized,
    firstName: firstName || null,
    lastName: lastName || null,
    phone: phone || null,
    propertyId, propertyName: propertyName || propertyId,
    arrivalDate: arrivalDate || null,
    departureDate: departureDate || null,
    siteNumber: siteNumber || null,
    isNewGuest,
  }, accessToken);

  await sendGuestCodeEmail(env, emailNormalized, code, propertyName);

  return json({ ok: true, guestId, isNewGuest }, 200, corsHeaders);
}

// ── POST /verify-guest-code ───────────────────────────────────────────────
async function handleVerifyGuestCode(request, env, corsHeaders) {
  const { guestId, code } = await request.json();
  if (!guestId || !code) return json({ error: 'Missing guestId or code.' }, 400, corsHeaders);

  const accessToken = await getServiceAccountAccessToken(env);
  const pending = await dbGet(env.DATABASE_URL, `guests/${guestId}/pendingCode`, accessToken);
  if (!pending) return json({ error: 'Code expired or already used. Please request a new one.' }, 400, corsHeaders);

  const now = Math.floor(Date.now() / 1000);
  if (pending.expires < now) {
    await dbDelete(env.DATABASE_URL, `guests/${guestId}/pendingCode`, accessToken).catch(() => {});
    return json({ error: 'Code has expired. Please request a new one.' }, 400, corsHeaders);
  }
  const codeHash = await sha256Hex(String(code).trim());
  if (codeHash !== pending.codeHash) return json({ error: 'Incorrect code.' }, 400, corsHeaders);

  const nowIso = new Date().toISOString();
  const existingGuest = await dbGet(env.DATABASE_URL, `guests/${guestId}`, accessToken) || {};
  const mergedGuest = {
    firstName: pending.firstName || existingGuest.firstName || '',
    lastName: pending.lastName || existingGuest.lastName || '',
    email: pending.email,
    phone: pending.phone || existingGuest.phone || '',
    emailVerified: true,
    createdAt: existingGuest.createdAt || nowIso,
    lastLoginAt: nowIso,
    // dbSet below is a full PUT — omitting this would silently delete a
    // password the guest already set (via /set-guest-password) every time
    // they log back in with an emailed code instead.
    passwordHash: existingGuest.passwordHash || null,
  };
  // Strip the transient pendingCode before persisting the merged profile —
  // dbSet is a PUT (full overwrite) so it must never be echoed back in.
  await dbSet(env.DATABASE_URL, `guests/${guestId}`, mergedGuest, accessToken);
  await dbSet(env.DATABASE_URL, `guestsByEmail/${emailKeyOf(mergedGuest.email)}`, guestId, accessToken);
  if (mergedGuest.phone) {
    const phoneDigits = mergedGuest.phone.replace(/\D/g, '');
    if (phoneDigits) await dbSet(env.DATABASE_URL, `guestsByPhone/${phoneDigits}`, guestId, accessToken);
  }

  if (pending.propertyId) {
    // A later "Welcome Back" login never collects stay dates — without this
    // fallback to the existing stay, that later verify would blindly
    // overwrite (dbSet is a full PUT) whatever dates were saved during the
    // guest's original "Set Up My Stay" registration with nulls, silently
    // wiping data every time the guest just logs back in.
    const existingStay = await dbGet(env.DATABASE_URL, `guestStays/${pending.propertyId}/${guestId}`, accessToken) || {};
    const stayDetails = {
      arrivalDate: pending.arrivalDate || existingStay.arrivalDate || null,
      departureDate: pending.departureDate || existingStay.departureDate || null,
      siteNumber: pending.siteNumber || existingStay.siteNumber || null,
    };
    await dbSet(env.DATABASE_URL, `guestStays/${pending.propertyId}/${guestId}`, {
      ...stayDetails,
      registeredAt: existingStay.registeredAt || nowIso,
      source: existingStay.source || 'onboarding',
    }, accessToken);

    // Dual-write into the legacy per-hub shape, keyed by the SAME guestId,
    // so the admin panel's guest list, guest chat (sessionId === guest key),
    // and push-subscription attach code all keep working with zero changes.
    const existingLegacy = await dbGet(env.DATABASE_URL, `hubs/${pending.propertyId}/guests/${guestId}`, accessToken) || {};
    await dbSet(env.DATABASE_URL, `hubs/${pending.propertyId}/guests/${guestId}`, {
      ...existingLegacy,
      firstName: mergedGuest.firstName,
      lastName: mergedGuest.lastName,
      phone: mergedGuest.phone.replace(/\D/g, ''),
      email: mergedGuest.email,
      location: pending.propertyName || pending.propertyId,
      hubId: pending.propertyId,
      anonymous: false,
      registeredAt: existingLegacy.registeredAt || nowIso,
      arrivalDate: stayDetails.arrivalDate,
      departureDate: stayDetails.departureDate,
      siteNumber: stayDetails.siteNumber,
    }, accessToken);
    await dbSet(env.DATABASE_URL, `hubs/${pending.propertyId}/guests/${guestId}/stayDetails`, stayDetails, accessToken);
  }

  await dbDelete(env.DATABASE_URL, `guests/${guestId}/pendingCode`, accessToken).catch(() => {});

  return json({
    ok: true,
    guestId,
    firstName: mergedGuest.firstName,
    lastName: mergedGuest.lastName,
    email: mergedGuest.email,
    phone: mergedGuest.phone,
    isNewGuest: !!pending.isNewGuest,
    hasPassword: !!mergedGuest.passwordHash,
  }, 200, corsHeaders);
}

// ── POST /set-guest-password ──────────────────────────────────────────────
// Called once, right after a guest verifies their emailed code for the
// FIRST time — lets every later login on ANY property use email+password
// instead of another emailed code. guestId itself is the proof of identity
// here (same trust level the rest of this flow already gives it — it's the
// same value stored as the guest's session token client-side), so no
// separate re-auth step is needed beyond having just completed the code
// verification that produced it.
async function handleSetGuestPassword(request, env, corsHeaders) {
  const { guestId, passwordHash } = await request.json();
  if (!guestId || !passwordHash) return json({ error: 'Missing guestId or passwordHash.' }, 400, corsHeaders);

  const accessToken = await getServiceAccountAccessToken(env);
  const guest = await dbGet(env.DATABASE_URL, `guests/${guestId}`, accessToken);
  if (!guest) return json({ error: 'Guest not found.' }, 404, corsHeaders);

  await dbSet(env.DATABASE_URL, `guests/${guestId}/passwordHash`, passwordHash, accessToken);
  return json({ ok: true }, 200, corsHeaders);
}

// ── POST /guest-login ─────────────────────────────────────────────────────
// Password login for a guest who already set a password (see
// /set-guest-password above) — works on ANY property since guests/{guestId}
// is global. Guests who registered before this feature existed have no
// passwordHash yet; the client falls back to the emailed-code flow in that
// case (signaled here via needsCode:true) and prompts them to set one.
async function handleGuestLogin(request, env, corsHeaders) {
  const { email, passwordHash, propertyId, propertyName } = await request.json();
  if (!email || !passwordHash || !propertyId) {
    return json({ error: 'Missing email, passwordHash, or propertyId.' }, 400, corsHeaders);
  }

  const accessToken = await getServiceAccountAccessToken(env);
  const emailNormalized = String(email).toLowerCase().trim();
  const guestId = await dbGet(env.DATABASE_URL, `guestsByEmail/${emailKeyOf(emailNormalized)}`, accessToken);
  if (!guestId) return json({ error: 'No account found for that email.', needsCode: true }, 400, corsHeaders);

  const guest = await dbGet(env.DATABASE_URL, `guests/${guestId}`, accessToken);
  if (!guest || !guest.passwordHash) {
    return json({ error: 'No password set for this account yet.', needsCode: true }, 400, corsHeaders);
  }
  if (passwordHash !== guest.passwordHash) return json({ error: 'Incorrect password.' }, 400, corsHeaders);

  const nowIso = new Date().toISOString();
  await dbSet(env.DATABASE_URL, `guests/${guestId}/lastLoginAt`, nowIso, accessToken);

  // Same dual-write /verify-guest-code does, so a password login is
  // indistinguishable from a code login to the admin panel, guest chat, and
  // push-subscription code — all still keyed on hubs/{propertyId}/guests/{guestId}.
  const existingStay = await dbGet(env.DATABASE_URL, `guestStays/${propertyId}/${guestId}`, accessToken) || {};
  await dbSet(env.DATABASE_URL, `guestStays/${propertyId}/${guestId}`, {
    ...existingStay,
    registeredAt: existingStay.registeredAt || nowIso,
    source: existingStay.source || 'login',
  }, accessToken);

  const existingLegacy = await dbGet(env.DATABASE_URL, `hubs/${propertyId}/guests/${guestId}`, accessToken) || {};
  await dbSet(env.DATABASE_URL, `hubs/${propertyId}/guests/${guestId}`, {
    ...existingLegacy,
    firstName: guest.firstName,
    lastName: guest.lastName,
    phone: guest.phone,
    email: guest.email,
    location: propertyName || propertyId,
    hubId: propertyId,
    anonymous: false,
    registeredAt: existingLegacy.registeredAt || nowIso,
  }, accessToken);

  return json({
    ok: true,
    guestId,
    firstName: guest.firstName,
    lastName: guest.lastName,
    email: guest.email,
    phone: guest.phone,
    isNewGuest: false,
  }, 200, corsHeaders);
}

// ── Identity Toolkit: look up UID by email ────────────────────────────────
async function lookupUidByEmail(projectId, email, accessToken) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: [email] }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.users?.[0]?.localId || null;
}

// ── Identity Toolkit: set a new password ──────────────────────────────────
async function updateAuthUserPassword(projectId, uid, newPassword, accessToken) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ localId: uid, password: newPassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error('Failed to update password: ' + (body?.error?.message || res.status));
  }
}

// ── Realtime Database REST helpers ────────────────────────────────────────
async function dbGet(databaseUrl, path, accessToken) {
  const res = await fetch(`${databaseUrl}/${path}.json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}
async function dbSet(databaseUrl, path, data, accessToken) {
  await fetch(`${databaseUrl}/${path}.json`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
async function dbDelete(databaseUrl, path, accessToken) {
  await fetch(`${databaseUrl}/${path}.json`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// ── Mint a Google OAuth2 access token from the service account ────────────
async function getServiceAccountAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: [
      'https://www.googleapis.com/auth/identitytoolkit',
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const claimsB64 = base64UrlEncode(JSON.stringify(claims));
  const unsigned = `${headerB64}.${claimsB64}`;

  const key = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;

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
  const cleaned = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryDer = base64ToBytes(cleaned);
  return crypto.subtle.importKey(
    'pkcs8', binaryDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
}

// ── base64url helpers ─────────────────────────────────────────────────────
function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytesToBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
