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

// ---------- Input validation ----------
// Keep these limits in sync with LIMIT in admin/index.html.

const LIMITS = {
  cafeName: 60, name: 60, category: 60, description: 200,
  maxPrice: 100000,
  specials: 50, bakes: 50, categories: 30, itemsPerCategory: 100,
  menuBytes: 256 * 1024, loginBytes: 2048, password: 256,
};

// Section ids the public page builds from titles (see slugify in index.html).
const RESERVED_SLUGS = ['today-s-specials', 'fresh-from-the-oven'];
const slugify = title => title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Single-line text: strips control characters, collapses whitespace, enforces length.
function readText(value, label, max, required = false) {
  if (value == null) value = '';
  if (typeof value !== 'string') throw new InputError(`${label} must be text.`);
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (required && !text) throw new InputError(`${label} can't be empty.`);
  if (text.length > max) throw new InputError(`${label} is too long (max ${max} characters).`);
  return text;
}

function readPrice(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InputError(`${label}: enter a price as a number.`);
  }
  if (value <= 0) throw new InputError(`${label}: price must be more than R0.`);
  if (value > LIMITS.maxPrice) throw new InputError(`${label}: price can't be more than R${LIMITS.maxPrice}.`);
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-6) throw new InputError(`${label}: use at most 2 decimal places.`);
  return cents / 100;
}

function readBool(value, label, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new InputError(`${label} is not valid.`);
  return value;
}

function readImage(value, label) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || !IMAGE_ID_PATTERN.test(value)) {
    throw new InputError(`${label}: photo reference is not valid. Re-upload the photo.`);
  }
  return value;
}

function readList(value, label, max) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new InputError(`${label} is not valid.`);
  if (value.length > max) throw new InputError(`Too many ${label} (max ${max}).`);
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new InputError(`${label} is not valid.`);
  }
  return value;
}

// Returns the cleaned menu, or throws an InputError that says exactly what is wrong.
// Per-item photos are no longer stored: photos belong to the section.
function validateMenu(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new InputError('Menu data is not valid.');

  const specials = readList(data.specials, 'specials', LIMITS.specials).map((x, i) => {
    const name = readText(x.name, `Special #${i + 1} name`, LIMITS.name, true);
    return {
      name,
      price: readPrice(x.price, `Special "${name}"`),
      description: readText(x.description, `Special "${name}" description`, LIMITS.description),
    };
  });

  const bakes = readList(data.bakes, 'bakes', LIMITS.bakes).map((x, i) => {
    const name = readText(x.name, `Bake #${i + 1} name`, LIMITS.name, true);
    return {
      name,
      price: readPrice(x.price, `Bake "${name}"`),
      soldOut: readBool(x.soldOut, `Bake "${name}" sold-out flag`, false),
    };
  });

  const seen = new Set(RESERVED_SLUGS);
  const categories = readList(data.categories, 'categories', LIMITS.categories).map((c, i) => {
    const name = readText(c.name, `Category #${i + 1} name`, LIMITS.category, true);
    const slug = slugify(name);
    if (!/[a-z0-9]/.test(slug)) throw new InputError(`Category "${name}" needs at least one letter or number.`);
    if (seen.has(slug)) throw new InputError(`Another section is already called "${name}". Give each category its own name.`);
    seen.add(slug);

    const items = readList(c.items, `items in "${name}"`, LIMITS.itemsPerCategory).map((it, j) => {
      const itemName = readText(it.name, `${name}, item #${j + 1} name`, LIMITS.name, true);
      return {
        name: itemName,
        price: readPrice(it.price, `${name} → "${itemName}"`),
        description: readText(it.description, `${name} → "${itemName}" description`, LIMITS.description),
        available: readBool(it.available, `${name} → "${itemName}" availability`, true),
      };
    });

    return { name, image: readImage(c.image, `Category "${name}"`), items };
  });

  return {
    cafeName: readText(data.cafeName, 'Cafe name', LIMITS.cafeName, true),
    updated: new Date().toISOString(),
    specialsImage: readImage(data.specialsImage, "Today's specials"),
    bakesImage: readImage(data.bakesImage, 'Daily bakes'),
    specials,
    bakes,
    categories,
  };
}

// Reads a JSON request body with a size cap and a content-type check.
async function readJsonBody(req, maxBytes) {
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new InputError('Expected JSON data.', 415);
  if (Number(req.headers.get('content-length')) > maxBytes) throw new InputError('That request is too large.', 413);

  const raw = await req.text();
  if (raw.length > maxBytes) throw new InputError('That request is too large.', 413);
  try { return JSON.parse(raw); } catch { throw new InputError('Bad data.'); }
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

  const body = await readJsonBody(req, LIMITS.loginBytes);
  const password = body && body.password;
  if (typeof password !== 'string' || !password) throw new InputError('Enter your password.');
  if (password.length > LIMITS.password) throw new InputError('That password is too long.');

  const passwordOk = safeEqual(await sha256(password), await sha256(env.ADMIN_PASSWORD));

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
  const data = await readJsonBody(req, LIMITS.menuBytes);
  const menu = validateMenu(data); // throws InputError with a clear message
  await env.MENU.put('menu', JSON.stringify(menu));
  return json({ ok: true });
}

async function uploadPhoto(req, env) {
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'image/jpeg') throw new InputError('Only JPEG photos can be uploaded.', 415);
  if (Number(req.headers.get('content-length')) > MAX_PHOTO_BYTES) {
    throw new InputError('Photo is too large (max 600 KB).', 413);
  }

  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new InputError('Photo is too large (max 600 KB).', 413);

  // A real JPEG starts with the bytes FF D8 FF; the header alone can be faked.
  const head = new Uint8Array(bytes.slice(0, 3));
  if (bytes.byteLength < 100 || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    throw new InputError('That file is not a valid JPEG photo.', 415);
  }

  const id = crypto.randomUUID();
  await env.MENU.put('img:' + id, bytes);
  return json({ id });
}

// ---------- Router ----------

export default {
  async fetch(req, env) {
    try {
      return await route(req, env);
    } catch (err) {
      if (err instanceof InputError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  },
};

async function route(req, env) {
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
}