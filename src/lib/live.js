/* Console-wide data from the admin API, kept in the store under `live`:
   - badge counts for the side menu (GET /v1/admin/system/counts/), refreshed every minute while signed in;
   - the admin notification bell (GET /v1/admin/system/notifications/, unread-count, read, read-all);
   - helpers to read verification records (GET /v1/admin/verifications/...).
   Screens load their own lists through src/lib/admin.js. */
import { data, store } from './core.js';
import { signedInLive } from './api.js';
import { api, str, pick, num, arr } from './admin.js';

const state = data.live = { counts: {}, cstatus: 'idle', unread: 0, escrow: null };
export const isLiveSession = () => !!data.session.live && signedInLive();
export const live = () => state;

/* ---------- side-menu counts ----------
   The counts payload is flat or grouped ({ verifications: { pending: 3 } }); look a count up by name patterns. */
const flat = (o, pre = '', out = {}) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const key = pre ? pre + '.' + k : k; if (typeof v === 'number') out[key] = v; else if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out); } return out; };
export function countOf(counts, ...pats) {
  const f = flat(counts);
  for (const p of pats) {
    const re = p instanceof RegExp ? p : new RegExp(p, 'i');
    const hits = Object.entries(f).filter(([k]) => re.test(k));
    if (!hits.length) continue;
    const pend = hits.find(([k]) => /pending|open|waiting|unresolved|total$/i.test(k));
    return (pend || hits[0])[1];
  }
  return 0;
}
export const BADGES = {
  verify: c => countOf(c, /verification/i, /kyc/i),
  campaigns: c => countOf(c, /campaign/i),
  moderation: c => countOf(c, /abuse|report/i) + countOf(c, /bid.?alert/i) + countOf(c, /review/i),
  orders: c => countOf(c, /dispute/i),
  bell: c => countOf(c, /notification|unread/i)
};

let timer = 0;
export async function refreshCounts() {
  if (!isLiveSession()) return;
  try {
    const c = await api.counts();
    store.set(() => { state.counts = c || {}; state.cstatus = 'ready'; }, 'live');
  } catch (e) { store.set(() => { state.cstatus = 'failed'; }, 'live'); }
  refreshUnread();
}
/* the escrow total for the side menu, from the dashboard (money is paise) */
export const escrowOf = d => {
  const f = flat(d);
  const k = Object.keys(f).find(x => /escrow/i.test(x) && /(total|held|balance|amount|paise)/i.test(x) && !/count/i.test(x)) || Object.keys(f).find(x => /escrow/i.test(x) && !/count/i.test(x));
  return k != null ? f[k] : null;
};
export const setEscrow = d => {
  const v = escrowOf(d), lv = countOf(d || {}, /liveOrders|orders?\.(live|inProgress|active)/i, /liveOrder/i);
  store.set(() => { if (v != null) state.escrow = v; if (lv) state.liveOrders = lv; }, 'live');
};
export function startLive() {
  if (!isLiveSession() || timer) return;
  refreshCounts();
  api.dashboard().then(setEscrow, () => {});
  timer = setInterval(() => { if (document.visibilityState === 'visible') refreshCounts(); }, 60000);
}

/* ---------- notifications ---------- */
export async function refreshUnread() {
  try {
    const d = await api.unreadCount();
    const n = num(typeof d === 'object' && d ? pick(d.unreadCount, d.unread, d.count) : d);
    store.set(() => { state.unread = n || 0; }, 'live');
  } catch (e) {}
}
export const mapNotification = n => ({
  id: str(n.id), text: str(pick(n.title, n.text, n.message, n.body, n.summary, n.type, 'Notification')),
  body: str(n.title && pick(n.body, n.message, n.text)), at: str(pick(n.createdAt, n.at, n.timestamp)),
  read: !!(n.read ?? n.isRead ?? n.readAt), link: linkOf(n), kind: str(pick(n.kind, n.type, n.category))
});
/* an admin notification points at a record; turn that into a console route */
function linkOf(n) {
  const l = str(pick(n.link, n.url, n.href));
  if (l.startsWith('#')) return l;
  const t = str(pick(n.targetType, n.entityType, n.objectType, n.resourceType, n.type)).toLowerCase(), id = str(pick(n.targetId, n.entityId, n.objectId, n.resourceId));
  if (!id) return '';
  if (/verif|kyc/.test(t)) return '#verify-' + id;
  if (/campaign/.test(t)) return '#campaign-' + id;
  if (/dispute/.test(t)) return '#dispute-' + id;
  if (/order|escrow/.test(t)) return '#order-' + id;
  if (/report|abuse/.test(t)) return '#report-' + id;
  if (/brand/.test(t)) return '#brand-' + id;
  if (/creator/.test(t)) return '#creator-' + id;
  return '';
}
export async function fetchNotifications() { return (await api.notifications()).rows.map(mapNotification); }
export async function readNotification(id) { await api.readNotification(id); store.set(() => { state.unread = Math.max(0, state.unread - 1); }, 'live'); }
export async function readAllNotifications() { await api.readAllNotifications(); store.set(() => { state.unread = 0; }, 'live'); }

/* ---------- verification records ----------
   Read defensively: the guide gives the endpoints and the checks/documents, not every field name. Everything else the
   API returns is kept in `extra`, so the detail page can show it as it came. */
const VSTATUS = { pending: 'pending', under_review: 'pending', submitted: 'pending', in_review: 'pending',
  verified: 'approved', approved: 'approved', rejected: 'rejected', action_needed: 'info_requested', info_requested: 'info_requested', needs_info: 'info_requested' };
const ID_TYPE = { aadhaar: 'Aadhaar', passport: 'Passport', voter_id: 'Voter ID', driving_licence: 'Driving licence' };
const MAPPED = new Set(['id', 'status', 'kycStatus', 'kind', 'role', 'accountType', 'user', 'creator', 'brand', 'profile', 'name', 'fullName', 'displayName', 'brandName',
  'email', 'phone', 'submittedAt', 'createdAt', 'updatedAt', 'steps', 'kyc', 'rejectionReason', 'reason', 'note', 'verifiedAt', 'reviewedAt', 'decidedAt', 'reviewedBy', 'decidedBy',
  'checks', 'documents', 'docs', 'files', 'sla', 'slaDueAt', 'dueAt', 'requestedItems', 'message']);

export function mapVerification(v) {
  const u = v.user || v.creator || v.brand || v.profile || {};
  const k = v.kyc && typeof v.kyc === 'object' ? v.kyc : v;
  const steps = (k.steps && typeof k.steps === 'object') ? k.steps : {};
  const pan = steps.pan || {}, idd = steps.id || {}, bank = steps.bank || {};
  const kindRaw = str(pick(v.kind, v.accountType, v.role, u.role, v.brand ? 'brand' : '', 'creator')).toLowerCase();
  const rawStatus = str(pick(v.status, k.status, v.kycStatus)).toLowerCase();
  const extra = Object.entries(v).filter(([key, val]) => !MAPPED.has(key) && val != null && val !== '' && typeof val !== 'object').map(([key, val]) => [key, String(val)]);
  /* automated checks: [{ key, label, status|ok, blocking, message }] or { pan: {...}, ... } */
  const rawChecks = Array.isArray(v.checks) ? v.checks : v.checks && typeof v.checks === 'object' ? Object.entries(v.checks).map(([key, c]) => (c && typeof c === 'object' ? { key, ...c } : { key, status: c })) : [];
  const checks = rawChecks.map((c, i) => {
    const s = str(pick(c.status, c.result, c.ok === true ? 'pass' : c.ok === false ? 'fail' : '', c.passed === true ? 'pass' : c.passed === false ? 'fail' : '')).toLowerCase();
    const tone = /pass|ok|match|valid|clear|success/.test(s) ? 'ok' : /warn|review|partial|manual/.test(s) ? 'warn' : s ? 'err' : 'warn';
    return { key: str(pick(c.key, c.code, c.name, i)), name: str(pick(c.label, c.name, c.title, c.key, c.code, 'Check')), tone, status: s, blocking: !!c.blocking, message: str(pick(c.message, c.detail, c.details && typeof c.details === 'string' ? c.details : '', c.reason)) };
  });
  /* documents with 5-minute signed links */
  const docs = arr(pick(v.documents, v.docs, v.files)).map((d, i) => ({ key: str(pick(d.id, d.key, i)), name: str(pick(d.label, d.name, d.type, d.kind, 'Document')), url: str(pick(d.url, d.downloadUrl, d.signedUrl)), expiresAt: str(pick(d.expiresAt, d.urlExpiresAt)) }));
  return {
    id: str(v.id), kind: kindRaw === 'brand' ? 'brand' : 'creator',
    status: VSTATUS[rawStatus] || 'pending', rawStatus,
    name: str(pick(v.name, v.fullName, v.displayName, v.brandName, u.brandName, u.displayName, u.fullName, u.name, u.email, v.email, 'Unnamed account')),
    email: str(pick(v.email, u.email)), phone: str(pick(v.phone, u.phone)), accountId: str(pick(v.profileId, v.creatorId, v.brandId, u.id, v.userId)), userId: str(pick(v.userId, u.userId, u.id)),
    submittedAt: str(pick(v.submittedAt, k.submittedAt, v.createdAt)), decidedAt: str(pick(v.decidedAt, v.reviewedAt, k.verifiedAt, v.verifiedAt)),
    decidedBy: str(pick(v.decidedBy && typeof v.decidedBy === 'object' ? (v.decidedBy.fullName || v.decidedBy.email) : v.decidedBy, v.reviewedBy && typeof v.reviewedBy === 'object' ? (v.reviewedBy.fullName || v.reviewedBy.email) : v.reviewedBy)),
    reason: str(pick(v.rejectionReason, k.rejectionReason, v.reason, v.note, v.message)),
    slaDueAt: str(pick(v.slaDueAt, v.dueAt, v.sla && typeof v.sla === 'object' ? v.sla.dueAt : '')),
    pan: { done: !!pan.done, masked: pan.panLast4 ? '•••••' + String(pan.panLast4).padStart(4, '•') : str(pick(pan.masked, pan.panMasked)), name: str(pan.nameOnPan) },
    idDoc: { done: !!idd.done, type: ID_TYPE[str(idd.idType)] || str(idd.idType), uploadId: str(idd.uploadId) },
    bank: { done: !!bank.done, masked: bank.accountLast4 ? '••••' + bank.accountLast4 : str(pick(bank.masked, bank.accountMasked)), ifsc: str(bank.ifsc), holder: str(bank.accountHolderName) },
    checks, docs, raw: v, extra
  };
}
/* "5 min ago" against the real clock */
export function sinceNow(s) {
  const t = Date.parse(s); if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 6e4));
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60); if (h < 24) return h + ' h ago';
  const d = Math.round(h / 24); return d === 1 ? 'yesterday' : d + ' days ago';
}

/* forget everything loaded for a signed-in admin (on sign-out) */
export function forgetSession() { clearInterval(timer); timer = 0; state.counts = {}; state.cstatus = 'idle'; state.unread = 0; state.escrow = null; }
