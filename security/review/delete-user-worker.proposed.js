// ─────────────────────────────────────────────────────────────────────────
// BlueSpot Hub — "Delete User" Cloudflare Worker
// ─────────────────────────────────────────────────────────────────────────
// Does the same job the Firebase Cloud Function would have done, but runs
// on Cloudflare's free tier (no credit card required) instead of Firebase's
// paid Blaze plan. Talks to Google's REST APIs directly using a Firebase
// service account, since the firebase-admin Node SDK can't run in the
// Workers runtime.
//
// WHAT IT DOES, step by step, on every request:
//   1. Reads { uid, idToken } from the POST body.
//   2. Verifies idToken really is a valid, unexpired Firebase ID token for
//      THIS project (so randos can't call this endpoint).
//   3. Looks up the calling user's profile in Realtime Database and checks
//      role === 'super' (all hubs) or role === 'super_manager' (their own
//      hub only, verified against the target user's hubId) — only these two
//      roles may delete/manage other users.
//   4. Mints a Google OAuth2 access token from the service account
//      (JWT signed with the service account's private key via Web Crypto).
//   5. Uses that access token to delete the target user from Firebase Auth
//      (Identity Toolkit REST API) and from Realtime Database.
//
// REVIEW COPY (F-01). Differences from the original, each marked "CHANGED":
//   - A caller with no profile is no longer treated as Super Admin.
//   - Deactivated callers (active === false) are refused.
//   - uid must look like a Firebase uid (no "/", "..", etc.), so it cannot reach other DB paths.
//   - Password rule matches the admin app (10 to 128 characters).
//   - Every successful change writes an audit entry; unexpected errors are not echoed to the caller.
//   - Optional OWNER_UID variable: a single break-glass Super Admin uid for an owner who has no
//     profile yet. Leave it unset once the owner's users/{uid}.role is "super".
// NOT DEPLOYED. Needs the owner's review and a test on a staging worker first.
//
// SETUP — done once, entirely through web dashboards, no CLI:
//
//  A) Get a Firebase service account (free on the Spark/no-cost plan):
//     Firebase Console → ⚙️ Project Settings → Service Accounts →
//     "Generate new private key" → downloads a JSON file. You'll need
//     three values out of it for step B: project_id, client_email,
//     private_key.
//
//  B) Create the Worker on Cloudflare (free, no card):
//     1. Go to https://dash.cloudflare.com → sign up/log in (just email).
//     2. Workers & Pages → Create → "Create Worker" → give it a name,
//        e.g. "bluespot-delete-user" → Deploy (deploys a placeholder).
//     3. Click "Edit code" (the Quick Edit web editor) → delete everything
//        in the editor → paste in this entire file → Save and Deploy.
//     4. Go to the Worker's Settings → Variables → "Add variable" for each
//        of these (click "Encrypt" for the private key so it's a secret):
//          FIREBASE_PROJECT_ID   = bluespot-hub
//          FIREBASE_CLIENT_EMAIL = <client_email from the JSON file>
//          FIREBASE_PRIVATE_KEY  = <private_key from the JSON file,
//                                   pasted exactly as-is, including the
//                                   -----BEGIN PRIVATE KEY----- lines
//                                   and \n sequences>
//          DATABASE_URL          = https://bluespot-hub-default-rtdb.firebaseio.com
//          ALLOWED_ORIGIN        = * (or your GHL domain, e.g.
//                                   https://yourdomain.com, once you know it)
//     5. Save. Your Worker now lives at a URL like:
//          https://bluespot-delete-user.<your-subdomain>.workers.dev
//        Copy that URL — you'll paste it into adminpanel.html's
//        DELETE_USER_WORKER_URL constant.
// ─────────────────────────────────────────────────────────────────────────


// Values pasted into a dashboard often carry a trailing space or line break, which silently breaks a URL or a project id
// ("Invalid URL: …firebaseio.com /users/…", or a 401 because the id no longer matches). Clean every variable once, at the door.
function cleanEnv(env) {
  if (!env || typeof env !== 'object') return env
  const out = { ...env }
  for (const k of Object.keys(out)) if (typeof out[k] === 'string') out[k] = out[k].trim()
  if (typeof out.DATABASE_URL === 'string') out.DATABASE_URL = out.DATABASE_URL.replace(/\s+/g, '').replace(/\/+$/, '')
  return out
}

export default {
  async fetch(request, rawEnv) {
    const env = cleanEnv(rawEnv)
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    try {
      const { uid, idToken, action, newPassword } = await request.json();
      if (!uid || !idToken) {
        return json({ error: 'Missing uid or idToken' }, 400, corsHeaders);
      }
      // CHANGED: the uid is placed into database and API paths, so it must be a plain id.
      if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) || typeof idToken !== 'string') {
        return json({ error: 'Invalid user id.' }, 400, corsHeaders);
      }
      if (action !== undefined && action !== 'updatePassword' && action !== 'delete') {
        return json({ error: 'Unknown action.' }, 400, corsHeaders);
      }

      // 1. Verify the caller's Firebase ID token.
      const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
      if (!callerUid) {
        return json({ error: 'Invalid or expired session. Please sign in again.' }, 401, corsHeaders);
      }

      // 2. Get a Google access token for the service account.
      const accessToken = await getServiceAccountAccessToken(env);

      // 3. Confirm the caller is allowed to manage users.
      // CHANGED: an explicit role is required. A caller with no profile used to count as Super Admin,
      // which let any signed-in account (open sign-up) delete users or reset passwords.
      const callerProfile = await dbGet(env.DATABASE_URL, `users/${callerUid}`, accessToken);
      if (callerProfile && callerProfile.active === false) {
        return json({ error: 'This account is deactivated.' }, 403, corsHeaders);
      }
      const isOwnerBreakGlass = !callerProfile && !!env.OWNER_UID && env.OWNER_UID === callerUid;
      const isSuperAdmin = isOwnerBreakGlass || callerProfile?.role === 'super';
      // Super Managers get the same user-management ability as a Super Admin,
      // but strictly scoped to their own hub — verified below against the
      // TARGET user's profile, not just trusted from the client.
      const isSuperManager = !isSuperAdmin && callerProfile?.role === 'super_manager';
      if (!isSuperAdmin && !isSuperManager) {
        return json({ error: 'Only Super Admins and Super Managers can manage users.' }, 403, corsHeaders);
      }

      if (isSuperManager) {
        const targetProfile = await dbGet(env.DATABASE_URL, `users/${uid}`, accessToken);
        if (!targetProfile) {
          return json({ error: 'User not found.' }, 404, corsHeaders);
        }
        if (targetProfile.role === 'super' || targetProfile.hubId !== callerProfile.hubId) {
          return json({ error: 'Super Managers can only manage accounts on their own hub.' }, 403, corsHeaders);
        }
      }

      // ── Change password action ──
      if (action === 'updatePassword') {
        // CHANGED: same rule as the admin app (was 6 characters).
        if (typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128) {
          return json({ error: 'Password must be 10 to 128 characters.' }, 400, corsHeaders);
        }
        await updateAuthUserPassword(env.FIREBASE_PROJECT_ID, uid, newPassword, accessToken);
        await audit(env, accessToken, callerUid, callerProfile, uid, 'user.password', 'Password changed');
        return json({ success: true }, 200, corsHeaders);
      }

      // ── Default action: delete user ──
      if (callerUid === uid) {
        return json({ error: "You can't delete your own account this way." }, 400, corsHeaders);
      }

      // 4. Delete the DB profile.
      await dbDelete(env.DATABASE_URL, `users/${uid}`, accessToken);

      // 5. Delete the Auth account (ignore "not found" — already gone is fine).
      await deleteAuthUser(env.FIREBASE_PROJECT_ID, uid, accessToken);
      await audit(env, accessToken, callerUid, callerProfile, uid, 'user.delete', 'User deleted');

      return json({ success: true }, 200, corsHeaders);
    } catch (err) {
      // CHANGED: details go to the worker log, not to the caller.
      console.error('delete-user-worker error:', err && err.message ? err.message : String(err));
      return json({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }
  },
};

// CHANGED: best-effort audit trail (the service account bypasses database rules, so this always lands).
async function audit(env, accessToken, callerUid, callerProfile, targetUid, action, summary) {
  try {
    const hub = (callerProfile && typeof callerProfile.hubId === 'string' && /^[A-Za-z0-9_-]+$/.test(callerProfile.hubId)) ? callerProfile.hubId : '_global';
    const at = Date.now();
    const month = new Date(at).toISOString().slice(0, 7);
    const key = 'w' + at + Math.random().toString(36).slice(2, 6);
    await fetch(`${env.DATABASE_URL}/hubs/${hub}/audit/${month}/${key}.json`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ at, by: callerUid, action, summary: `${summary} (${targetUid})` }),
    });
  } catch (e) { /* never block the action on logging */ }
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ── Verify a Firebase ID token using Google's public JWK set ──
async function verifyFirebaseIdToken(idToken, projectId) {
  // Any malformed, expired, mis-signed or unverifiable token is "not signed in": it never throws and never passes.
  try {
    if (typeof idToken !== 'string' || idToken.length > 4096 || !projectId) return null;
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    if (!headerB64 || !payloadB64 || !sigB64) return null;
    const header = JSON.parse(base64UrlDecode(headerB64));
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
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlToBytes(sigB64);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
    return valid ? payload.sub : null;
  } catch (e) {
    return null;
  }
}

// ── Mint a Google OAuth2 access token from the service account ──
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

// ── Realtime Database REST helpers ──
async function dbGet(databaseUrl, path, accessToken) {
  const res = await fetch(`${databaseUrl}/${path}.json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // A failed read throws. It is never mistaken for "nothing there".
  if (!res.ok) throw new Error(`Database read failed (HTTP ${res.status})`);
  return res.json();
}
async function dbDelete(databaseUrl, path, accessToken) {
  await fetch(`${databaseUrl}/${path}.json`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// ── Identity Toolkit REST: delete an Auth user ──
async function deleteAuthUser(projectId, uid, accessToken) {
  const res = await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + projectId + '/accounts:delete', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ localId: uid }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message || '';
    if (!message.includes('USER_NOT_FOUND')) {
      throw new Error('Failed to delete Auth user: ' + message);
    }
  }
}

// ── Identity Toolkit REST: set a new password for an Auth user ──
async function updateAuthUserPassword(projectId, uid, newPassword, accessToken) {
  const res = await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + projectId + '/accounts:update', {
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

// ── base64url helpers ──
function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlDecode(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}
function base64UrlToBytes(str) {
  const bin = base64UrlDecode(str);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function bytesToBase64Url(bytes) {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
