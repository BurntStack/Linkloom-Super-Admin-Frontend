/* The admin API surface (/v1/admin/...), one function per endpoint, as the backend handoff guide lists it.
   Paths were checked against the live backend; where the guide and the backend differ the backend wins
   (account enforcement is /v1/admin/users/<user_id>/..., not /v1/admin/users/accounts/<user_id>/...).
   Money is integer paise everywhere. Writes that move money send an Idempotency-Key. */
import { data } from './core.js';
import { get, post, put, patch, page, download } from './api.js';

const A = '/v1/admin';
const e = encodeURIComponent;

export const api = {
  /* B. users and accounts */
  creators: (q, cursor) => page(`${A}/users/creators/`, { query: q, cursor }),
  creator: id => get(`${A}/users/creators/${e(id)}/`),
  updateCreator: (id, body) => patch(`${A}/users/creators/${e(id)}/`, body),
  brands: (q, cursor) => page(`${A}/users/brands/`, { query: q, cursor }),
  brand: id => get(`${A}/users/brands/${e(id)}/`),
  suspend: (userId, body) => post(`${A}/users/${e(userId)}/suspend/`, body),
  reactivate: (userId, body) => post(`${A}/users/${e(userId)}/reactivate/`, body),
  passwordReset: userId => post(`${A}/users/${e(userId)}/password-reset/`, {}),
  sessions: userId => page(`${A}/users/${e(userId)}/sessions/`, { limit: 50 }),
  revokeSessions: (userId, body = {}) => post(`${A}/users/${e(userId)}/sessions/revoke/`, body),
  categories: (q, cursor) => page(`${A}/users/categories/`, { query: q, cursor, limit: 100 }),
  addCategory: body => post(`${A}/users/categories/`, body),
  updateCategory: (id, body) => patch(`${A}/users/categories/${e(id)}/`, body),
  mergeCategory: (id, body) => post(`${A}/users/categories/${e(id)}/merge/`, body),
  featured: () => page(`${A}/users/featured-creators/`, { limit: 100 }),
  orderFeatured: creatorIds => put(`${A}/users/featured-creators/order/`, { creatorIds }),

  /* C. verification desk */
  verifications: (q, cursor) => page(`${A}/verifications/`, { query: q, cursor }),
  verification: id => get(`${A}/verifications/${e(id)}/`),
  approveVerification: id => post(`${A}/verifications/${e(id)}/approve/`, {}),
  rejectVerification: (id, body) => post(`${A}/verifications/${e(id)}/reject/`, body),
  requestInfo: (id, body) => post(`${A}/verifications/${e(id)}/request-info/`, body),

  /* D. campaign moderation */
  campaigns: (q, cursor) => page(`${A}/campaigns/`, { query: q, cursor }),
  campaign: id => get(`${A}/campaigns/${e(id)}/`),
  campaignAction: (id, action, body = {}) => post(`${A}/campaigns/${e(id)}/${action}/`, body),   // approve reject hide remove restore

  /* E. moderation and safety */
  reports: (q, cursor) => page(`${A}/moderation/abuse-reports/`, { query: q, cursor }),
  report: id => get(`${A}/moderation/abuse-reports/${e(id)}/`),
  reportAction: (id, action, body) => post(`${A}/moderation/abuse-reports/${e(id)}/${action}/`, body),   // remove warn suspend-account dismiss
  bidAlerts: (q, cursor) => page(`${A}/moderation/bid-alerts/`, { query: q, cursor }),
  bidAlertAction: (id, action, body) => post(`${A}/moderation/bid-alerts/${e(id)}/${action}/`, body),   // freeze-bids suspend-accounts warn dismiss
  reviews: (q, cursor) => page(`${A}/moderation/reviews/`, { query: q, cursor }),
  reviewAction: (id, action, body = {}) => post(`${A}/moderation/reviews/${e(id)}/${action}/`, body),     // delete keep

  /* F. finance and escrow */
  orders: (q, cursor) => page(`${A}/finance/orders/`, { query: q, cursor }),
  pipeline: () => get(`${A}/finance/orders/pipeline/`),
  order: id => get(`${A}/finance/orders/${e(id)}/`),
  forceRelease: (id, body, key) => post(`${A}/finance/orders/${e(id)}/force-release/`, body, { headers: { 'Idempotency-Key': key } }),
  refund: (id, body, key) => post(`${A}/finance/orders/${e(id)}/refund/`, body, { headers: { 'Idempotency-Key': key } }),
  disputes: (q, cursor) => page(`${A}/finance/disputes/`, { query: q, cursor }),
  dispute: id => get(`${A}/finance/disputes/${e(id)}/`),
  resolveDispute: (id, body) => post(`${A}/finance/disputes/${e(id)}/resolve/`, body),
  rules: () => get(`${A}/finance/rules/`),
  summary: months => get(`${A}/finance/summary/`, { query: { months } }),
  payouts: (q, cursor) => page(`${A}/finance/payouts/`, { query: q, cursor }),
  exportPayouts: q => download(`${A}/finance/payouts/export/`, { query: q, filename: 'linkloom-payouts.csv' }),

  /* G. system */
  dashboard: () => get(`${A}/system/dashboard/`),
  counts: () => get(`${A}/system/counts/`),
  notifications: (q, cursor) => page(`${A}/system/notifications/`, { query: q, cursor, limit: 50 }),
  unreadCount: () => get(`${A}/system/notifications/unread-count/`),
  readNotification: id => post(`${A}/system/notifications/${e(id)}/read/`, {}),
  readAllNotifications: () => post(`${A}/system/notifications/read-all/`, {}),
  auditLog: (q, cursor) => page(`${A}/system/audit-log/`, { query: q, cursor, limit: 50 }),
  verifyAudit: () => get(`${A}/system/audit-log/verify/`),
  exportAudit: q => download(`${A}/system/audit-log/export/`, { query: q, filename: 'linkloom-audit-log.csv' })
};

/* ---------- roles ----------
   super_admin: everything; trust_safety: verification, campaigns, abuse reports, bid alerts, reviews;
   finance: read-only financials, orders and payout exports. The backend enforces this; the console only uses it
   to explain and to switch off buttons that would be refused. */
export const ROLE_NAME = { super_admin: 'Super admin', trust_safety: 'Trust & safety', finance: 'Finance' };
export const role = () => (data.me && data.me.adminRole) || '';
const AREAS = {
  verify: ['super_admin', 'trust_safety'],
  campaigns: ['super_admin', 'trust_safety'],
  moderation: ['super_admin', 'trust_safety'],
  accounts: ['super_admin', 'trust_safety'],
  catalog: ['super_admin', 'trust_safety'],           // categories, featured order, badges and tags
  finance: ['super_admin', 'finance'],                 // reading orders, disputes, summaries, payouts
  disputes: ['super_admin'],                           // resolving a dispute
  money: ['super_admin'],                              // force-release and refund
  audit: ['super_admin']
};
/* may the signed-in admin do this? Unknown role (older tokens): let the backend decide. */
export const can = area => { const r = role(); return !r || !AREAS[area] || AREAS[area].includes(r); };
export const whoCan = area => (AREAS[area] || []).map(r => ROLE_NAME[r]).join(' or ');

/* ---------- reading records whose exact shape the guide does not give ---------- */
export const str = v => (v == null ? '' : String(v));
export const pick = (...v) => v.find(x => x != null && x !== '');
export const num = v => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : null; };
export const arr = v => (Array.isArray(v) ? v : []);
/* the name of whatever a record points at: a string, or an object with one of the usual name fields */
export const nameOf = o => (o == null ? '' : typeof o !== 'object' ? String(o)
  : str(pick(o.displayName, o.brandName, o.fullName, o.name, o.title, o.email, o.handle, o.id)));
export const idOf = o => (o == null ? '' : typeof o !== 'object' ? String(o) : str(pick(o.id, o.uuid, o.userId)));
/* the user account behind a creator or brand profile (account actions take the user id) */
export const userIdOf = r => str(pick(r.userId, r.user && typeof r.user === 'object' ? r.user.id : r.user, r.accountId, r.account && r.account.id, r.ownerId, r.owner && r.owner.id));

/* money fields, by name; everything else is shown as it came */
const MONEY = /(amount|paise|price|budget|escrow|balance|revenue|commission|gateway|gmv|payout|fee|refund|released|held|net|gets|value|total(?!count))/i;
const NOT_MONEY = /(count|number|qty|quantity|percent|pct|rate|bps|ratio|days|hours|months|orders$|^n$|id$)/i;
export const isMoneyKey = k => MONEY.test(k) && !NOT_MONEY.test(k);
export const label = k => String(k).replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()).replace(/\b(Id|Pan|Cin|Gst|Gstin|Ifsc|Kyc|Ip|Sla|Url)\b/gi, w => w.toUpperCase());
export const isDateKey = k => /(At|_at|Date|date|On|_on)$/.test(k) || /^(created|updated|submitted|decided|closes|expires)/i.test(k);
