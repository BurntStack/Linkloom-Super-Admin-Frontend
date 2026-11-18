/* Client for the Linkloom API (the same backend the website uses), admin surface under /v1/admin/.
   Every response is the envelope { success, data, error, meta }; lists page with ?limit=&cursor= and meta.nextCursor.
   The browser calls it through a same-origin proxy at /api (see vite.config.js and vercel.json), because the API does
   not send CORS headers. VITE_API_BASE changes that (see .env.example).
   Signing in uses the admin endpoints (password, then authenticator code); only accounts whose role is "admin" get in.
   Tokens live in sessionStorage, so closing the tab signs the admin out. */
const BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '');
const KEY = 'll-admin-api';
/* the server sleeps when idle and can take a while to wake; every call gives up after this long */
export const TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 45000;

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
async function raw(path, { method = 'GET', body, query, signal, token, headers: extra, blob = false } = {}) {
  const url = new URL(BASE + path, location.href);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  const headers = { Accept: blob ? 'text/csv, application/json;q=0.9, */*;q=0.8' : 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (extra) Object.assign(headers, extra);
  /* our own timeout, chained to the caller's signal */
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
  const onAbort = () => ctl.abort();
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  try {
    let res;
    try { res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal }); }
    catch (e) {
      if (signal && signal.aborted) throw e;
      if (ctl.signal.aborted) throw new ApiError(0, 'The Linkloom API took too long to answer. It may be waking up; try again.', 'TIMEOUT');
      throw new ApiError(0, 'Could not reach the Linkloom API.', 'NETWORK');
    }
    if (res.status === 204) return { res, body: null };
    const type = res.headers.get('content-type') || '';
    if (blob && res.ok && !type.includes('application/json')) return { res, body: null, blob: await res.blob() };
    return { res, body: await res.json().catch(() => null) };
  } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
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
      writeAuth({ ...a, access: d.access, refresh: d.refresh || a.refresh, user: { ...a.user, ...(d.user || {}) } });
      return true;
    }, () => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

/* the session is over: f('expired') when the token could not be refreshed, f('suspended') when an admin suspended
   this account (403 ACCOUNT_SUSPENDED; the backend has already invalidated its tokens) */
let onExpired = null;
export const whenSessionEnds = f => { onExpired = f; };
const ended = why => { writeAuth(null); onExpired && onExpired(why); };

/* options.auth: send the admin's token (default true when signed in) */
async function call(path, o = {}) {
  const useAuth = o.auth !== false && !!readAuth();
  let r = await raw(path, { ...o, token: useAuth ? readAuth().access : null });
  if (r.res.status === 401 && useAuth) {
    if (await refresh()) r = await raw(path, { ...o, token: readAuth().access });
    else ended('expired');
  }
  if (r.res.status === 403 && useAuth && r.body && r.body.error && r.body.error.code === 'ACCOUNT_SUSPENDED') ended('suspended');
  return r;
}
/* The backend refuses fields it does not know (400 VALIDATION_ERROR, "Unknown or read-only field"). The guide is not
   always exact about bodies, so drop just those fields and try once more. */
const unknownFields = body => {
  const d = body && body.error && body.error.code === 'VALIDATION_ERROR' && body.error.details;
  if (!d || typeof d !== 'object') return null;
  const keys = Object.keys(d).filter(k => [].concat(d[k]).some(m => /unknown or read-only field/i.test(String(m))));
  return keys.length && keys.length === Object.keys(d).length ? keys : null;
};
export async function request(path, o = {}) {
  let { res, body } = await call(path, o);
  const drop = res.status === 400 && o.body && typeof o.body === 'object' && unknownFields(body);
  if (drop) {
    const trimmed = Object.fromEntries(Object.entries(o.body).filter(([k]) => !drop.includes(k)));
    ({ res, body } = await call(path, { ...o, body: trimmed }));
  }
  if (res.status === 204) return { data: null, meta: null };
  if (!res.ok || !body || body.success === false) throw fail(res, body);
  return { data: body.data, meta: body.meta || null };
}

export const get = async (path, o) => (await request(path, o)).data;
export const post = async (path, body = {}, o = {}) => (await request(path, { ...o, method: 'POST', body })).data;
export const put = async (path, body = {}, o = {}) => (await request(path, { ...o, method: 'PUT', body })).data;
export const patch = async (path, body = {}, o = {}) => (await request(path, { ...o, method: 'PATCH', body })).data;

/* a fresh Idempotency-Key; keep one per decision so a retried click cannot move money twice */
export const idemKey = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

/* One page of a list: { rows, meta, next } (next is the cursor for the page after, or null). */
export async function page(path, { query, cursor, limit = 25, signal } = {}) {
  const { data, meta } = await request(path, { query: { limit, ...query, ...(cursor ? { cursor } : {}) }, signal });
  const rows = Array.isArray(data) ? data : Array.isArray(data && data.results) ? data.results : Array.isArray(data && data.items) ? data.items : [];
  const m = meta || {};
  return { rows, meta: m, next: m.hasMore === false ? null : (m.nextCursor || m.next || null) };
}

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

/* A file export (CSV), saved by the browser. The backend may answer with the file itself, or with JSON that holds
   a link ({ url }) or the CSV text ({ csv }). */
export async function download(path, { query, filename = 'export.csv' } = {}) {
  const { res, body, blob } = await call(path, { query, blob: true });
  if (!res.ok) throw fail(res, body);
  let file = blob;
  if (!file) {
    const d = body && body.data;
    const url = d && (d.url || d.downloadUrl || d.signedUrl);
    if (url) { window.open(url, '_blank', 'noopener'); return; }
    const text = typeof d === 'string' ? d : d && (d.csv || d.content);
    if (!text) throw new ApiError(res.status, 'The export came back empty.');
    file = new Blob([text], { type: 'text/csv' });
  }
  const cd = res.headers.get('content-disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = m ? decodeURIComponent(m[1]) : filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- sign-in ---------- */
/* Admins sign in in two steps, on the admin endpoints (never the website's /v1/auth/login/ or Google sign-in, which
   would skip the authenticator step):
   1. adminLogin(email, password)  POST /v1/admin/auth/login/      returns { challengeId, expiresIn }
   2. verifyMfa(mfaToken, code)
                                   POST /v1/admin/auth/mfa/verify/ stores the tokens and returns the user
                                   ({ role: "admin", adminRole: "super_admin" | "trust_safety" | "finance", aal })
   The live backend takes { email, password } -> { mfaRequired, mfaToken, user } and then { mfaToken, code }; it refuses
   the guide's mfaChallengeId and trustDevice field names ("Unknown or read-only field").
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

export async function verifyMfa(mfaToken, code) {
  const { res, body } = await raw('/v1/admin/auth/mfa/verify/', { method: 'POST', body: { mfaToken, code } });
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
  const n = typeof v === 'number' ? v : Number(typeof v === 'object' ? v.amount : v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
