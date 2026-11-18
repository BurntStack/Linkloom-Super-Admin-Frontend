/* Client for the existing Linkloom API (the same backend the website uses).
   Every response is the envelope { success, data, error, meta }; lists page with ?limit=&cursor= and meta.nextCursor.
   The browser calls it through a same-origin proxy at /api (see vite.config.js and vercel.json), because the API does
   not send CORS headers.
   Signing in uses the admin endpoints (password, then authenticator code); only accounts whose role is "admin" get in.
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
/* Admins sign in in two steps, on the admin endpoints (never the website's /v1/auth/login/ or Google sign-in, which
   would skip the authenticator step):
   1. adminLogin(email, password)  POST /v1/admin/auth/login/      returns { challengeId, expiresIn }
   2. verifyMfa(challengeId, code, trustDevice)
                                   POST /v1/admin/auth/mfa/verify/ stores the tokens and returns the user
   Errors are ApiError with the backend's code (INVALID_CREDENTIALS, MFA_INVALID, ACCOUNT_LOCKED, RATE_LIMITED, ...).
   NOT_ADMIN is raised here when the tokens belong to an account whose role is not "admin"; they are thrown away. */
export async function adminLogin(email, password) {
  const { res, body } = await raw('/v1/admin/auth/login/', { method: 'POST', body: { email, password } });
  if (!res.ok || !body || body.success === false) throw fail(res, body);
  const d = body.data || {};
  const challengeId = d.mfaChallengeId || d.challengeId || d.mfaToken || '';
  if (!challengeId) throw new ApiError(res.status, 'The Linkloom API did not answer as expected.');
  return { challengeId, expiresIn: Number(d.expiresIn) || 0 };
}

export async function verifyMfa(challengeId, code, trustDevice = false) {
  const { res, body } = await raw('/v1/admin/auth/mfa/verify/', { method: 'POST', body: { mfaChallengeId: challengeId, code, trustDevice: !!trustDevice } });
  if (!res.ok || !body || body.success === false) throw fail(res, body);
  const d = body.data || {};
  if (!d.access || !d.user) throw new ApiError(res.status, 'The Linkloom API did not answer as expected.');
  if (d.user.role !== 'admin') {
    raw('/v1/admin/auth/logout/', { method: 'POST', body: { refresh: d.refresh }, token: d.access }).catch(() => {});
    throw new ApiError(403, 'This account is not a Linkloom admin account.', 'NOT_ADMIN');
  }
  writeAuth({ access: d.access, refresh: d.refresh, user: d.user });
  return d.user;
}

export async function logout() {
  const a = readAuth();
  writeAuth(null);
  if (a && a.refresh) await raw('/v1/admin/auth/logout/', { method: 'POST', body: { refresh: a.refresh }, token: a.access }).catch(() => {});
}

/* Money arrives as integer paise, either bare or as { amount, currency }. */
export const paise = v => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v.amount);
  return Number.isFinite(n) ? Math.round(n) : null;
};
