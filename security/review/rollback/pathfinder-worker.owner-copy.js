// ─────────────────────────────────────────────────────────────────────────
// BlueSpot Hub — Path Finder bridge Worker
// ─────────────────────────────────────────────────────────────────────────
// Lets the iConnectHub admin page import and save campground calibration in
// Path Finder. The Path Finder API key lives only here, as a Worker secret;
// the admin page never sees it.
//
// WHAT IT DOES, on every request:
//   1. Checks the request comes from the iConnectHub admin address (ALLOWED_ORIGIN).
//   2. Reads the caller's Firebase ID token from "Authorization: Bearer <token>"
//      and verifies it really belongs to this project.
//   3. Looks up the caller in Realtime Database and requires role === 'super'.
//   4. Forwards the request to Path Finder's API with the secret key.
//
// ROUTES:
//   GET    /maps                       the maps this key can reach
//   POST   /maps                       create a map (body: name, mapImage, mapWidth, mapHeight, centerLat, centerLon, public)
//   PATCH  /maps/:id                   change name or visibility (body: name?, public?)
//   DELETE /maps/:id                   delete a map
//   GET    /maps/:id/calibration       saved calibration for one map
//   PUT    /maps/:id/calibration       save calibration (body: calibration JSON)
//
// Every call goes to Path Finder's embed data endpoint with an emb_ key. A key only reaches
// the maps on its own list, and each action needs the matching grant on the key.
//
// SETUP — same style as the other BlueSpot Workers:
//   Variables (Encrypt the secrets):
//     FIREBASE_PROJECT_ID    = bluespot-hub
//     FIREBASE_CLIENT_EMAIL  = <client_email from the service account JSON>
//     FIREBASE_PRIVATE_KEY   = <private_key from the service account JSON> (secret)
//     DATABASE_URL           = https://bluespot-hub-default-rtdb.firebaseio.com
//     ALLOWED_ORIGIN         = https://<your iConnectHub admin address>
//     PATHFINDER_BASE_URL    = https://<your Path Finder address>
//     PATHFINDER_EMBED_KEY   = emb_… from Path Finder's Embed keys section (secret). Tick every tool it needs.
// ─────────────────────────────────────────────────────────────────────────

const ID = /^[A-Za-z0-9_-]{1,128}$/;

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '';
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (!origin || request.headers.get('Origin') !== origin) {
      return json({ error: 'This page is not allowed to call Path Finder.' }, 403, corsHeaders);
    }
    if (!env.PATHFINDER_EMBED_KEY || !env.PATHFINDER_BASE_URL) {
      return json({ error: 'Path Finder is not configured.' }, 500, corsHeaders);
    }

    try {
      // 1. The caller must be a signed-in iConnectHub super admin.
      const idToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!idToken) return json({ error: 'Sign in again.' }, 401, corsHeaders);
      const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
      if (!callerUid) return json({ error: 'Invalid or expired session. Please sign in again.' }, 401, corsHeaders);

      const accessToken = await getServiceAccountAccessToken(env);
      const callerProfile = await dbGet(env.DATABASE_URL, `users/${callerUid}`, accessToken);
      const isSuperAdmin = !callerProfile || callerProfile.role === 'super';
      if (!isSuperAdmin) return json({ error: 'Only Super Admins can use Path Finder.' }, 403, corsHeaders);

      // 2. Route to Path Finder.
      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean);
      const base = env.PATHFINDER_BASE_URL.replace(/\/$/, '');
      const auth = { Authorization: `Bearer ${env.PATHFINDER_EMBED_KEY}` };
      const target = `${base}/api/embed/data`;
      const bodyText = request.method === 'GET' || request.method === 'DELETE' ? undefined : await request.text();
      if (bodyText && bodyText.length > 900_000) return json({ error: 'That is too large to send.' }, 413, corsHeaders);
      const jsonHeaders = { ...auth, 'Content-Type': 'application/json' };

      // Map list, and creating a map (the new map joins the key).
      if (parts.length === 1 && parts[0] === 'maps') {
        if (request.method === 'GET') return forward(target, { headers: auth }, corsHeaders);
        if (request.method === 'POST') return forward(target, { method: 'POST', headers: jsonHeaders, body: bodyText }, corsHeaders);
      }

      // One map: change it, delete it, or read/save its calibration.
      if (parts[0] === 'maps' && parts.length >= 2) {
        const id = parts[1];
        if (!ID.test(id)) return json({ error: 'Invalid map id.' }, 400, corsHeaders);
        const mapTarget = `${target}?campground=${encodeURIComponent(id)}`;

        if (parts.length === 2) {
          if (request.method === 'GET') return forward(mapTarget, { headers: auth }, corsHeaders);
          if (request.method === 'PATCH') return forward(mapTarget, { method: 'PATCH', headers: jsonHeaders, body: bodyText }, corsHeaders);
          if (request.method === 'DELETE') return forward(mapTarget, { method: 'DELETE', headers: auth }, corsHeaders);
        }
        if (parts.length === 3 && parts[2] === 'calibration') {
          if (request.method === 'GET') return forward(mapTarget, { headers: auth }, corsHeaders);
          if (request.method === 'PUT') {
            // The embed endpoint takes { calibration: ... }; the admin page sends the calibration itself.
            const calibration = JSON.parse(bodyText || 'null');
            return forward(mapTarget, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ calibration }) }, corsHeaders);
          }
        }
      }
      return json({ error: 'Not found.' }, 404, corsHeaders);
    } catch (e) {
      return json({ error: 'Something went wrong. Try again.' }, 500, corsHeaders);
    }
  },
};

/** Passes Path Finder's answer back, status and body. The key is never returned. */
async function forward(target, init, corsHeaders) {
  const res = await fetch(target, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: 'Unexpected answer from Path Finder.' };
  }
  return json(body, res.status, corsHeaders);
}

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Verify a Firebase ID token (same check as the other BlueSpot Workers) ──
async function verifyFirebaseIdToken(idToken, projectId) {
  const [headerB64, payloadB64, sigB64] = idToken.split('.');
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  const header = JSON.parse(base64UrlDecode(headerB64));
  const payload = JSON.parse(base64UrlDecode(payloadB64));

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub) return null;

  const jwkRes = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const { keys } = await jwkRes.json();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlToBytes(sigB64), data);
  if (!valid) return null;

  return payload.sub;
}

// ── Google access token from the service account (read-only Realtime Database scope) ──
async function getServiceAccountAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: ['https://www.googleapis.com/auth/firebase.database', 'https://www.googleapis.com/auth/userinfo.email'].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const key = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token');
  return data.access_token;
}

async function importPrivateKey(pem) {
  const cleaned = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  return crypto.subtle.importKey('pkcs8', base64ToBytes(cleaned), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function dbGet(databaseUrl, path, accessToken) {
  const res = await fetch(`${databaseUrl}/${path}.json`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return res.json();
}

// ── base64url helpers ──
function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlDecode(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}
function base64UrlToBytes(str) {
  return Uint8Array.from(base64UrlDecode(str), (c) => c.charCodeAt(0));
}
function bytesToBase64Url(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
