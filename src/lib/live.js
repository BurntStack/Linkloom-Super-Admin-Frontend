/* Everything the console shows comes from the Linkloom API, loaded here:
   - creators (GET /v1/creators/, GET /v1/creators/{id}/) and open campaigns (GET /v1/campaigns/);
   - the verification queue (GET /v1/admin/verifications/, GET /v1/admin/verifications/{id}/);
   - a creator's reviews (GET /v1/creators/{id}/reviews/).
   It is read only: the backend does not expose admin action endpoints (approve, suspend, hide, release) yet. */
import { data, store } from './core.js';
import { get, list, request, paise, signedInLive } from './api.js';

const TIMEOUT = 45000;                                   // the server sleeps when idle and can take a while to wake

const state = data.live = { status: 'idle', creators: [], campaigns: [], error: '', vstatus: 'idle', verifications: [], verror: '', unread: 0 };
/* the console is signed in as an admin */
export const isLiveSession = () => !!data.session.live && signedInLive();
export const live = () => state;

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const handleOf = c => (c.instagram ? '@' + c.instagram : c.youtube ? '@' + c.youtube : '');

export function mapCreator(c) {
  const pf = c.platforms && typeof c.platforms === 'object' ? c.platforms : {};
  const main = pf[c.primaryPlatform] || {};
  const followers = num(c.followerCount) ?? Object.values(pf).map(p => num(p && p.followersCount)).filter(v => v != null).sort((a, b) => b - a)[0] ?? null;
  return {
    id: String(c.id), live: true,
    name: c.displayName || 'Creator', handle: handleOf(c), city: c.city || c.location || '—', region: c.region || '',
    verified: !!c.verified, followers, er: num(main.engagementRate), rating: num(c.rating), reviewCount: num(c.reviewCount) || 0,
    startingPrice: paise(c.startingPrice), tags: Array.isArray(c.categories) ? c.categories : [], languages: Array.isArray(c.languages) ? c.languages : [],
    bio: c.bio || '', primaryPlatform: c.primaryPlatform || '', repliesWithin: c.repliesWithin || '',
    platforms: Object.entries(pf).map(([k, p]) => ({ key: k, handle: (p && p.handle) || '', followers: num(p && p.followersCount), linked: !!(p && p.verified) })),
    packages: Array.isArray(c.packages) ? c.packages.map(p => ({ id: String(p.id), title: p.title || '', platform: p.platform || '', deliverables: p.deliverables || '', price: paise(p.price), deliveryDays: num(p.deliveryDays) })) : null
  };
}
export function mapCampaign(k) {
  return {
    id: String(k.id), live: true, title: k.title || 'Untitled campaign', platform: k.platform || '', deliverables: k.deliverables || '',
    budgetMin: paise(k.budgetMin), budgetMax: paise(k.budgetMax), closesAt: k.closesAt || '', postedAt: k.createdAt || '',
    status: k.status || '', bids: num(k.bidCount) || 0, brandName: (k.brand && (k.brand.name || k.brand.brandName)) || '', brief: k.brief || ''
  };
}

const timed = () => { const c = new AbortController(); const t = setTimeout(() => c.abort(), TIMEOUT); return { signal: c.signal, done: () => clearTimeout(t) }; };

async function load() {
  const t = timed();
  try {
    const [creators, campaigns] = await Promise.all([list('/v1/creators/', { signal: t.signal }), list('/v1/campaigns/', { signal: t.signal })]);
    store.set(() => { state.creators = creators.map(mapCreator); state.campaigns = campaigns.map(mapCampaign); state.status = 'ready'; state.error = ''; }, 'live');
  } catch (e) {
    store.set(() => { state.status = 'failed'; state.error = (e && e.message) || 'Could not reach the Linkloom API.'; }, 'live');
  } finally { t.done(); }
}

/* Start loading once; screens call this when they mount and re-render on the store's 'live' event. */
export function ensureLive() { if (state.status === 'idle') { state.status = 'loading'; load(); } }
export function retryLive() { if (state.status !== 'loading') { store.set(() => { state.status = 'loading'; }, 'live'); load(); } }

/* One creator's public profile, with packages. */
export async function fetchCreator(id) {
  const t = timed();
  try { return mapCreator(await get(`/v1/creators/${encodeURIComponent(id)}/`, { signal: t.signal })); }
  finally { t.done(); }
}

/* A creator's reviews. The API guide lists this as public, but it asks for a sign-in, so only a live session gets it. */
export async function fetchReviews(id) {
  const t = timed();
  try {
    const rows = await list(`/v1/creators/${encodeURIComponent(id)}/reviews/`, { signal: t.signal, max: 100 });
    return rows.map(r => ({ id: String(r.id || ''), stars: num(Number(r.stars)) || 0, text: String(r.text || ''), at: r.createdAt || '',
      from: (r.brand && (r.brand.name || r.brand.brandName)) || (r.author && (r.author.name || r.author.fullName)) || 'Brand' }));
  } finally { t.done(); }
}

/* ---------- verification queue (signed-in admin only) ----------
   The backend's admin verification records are not documented, so this reads them defensively: the KYC fields the
   website already uses (status, steps.pan / id / bank, rejectionReason, submittedAt) and the obvious names for who
   it is about. Everything else the API returns is kept in `extra`, so the detail page can show it as it came. */
const VSTATUS = { pending: 'pending', under_review: 'pending', submitted: 'pending', in_review: 'pending',
  verified: 'approved', approved: 'approved', rejected: 'rejected', action_needed: 'info_requested', info_requested: 'info_requested', needs_info: 'info_requested' };
const ID_TYPE = { aadhaar: 'Aadhaar', passport: 'Passport', voter_id: 'Voter ID', driving_licence: 'Driving licence' };
const str = v => (v == null ? '' : String(v));
const pick = (...v) => v.find(x => x != null && x !== '');
const MAPPED = new Set(['id', 'status', 'kycStatus', 'kind', 'role', 'accountType', 'user', 'creator', 'brand', 'profile', 'name', 'fullName', 'displayName', 'brandName',
  'email', 'phone', 'submittedAt', 'createdAt', 'updatedAt', 'steps', 'kyc', 'rejectionReason', 'reason', 'note', 'verifiedAt', 'reviewedAt', 'decidedAt', 'reviewedBy', 'decidedBy']);

export function mapVerification(v) {
  const u = v.user || v.creator || v.brand || v.profile || {};
  const k = v.kyc && typeof v.kyc === 'object' ? v.kyc : v;
  const steps = (k.steps && typeof k.steps === 'object') ? k.steps : {};
  const pan = steps.pan || {}, idd = steps.id || {}, bank = steps.bank || {};
  const kindRaw = str(pick(v.kind, v.accountType, v.role, u.role, v.brand ? 'brand' : '', 'creator')).toLowerCase();
  const rawStatus = str(pick(v.status, k.status, v.kycStatus)).toLowerCase();
  const extra = Object.entries(v).filter(([key, val]) => !MAPPED.has(key) && val != null && val !== '' && typeof val !== 'object').map(([key, val]) => [key, String(val)]);
  return {
    id: str(v.id), kind: kindRaw === 'brand' ? 'brand' : 'creator',
    status: VSTATUS[rawStatus] || (rawStatus ? 'pending' : 'pending'), rawStatus,
    name: str(pick(v.name, v.fullName, v.displayName, v.brandName, u.brandName, u.displayName, u.fullName, u.name, u.email, v.email, 'Unnamed account')),
    email: str(pick(v.email, u.email)), phone: str(pick(v.phone, u.phone)), accountId: str(pick(u.id, v.userId, v.creatorId, v.brandId)),
    submittedAt: str(pick(v.submittedAt, k.submittedAt, v.createdAt)), decidedAt: str(pick(v.decidedAt, v.reviewedAt, k.verifiedAt, v.verifiedAt)),
    decidedBy: str(pick(v.decidedBy, v.reviewedBy && (v.reviewedBy.fullName || v.reviewedBy.email || v.reviewedBy))),
    reason: str(pick(v.rejectionReason, k.rejectionReason, v.reason, v.note)),
    pan: { done: !!pan.done, masked: pan.panLast4 ? '•••••' + String(pan.panLast4).padStart(4, '•') : str(pan.masked), name: str(pan.nameOnPan) },
    idDoc: { done: !!idd.done, type: ID_TYPE[str(idd.idType)] || str(idd.idType), uploadId: str(idd.uploadId) },
    bank: { done: !!bank.done, masked: bank.accountLast4 ? '••••' + bank.accountLast4 : str(bank.masked), ifsc: str(bank.ifsc), holder: str(bank.accountHolderName) },
    extra
  };
}

async function loadVerifications() {
  const t = timed();
  try {
    const rows = await list('/v1/admin/verifications/', { signal: t.signal });
    store.set(() => { state.verifications = rows.map(mapVerification); state.vstatus = 'ready'; state.verror = ''; }, 'live');
  } catch (e) {
    store.set(() => { state.vstatus = 'failed'; state.verror = (e && e.message) || 'Could not load the verification queue.'; }, 'live');
  } finally { t.done(); }
}
export function ensureVerifications() { if (isLiveSession() && state.vstatus === 'idle') { state.vstatus = 'loading'; loadVerifications(); refreshUnread(); } }
export function reloadVerifications() { if (isLiveSession() && state.vstatus !== 'loading') { store.set(() => { state.vstatus = 'loading'; }, 'live'); loadVerifications(); } }
export async function fetchVerification(id) {
  const t = timed();
  try { return mapVerification(await get(`/v1/admin/verifications/${encodeURIComponent(id)}/`, { signal: t.signal })); }
  finally { t.done(); }
}
/* "5 min ago" against the real clock */
export function sinceNow(s) {
  const t = Date.parse(s); if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 6e4));
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60); if (h < 24) return h + ' h ago';
  const d = Math.round(h / 24); return d === 1 ? 'yesterday' : d + ' days ago';
}
/* a signed link to an uploaded document (the KYC ID), if the backend lets an admin have it */
export async function documentUrl(uploadId) {
  const d = await get(`/v1/uploads/${encodeURIComponent(uploadId)}/download-url/`);
  return d && (d.url || d.downloadUrl);
}
/* ---------- the admin's own notifications (the website's /v1/notifications/) ---------- */
export async function refreshUnread() {
  try { const d = await get('/v1/notifications/unread-count/'); const n = Number(d && (d.unreadCount ?? d.count ?? d)); store.set(() => { state.unread = Number.isFinite(n) ? n : 0; }, 'live'); }
  catch (e) {}
}
export async function fetchNotifications() {
  const rows = await list('/v1/notifications/', { max: 100 });
  return rows.map(n => ({ id: String(n.id || ''), text: String(n.title || n.text || n.body || n.message || n.type || 'Notification'),
    at: n.createdAt || '', read: !!(n.read ?? n.isRead ?? n.readAt), link: n.link || n.url || '' }));
}
export async function readAllNotifications() {
  await request('/v1/notifications/read-all/', { method: 'POST' });
  store.set(() => { state.unread = 0; }, 'live');
}

/* forget everything loaded for a signed-in admin (on sign-out) */
export function forgetSession() { state.vstatus = 'idle'; state.verifications = []; state.verror = ''; state.unread = 0; }
