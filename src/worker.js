// =============================================================
// Cafe menu API
//   GET  /api/menu          public  - the menu JSON
//   GET  /api/img/<id>      public  - a menu photo
//   POST /api/login         owner password -> session cookie
//   POST /api/logout
//   GET  /api/session       is the cookie valid?
//   PUT  /api/admin/menu    owner only - save the menu
//   POST /api/admin/upload  owner only - upload a photo (JPEG)
// =============================================================

const enc = new TextEncoder();

const DEFAULT_MENU = {
  cafeName: "SUP's Cafe",
  specials: [],
  bakes: [],
  categories: [{ name: 'Coffee', items: [{ name: 'Flat white', price: 38, description: '' }] }],
};

const MAX_PHOTO_BYTES = 600 * 1024;
const IMAGE_ID_PATTERN = /^[0-9a-f-]{36}$/;

// ---------- Response helpers ----------

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders },
  });
}

function sessionCookie(value) {
  const maxAge = value ? 8 * 3600 : 0;
  return `session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

// ---------- Crypto helpers ----------

function toBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return toBase64Url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

// Compare without leaking timing information.
function safeEqual(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------- Input cleaning ----------

const cleanText  = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const cleanPrice = value => Math.min(Math.max(Number(value) || 0, 0), 100000);
const cleanList  = list => (Array.isArray(list) ? list.slice(0, 200) : []);
const cleanImage = value => (IMAGE_ID_PATTERN.test(String(value || '')) ? String(value) : '');

function cleanMenu(data) {
  return {
    cafeName: cleanText(data.cafeName, 60) || "SUP's Cafe",
    updated: new Date().toISOString(),

    specials: cleanList(data.specials)
      .map(x => ({
        name: cleanText(x.name),
        price: cleanPrice(x.price),
        description: cleanText(x.description, 200),
        image: cleanImage(x.image),
      }))
      .filter(x => x.name),

    bakes: cleanList(data.bakes)
      .map(x => ({
        name: cleanText(x.name),
        price: cleanPrice(x.price),
        soldOut: !!x.soldOut,
        image: cleanImage(x.image),
      }))
      .filter(x => x.name),

    categories: cleanList(data.categories).slice(0, 30)
      .map(c => ({
        name: cleanText(c.name, 60),
        items: cleanList(c.items)
          .map(i => ({
            name: cleanText(i.name),
            price: cleanPrice(i.price),
            description: cleanText(i.description, 200),
            available: i.available !== false,
            image: cleanImage(i.image),
          }))
          // keep real items AND photo-only entries
          .filter(i => i.name || i.image),
      }))
      .filter(c => c.name),
  };
}

// ---------- Login session ----------

async function isLoggedIn(req, env) {
  const match = (req.headers.get('cookie') || '').match(/(?:^|; )session=([^;]+)/);
  if (!match) return false;

  const [expires, signature] = match[1].split('.');
  if (!expires || !signature || !(Date.now() < +expires)) return false;

  return safeEqual(enc.encode(signature), enc.encode(await sign(env.SESSION_SECRET, expires)));
}

// ---------- Route handlers ----------

async function getMenu(env) {
  const stored = await env.MENU.get('menu');
  return new Response(stored || JSON.stringify(DEFAULT_MENU), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function getImage(id, env) {
  const bytes = await env.MENU.get('img:' + id, 'arrayBuffer');
  if (!bytes) return new Response('Not found', { status: 404 });

  return new Response(bytes, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable', // ids never change
    },
  });
}

async function login(req, env) {
  const failKey = 'fail:' + (req.headers.get('cf-connecting-ip') || 'x');
  const failCount = +(await env.MENU.get(failKey)) || 0;
  if (failCount >= 5) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);

  let body = {};
  try { body = await req.json(); } catch {}

  const passwordOk = safeEqual(
    await sha256(String(body.password || '')),
    await sha256(env.ADMIN_PASSWORD)
  );

  if (!passwordOk) {
    await env.MENU.put(failKey, String(failCount + 1), { expirationTtl: 900 });
    return json({ error: 'Wrong password' }, 401);
  }

  await env.MENU.delete(failKey);
  const expires = String(Date.now() + 8 * 3600e3);
  const cookieValue = expires + '.' + await sign(env.SESSION_SECRET, expires);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(cookieValue) });
}

async function saveMenu(req, env) {
  let data;
  try { data = await req.json(); } catch { return json({ error: 'Bad data' }, 400); }

  await env.MENU.put('menu', JSON.stringify(cleanMenu(data)));
  return json({ ok: true });
}

async function uploadPhoto(req, env) {
  if (req.headers.get('content-type') !== 'image/jpeg') return json({ error: 'JPEG only' }, 415);

  const bytes = await req.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) {
    return json({ error: 'Image too large' }, 413);
  }

  const id = crypto.randomUUID();
  await env.MENU.put('img:' + id, bytes);
  return json({ id });
}

// ---------- Router ----------

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;
    const method = req.method;

    // Public routes (no login needed)
    if (path === '/api/menu' && method === 'GET') return getMenu(env);

    const imageMatch = path.match(/^\/api\/img\/([0-9a-f-]{36})$/);
    if (imageMatch && method === 'GET') return getImage(imageMatch[1], env);

    // Everything below needs the secrets to be configured
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: 'Server not configured' }, 500);

    if (path === '/api/login' && method === 'POST') return login(req, env);
    if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': sessionCookie('') });

    if (path === '/api/session') {
      const ok = await isLoggedIn(req, env);
      return json({ ok }, ok ? 200 : 401);
    }

    // Owner-only routes
    if (path.startsWith('/api/admin/')) {
      if (!await isLoggedIn(req, env)) return json({ error: 'Please sign in again' }, 401);

      if (path === '/api/admin/menu' && method === 'PUT') return saveMenu(req, env);
      if (path === '/api/admin/upload' && method === 'POST') return uploadPhoto(req, env);
    }

    return json({ error: 'Not found' }, 404);
  },
};