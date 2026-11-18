/* Client for the existing Linkloom API (the same backend the website uses).
   Every response is the envelope { success, data, error, meta }; lists page with ?limit=&cursor= and meta.nextCursor.
   The browser calls it through a same-origin proxy at /api (see vite.config.js and vercel.json), because the API does
   not send CORS headers.
   Signing in uses the website's own POST /v1/auth/login/; the console accepts only accounts whose role is "admin".
   Tokens live in sessionStorage, so closing the tab signs the admin out. */
const BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '');
const KEY = 'll-admin-api';

export class ApiError extends Error {
  constructor(status, message, code = '', details = null) {
    super(message);
    this.name = 'ApiError'; this.status = status; this.code = code; this.details = details;
  }
}

/* ---------- tokens ---------- */
const readAuth = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
const writeAuth = a => { try { a ? sessionStorage.setItem(KEY, JSON.stringify(a)) : sessionStorage.removeItem(KEY); } catch (e) {} };
export const auth = () => readAuth();
export const signedInLive = () => { const a = readAuth(); return !!(a && a.access && a.user && a.user.role === 'admin'); };
export const clearAuth = () => writeAuth(null);

/* ---------- requests ---------- */
async function raw(path, { method = 'GET', body, query, signal, token } = {}) {
  const url = new URL(BASE + path, location.href);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try { res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal }); }
  catch (e) { if (e && e.name === 'AbortError') throw e; throw new ApiError(0, 'Could not reach the Linkloom API.', 'NETWORK'); }
  if (res.status === 204) return { res, body: null };
  return { res, body: await res.json().catch(() => null) };
}
const fail = (res, body) => {
  const err = body && body.error;
  return new ApiError(res.status, (err && err.message) || 'The Linkloom API did not answer as expected.', (err && err.code) || '', (err && err.details) || null);
};

/* one refresh at a time; a second caller waits for the first */
let refreshing = null;
function refresh() {
  if (refreshing) return refreshing;
  const a = readAuth();
  if (!a || !a.refresh) return Promise.resolve(false);
  refreshing = raw('/v1/auth/token/refresh/', { method: 'POST', body: { refresh: a.refresh } })
    .then(({ res, body }) => {
      const d = body && body.data;
      if (!res.ok || !d || !d.access) { if (res.status === 400 || res.status === 401) writeAuth(null); return false; }
      writeAuth({ ...a, access: d.access, refresh: d.refresh || a.refresh, user: d.user || a.user });
      return true;
    }, () => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

let onExpired = null;
export const whenSessionEnds = f => { onExpired = f; };

/* options.auth: send the admin's token (default true when signed in) */
export async function request(path, o = {}) {
  const useAuth = o.auth !== false && !!readAuth();
  let { res, body } = await raw(path, { ...o, token: useAuth ? readAuth().access : null });
  if (res.status === 401 && useAuth) {
    if (await refresh()) ({ res, body } = await raw(path, { ...o, token: readAuth().access }));
    else { writeAuth(null); onExpired && onExpired(); }
  }
  if (res.status === 204) return { data: null, meta: null };
  if (!res.ok || !body || body.success === false) throw fail(res, body);
  return { data: body.data, meta: body.meta || null };
}

export const get =async (path, o) => (await request(path, o)).data;

/* Every page of a list, up to max items. */
export async function list(path, { query, signal, max = 500, auth: useAuth } = {}) {
  const out = [];
  let cursor = null;
  do {
    const { data, meta } = await request(path, { query: { limit: 50, ...query, ...(cursor ? { cursor } : {}) }, signal, auth: useAuth });
    out.push(...(Array.isArray(data) ? data : []));
    cursor = meta && meta.hasMore !== false ? meta.nextCursor || null : null;
  } while (cursor && out.length < max);
  return out;
}

/* ---------- sign-in ---------- */
/* Returns the user. Throws ApiError: INVALID_CREDENTIALS / AUTH_INVALID for a wrong email or password,
   NOT_ADMIN when the account exists but is not an admin (its tokens are thrown away at once). */
export async function login(identifier, password) {
  const { res, body } = await raw('/v1/auth/login/', { method: 'POST', body: { identifier, password } });
  if (!res.ok || !body || body.success === false) throw fail(res, body);
  const d = body.data || {};
  if (!d.access || !d.user) throw new ApiError(res.status, 'The Linkloom API did not answer as expected.');
  if (d.user.role !== 'admin') {
    raw('/v1/auth/logout/', { method: 'POST', body: { refresh: d.refresh }, token: d.access }).catch(() => {});
    throw new ApiError(403, 'This account is not a Linkloom admin account.', 'NOT_ADMIN');
  }
  writeAuth({ access: d.access, refresh: d.refresh, user: d.user });
  return d.user;
}

export async function logout() {
  const a = readAuth();
  writeAuth(null);
  if (a && a.refresh) await raw('/v1/auth/logout/', { method: 'POST', body: { refresh: a.refresh }, token: a.access }).catch(() => {});
}

/* Money arrives as integer paise, either bare or as { amount, currency }. */
export const paise = v => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v.amount);
  return Number.isFinite(n) ? Math.round(n) : null;
};
