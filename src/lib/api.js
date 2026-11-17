/* Client for the existing Linkloom API (the same backend the website uses).
   Every response is the envelope { success, data, error, meta }; lists page with ?limit=&cursor= and meta.nextCursor.
   The browser calls it through a same-origin proxy at /api (see vite.config.js and vercel.json), because the API does
   not send CORS headers. Only public GET endpoints are used so far: there is no admin sign-in on the backend yet. */
const BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, message, code = '', details = null) {
    super(message);
    this.name = 'ApiError'; this.status = status; this.code = code; this.details = details;
  }
}

export async function request(path, { query, signal } = {}) {
  const url = new URL(BASE + path, location.href);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  let res;
  try { res = await fetch(url, { headers: { Accept: 'application/json' }, signal }); }
  catch (e) { throw new ApiError(0, 'Could not reach the Linkloom API.', 'NETWORK'); }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success === false) {
    const err = body && body.error;
    throw new ApiError(res.status, (err && err.message) || 'The Linkloom API did not answer as expected.', (err && err.code) || '', (err && err.details) || null);
  }
  return { data: body.data, meta: body.meta || null };
}

export const get = async (path, o) => (await request(path, o)).data;

/* Every page of a list, up to max items. */
export async function list(path, { query, signal, max = 500 } = {}) {
  const out = [];
  let cursor = null;
  do {
    const { data, meta } = await request(path, { query: { limit: 50, ...query, ...(cursor ? { cursor } : {}) }, signal });
    out.push(...(Array.isArray(data) ? data : []));
    cursor = meta && meta.hasMore !== false ? meta.nextCursor || null : null;
  } while (cursor && out.length < max);
  return out;
}

/* Money arrives as integer paise, either bare or as { amount, currency }. */
export const paise = v => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v.amount);
  return Number.isFinite(n) ? Math.round(n) : null;
};
