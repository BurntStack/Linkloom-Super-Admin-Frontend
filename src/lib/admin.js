/* Everything the console loads from the backend's /v1/admin/ API, and every admin action it can send.
   Records are mapped into the shapes the screens draw (data.creators, data.brands, data.verifications, ...).
   The backend documents the endpoints but not every field, so each mapper reads the obvious names defensively and
   falls back to empty values, never to made-up ones.
   Loading: ensure(['creators', ...]) loads what a screen needs once; reload([...]) fetches again after an action.
   Status per key lives in data.res[key] = { status: 'idle' | 'loading' | 'ready' | 'failed' | 'forbidden', error, loaded }. */
import { data, store } from './core.js';
import { get, list, request, paise, ApiError, auth } from './api.js';

const TIMEOUT = 60000;                                   // the server sleeps when idle and can take a while to wake

/* ---------- small readers ---------- */
const P = (...v) => v.find(x => x !== undefined && x !== null && x !== '');
const N = (...v) => { const x = P(...v); if (x == null || typeof x === 'object') return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
const T = v => (v == null ? '' : typeof v === 'object' ? String(P(v.name, v.label, v.title, v.displayName, v.fullName, v.email, v.id) ?? '') : String(v));
const A = v => (Array.isArray(v) ? v : []);
const B = (...v) => { const x = P(...v); return x === true || x === 'true' || x === 1; };
const money = (...v) => { for (const x of v) { const p = paise(x); if (p != null) return p; } return 0; };
const idOf = v => (v == null ? '' : typeof v === 'object' ? T(P(v.id, v.uuid, v.pk)) : String(v));
const lower = v => T(v).toLowerCase();
const names = v => A(v).map(x => (typeof x === 'string' ? x : T(P(x && x.name, x && x.label, x && x.title, x && x.slug)))).filter(Boolean);
const countOf = v => (Array.isArray(v) ? v.length : N(v) || 0);
const who = v => T(P(v && v.fullName, v && v.displayName, v && v.name, v && v.brandName, v && v.email, typeof v === 'string' ? v : null));

/* people seen inside other records (an order's brand, a review's creator) but not in the account lists */
data.refs = data.refs || { c: {}, b: {} };
const refC = v => { const id = idOf(v); if (id && typeof v === 'object' && !data.refs.c[id]) data.refs.c[id] = mapCreator(v); return id; };
const refB = v => { const id = idOf(v); if (id && typeof v === 'object' && !data.refs.b[id]) data.refs.b[id] = mapBrand(v); return id; };

/* ---------- accounts ---------- */
const KYC = { verified: 'verified', approved: 'verified', complete: 'verified', completed: 'verified', pending: 'under_review', submitted: 'under_review', under_review: 'under_review', in_review: 'under_review',
  action_needed: 'action_needed', info_requested: 'action_needed', needs_info: 'action_needed', rejected: 'rejected', not_started: 'not_started', none: 'not_started', unverified: 'not_started' };
const kycOf = v => KYC[lower(v && typeof v === 'object' ? v.status : v)] || 'not_started';
const suspended = (o, u = {}) => /suspend|ban|block|disabled/.test(lower(P(o.status, o.accountStatus, u.status))) || B(o.isSuspended, u.isSuspended, o.suspended === true ? true : null) || u.isActive === false;
const suspension = o => { const s = P(o.suspension, typeof o.suspended === 'object' ? o.suspended : null) || {};
  return { at: T(P(s.at, s.createdAt, s.suspendedAt, o.suspendedAt)), reason: T(P(s.reason, s.note, o.suspensionReason)), by: who(P(s.by, s.actor, s.admin)) }; };

export function mapCreator(c = {}) {
  const u = c.user && typeof c.user === 'object' ? c.user : {};
  const pf = c.platforms && typeof c.platforms === 'object' && !Array.isArray(c.platforms) ? c.platforms : {};
  const main = pf[c.primaryPlatform] || Object.values(pf)[0] || {};
  const handle = T(P(c.handle, c.instagram && '@' + String(c.instagram).replace(/^@/, ''), c.youtube && '@' + String(c.youtube).replace(/^@/, ''), main.handle && '@' + String(main.handle).replace(/^@/, '')));
  const followers = N(c.followers, c.followerCount, c.followersCount) ?? Object.values(pf).map(p => N(p && p.followersCount)).filter(v => v != null).sort((a, b) => b - a)[0] ?? 0;
  const status = suspended(c, u) ? 'suspended' : 'active';
  const m = c.metrics || c.fulfillment || c.stats || {};
  return {
    id: idOf(c), userId: idOf(P(c.userId, u.id, c.user, c.id)), name: T(P(c.displayName, c.name, c.fullName, u.fullName, u.displayName, u.email, 'Creator')),
    handle, city: T(P(c.city, c.location, u.city)) || '—', email: T(P(c.email, u.email)), phone: T(P(c.phone, u.phone)),
    status, suspended: status === 'suspended' ? suspension(c) : null,
    kyc: kycOf(P(c.kycStatus, c.kyc, c.verificationStatus, c.verified === true ? 'verified' : null)),
    joined: T(P(c.joinedAt, c.createdAt, c.dateJoined, u.dateJoined, u.createdAt)), lastActive: T(P(c.lastActive, c.lastActiveAt, c.lastLogin, u.lastLogin)),
    followers, er: N(c.engagementRate, c.er, main.engagementRate), rating: N(c.rating, c.averageRating), jobs: N(c.jobs, c.completedOrders, c.approvedJobs, m.completedOrders, m.approvedJobs) || 0,
    earned: money(c.earned, c.totalEarned, c.paidOut, m.paidOut, m.earned),
    badges: names(c.badges), tags: names(P(c.tags, c.categories)), featured: B(c.featured, c.isFeatured),
    reports: countOf(P(c.reportCount, c.openReports, c.abuseReports, c.reports)),
    detail: null
  };
}
export function mapBrand(b = {}) {
  const u = b.user && typeof b.user === 'object' ? b.user : {};
  const status = suspended(b, u) ? 'suspended' : 'active';
  const st = b.stats || b.campaignStats || {};
  const email = T(P(b.email, b.businessEmail, b.workEmail, u.email));
  return {
    id: idOf(b), userId: idOf(P(b.userId, u.id, b.user, b.id)), name: T(P(b.brandName, b.companyName, b.name, b.displayName, u.fullName, email, 'Brand')),
    contact: T(P(b.contactName, b.contact, b.contactPerson, b.authorisedPerson, b.authorizedPerson && who(b.authorizedPerson), u.fullName)) || '—',
    email, mailVerified: B(b.emailVerified, b.mailVerified, u.emailVerified), legal: T(P(b.legalName, b.legal, b.registeredName)),
    gstin: T(P(b.gstin, b.GSTIN)), pan: T(P(b.pan, b.companyPan)), cin: T(P(b.cin, b.llpin)), regVerified: B(b.regVerified, b.gstinVerified, b.registrationVerified),
    city: T(P(b.city, b.location)) || '—', status, suspended: status === 'suspended' ? suspension(b) : null,
    verify: kycOf(P(b.verificationStatus, b.verification, b.kycStatus, b.verified === true ? 'verified' : null)),
    joined: T(P(b.joinedAt, b.createdAt, u.dateJoined)), postsLast30: N(b.postsLast30, b.campaignsLast30, st.last30Days, st.postsLast30) || 0,
    postsAvg: N(b.postsAvg, b.avgMonthlyCampaigns, st.monthlyAverage, st.postsAvg) || 0, spent: money(b.spent, b.totalSpent, st.spent),
    open: N(b.openCampaigns, b.open, st.open, st.live) || 0, reports: countOf(P(b.reportCount, b.openReports, b.reports)),
    spikeFlag: b.postingSpike === true, detail: null
  };
}

/* ---------- verification desk ---------- */
const VST = { pending: 'pending', submitted: 'pending', under_review: 'pending', in_review: 'pending', approved: 'approved', verified: 'approved', rejected: 'rejected', info_requested: 'info_requested', action_needed: 'info_requested', needs_info: 'info_requested' };
const ID_TYPE = { aadhaar: 'Aadhaar', passport: 'Passport', voter_id: 'Voter ID', driving_licence: 'Driving licence', driving_license: 'Driving licence' };
const CHECK_OK = { pass: 'ok', passed: 'ok', ok: 'ok', success: 'ok', true: 'ok', warn: 'warn', warning: 'warn', review: 'warn', fail: 'bad', failed: 'bad', error: 'bad', false: 'bad', blocked: 'bad' };
function mapChecks(raw) {
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.entries(raw).map(([k, v]) => ({ key: k, ...(typeof v === 'object' ? v : { status: v }) })) : [];
  return rows.map((c, i) => {
    const st = lower(P(c.status, c.result, c.ok === true ? 'pass' : c.ok === false ? 'fail' : c.passed === true ? 'pass' : c.passed === false ? 'fail' : null));
    const block = B(c.blocking, c.isBlocking);
    return { k: T(P(c.key, c.code, c.id, 'c' + i)), n: T(P(c.label, c.name, c.title, c.key, 'Check')), ok: CHECK_OK[st] || (block ? 'bad' : 'warn'), t: T(P(c.message, c.detail, c.summary, c.value, st)), block };
  });
}
function mapDocs(v) {
  const out = [];
  const add = (label, x) => { const url = T(P(x && x.url, x && x.downloadUrl, x && x.signedUrl, typeof x === 'string' && /^https?:/.test(x) ? x : null)); if (url) out.push({ label: T(P(x && x.label, x && x.type, label)), url }); };
  A(P(v.documents, v.docs, v.files)).forEach((d, i) => add('Document ' + (i + 1), d));
  if (v.documents && !Array.isArray(v.documents) && typeof v.documents === 'object') Object.entries(v.documents).forEach(([k, d]) => add(k, d));
  return out;
}
export function mapVerification(v = {}) {
  const u = P(v.user, v.creator, v.brand, v.profile, v.account) || {};
  const k = v.kyc && typeof v.kyc === 'object' ? v.kyc : v;
  const steps = k.steps && typeof k.steps === 'object' ? k.steps : {};
  const idd = P(v.idDocument, v.id_doc, steps.id) || {}, pan = P(v.panDetails, v.pan && typeof v.pan === 'object' ? v.pan : null, steps.pan) || {};
  const bank = P(v.bankDetails, v.bank, v.payout, steps.bank) || {}, selfie = P(v.selfie, steps.selfie) || {};
  const biz = P(v.business, v.company) || {}, per = P(v.person, v.authorisedPerson, v.authorizedPerson, v.signatory) || {}, bill = P(v.billing) || {};
  const kind = lower(P(v.kind, v.accountType, v.type, v.role, u.role, v.brand ? 'brand' : 'creator')) === 'brand' ? 'brand' : 'creator';
  const name = T(P(v.name, v.displayName, v.brandName, u.brandName, u.displayName, u.fullName, u.name, u.email, v.email, 'Unnamed account'));
  const accountId = idOf(P(v.accountId, v.profileId, kind === 'brand' ? v.brandId : v.creatorId, u.id));
  if (accountId && typeof u === 'object' && u.id) (kind === 'brand' ? refB : refC)(u);
  return {
    id: idOf(v), kind, account: accountId, userId: idOf(P(v.userId, u.userId, u.user)), name, email: T(P(v.email, u.email)),
    submitted: T(P(v.submittedAt, k.submittedAt, v.createdAt)), status: VST[lower(P(v.status, k.status))] || 'pending',
    decidedAt: T(P(v.decidedAt, v.reviewedAt, v.verifiedAt, v.updatedAt)), decidedBy: who(P(v.decidedBy, v.reviewedBy)),
    decision: T(P(v.decisionNote, v.rejectionReason, k.rejectionReason, v.reason, v.note)), note: T(P(v.applicantNote, v.flagNote)),
    slaDueAt: T(P(v.slaDueAt, v.dueAt, v.sla && v.sla.dueAt)),
    checks: mapChecks(P(v.checks, v.validations, v.automatedChecks)),
    id_doc: { type: ID_TYPE[lower(P(idd.type, idd.idType))] || T(P(idd.type, idd.idType)), masked: T(P(idd.masked, idd.number, idd.maskedNumber, idd.last4 && '•••• ' + idd.last4)), name: T(P(idd.name, idd.nameOnId)), dob: T(P(idd.dob, idd.dateOfBirth)), submitted: B(idd.done, idd.submitted, idd.uploadId ? true : null) },
    pan: { masked: T(P(pan.masked, pan.maskedPan, pan.panLast4 && '•••••' + pan.panLast4, typeof v.pan === 'string' ? v.pan : null)), name: T(P(pan.name, pan.nameOnPan)), submitted: B(pan.done, pan.submitted) },
    bank: { kind: /upi/i.test(T(P(bank.kind, bank.type, bank.method))) || bank.vpa ? 'UPI' : 'Bank', masked: T(P(bank.masked, bank.maskedAccount, bank.vpa, bank.accountLast4 && '••••' + bank.accountLast4)), holder: T(P(bank.holder, bank.accountHolderName, bank.nameAtBank)), ifsc: T(bank.ifsc), submitted: B(bank.done, bank.submitted) },
    selfie: { liveness: T(P(selfie.liveness, selfie.status)), faceMatch: N(selfie.faceMatch, selfie.matchScore) },
    socials: A(P(v.socials, v.socialAccounts, u.socials)).map(x => ({ p: lower(P(x.platform, x.p)) === 'youtube' ? 'youtube' : 'instagram', handle: T(P(x.handle, x.username)), followers: N(x.followers, x.followersCount) || 0, linked: B(x.linked, x.verified, x.connected), age: T(P(x.age, x.accountAge)) })),
    business: { legal: T(P(biz.legal, biz.legalName, v.legalName)), gstin: T(P(biz.gstin, v.gstin)), gstinStatus: T(P(biz.gstinStatus, v.gstinStatus)), pan: T(P(biz.pan, biz.companyPan, v.companyPan)), cin: T(P(biz.cin, biz.llpin, v.cin)) },
    person: { name: T(P(per.name, per.fullName)), designation: T(per.designation), mail: T(P(per.mail, per.email, v.email, u.email)), mailVerified: B(per.mailVerified, per.emailVerified) },
    billing: { address: T(P(bill.address, v.billingAddress)), email: T(P(bill.email, v.billingEmail)) },
    docs: mapDocs(v)
  };
}

/* ---------- moderation ---------- */
const RTYPE = { user: 'profile', account: 'profile', profile: 'profile', creator: 'profile', brand: 'profile', message: 'message', chat: 'message', content: 'content', delivery: 'content', file: 'content', review: 'review', campaign: 'campaign' };
const RSTATUS = { open: 'open', pending: 'open', new: 'open', actioned: 'actioned', resolved: 'actioned', removed: 'actioned', warned: 'actioned', suspended: 'actioned', dismissed: 'dismissed', rejected: 'dismissed' };
const SEV = s => { const v = lower(s); return v === 'high' || v === 'critical' ? 'high' : v === 'low' ? 'low' : v ? 'medium' : 'medium'; };
export function mapReport(r = {}) {
  const tgt = r.target && typeof r.target === 'object' ? r.target : {};
  const type = RTYPE[lower(P(r.targetType, r.type, r.kind, tgt.type))] || 'content';
  const acc = P(r.account, r.reportedAccount, r.reportedUser, tgt.account, tgt.owner) || {};
  const akind = lower(P(acc.role, acc.kind, acc.type)) === 'brand' ? 'b' : acc.id || acc.name ? 'c' : 'x';
  const accId = akind === 'b' ? refB(acc) : akind === 'c' ? refC(acc) : '';
  const reporters = A(P(r.reporters, r.reports)).map(x => [who(P(x.reporter, x.by, x.user, x)) || 'User', T(P(x.at, x.createdAt))]);
  return {
    id: idOf(r), type, target: T(P(r.targetLabel, r.title, tgt.title, tgt.name, tgt.label, r.summary)) || 'Reported item',
    by: who(P(r.reporter, r.reportedBy, r.by)) || (reporters[0] && reporters[0][0]) || 'User', reason: T(P(r.reason, r.category)), excerpt: T(P(r.excerpt, r.text, tgt.excerpt, tgt.text)),
    at: T(P(r.createdAt, r.reportedAt, r.at)), status: RSTATUS[lower(r.status)] || 'open', severity: SEV(r.severity), count: N(r.count, r.reportCount) || Math.max(1, reporters.length),
    link: idOf(P(r.targetId, tgt.id)), action: T(P(r.action, r.outcome, r.resolution)), by_admin: who(P(r.resolvedBy, r.decidedBy)), closedAt: T(P(r.resolvedAt, r.closedAt)), note: T(P(r.resolutionNote, r.note)),
    acct: akind === 'x' && !acc.name ? null : { kind: akind, id: accId, name: who(acc) || 'Account' }, reporters,
    thread: A(P(r.thread, r.context && r.context.messages)).map(m => [lower(P(m.senderRole, m.role)) === 'brand' ? 'b' : 'c', T(P(m.at, m.createdAt)), T(P(m.text, m.body)), B(m.reported, m.isReported), who(P(m.sender, m.from))]),
    file: tgt.fileName || tgt.url ? [T(P(tgt.fileName, tgt.name)), T(P(tgt.meta, tgt.size)), T(P(tgt.caption, r.excerpt))] : null
  };
}
export function mapBidAlert(a = {}) {
  const accs = A(P(a.accounts, a.users, a.creators));
  return {
    id: idOf(a), pattern: T(P(a.pattern, a.type, a.kind, a.title)) || 'Bid pattern', detail: T(P(a.detail, a.description, a.summary)),
    accounts: accs.map(x => (typeof x === 'object' ? refC(x) || who(x) : String(x))), at: T(P(a.detectedAt, a.createdAt, a.at)),
    status: RSTATUS[lower(a.status)] || 'open', risk: N(a.risk, a.riskScore, a.score) || 0, frozen: B(a.frozen, a.bidsFrozen), outcome: T(P(a.outcome, a.resolution)),
    signals: A(a.signals).map(s => [T(P(s.label, s.text, s.name, s)), N(s.points, s.score, s.weight) || 0]),
    bids: { total: N(a.bidCount, a.totalBids) ?? A(a.bids).length, rows: A(a.bids).slice(0, 8).map(b => ['c', who(P(b.creator, b.account, b.user)) || 'Account', idOf(P(b.campaign, b.campaignId)), money(b.amount, b.price), T(P(b.createdAt, b.at)), T(P(b.why, b.reason, b.flag))]) },
    pitch: T(a.pitch)
  };
}
const REV = { visible: 'visible', published: 'visible', kept: 'visible', flagged: 'flagged', reported: 'flagged', removed: 'removed', deleted: 'removed', hidden: 'removed' };
export function mapReview(r = {}) {
  const from = P(r.brand, r.author, r.from), to = P(r.creator, r.subject, r.to);
  return {
    id: idOf(r), from: who(from) || 'Brand', fromId: from && typeof from === 'object' ? refB(from) : '', to: who(to) || 'Creator', toId: to && typeof to === 'object' ? refC(to) : '',
    stars: N(r.stars, r.rating) || 0, text: T(P(r.text, r.comment, r.body)), at: T(P(r.createdAt, r.at)), order: idOf(P(r.orderId, r.order)), status: REV[lower(r.status)] || 'visible',
    mod: r.moderatedBy || r.moderation ? { by: who(P(r.moderatedBy, r.moderation && r.moderation.by)), reason: T(P(r.moderationReason, r.moderation && r.moderation.reason)) } : null
  };
}

/* ---------- marketplace ---------- */
const CSTATUS = { pending: 'pending', pending_review: 'pending', in_review: 'pending', live: 'live', open: 'live', published: 'live', active: 'live', hidden: 'hidden', removed: 'removed', deleted: 'removed', rejected: 'rejected', closed: 'closed', completed: 'closed', draft: 'draft' };
export function mapCampaign(k = {}) {
  const br = P(k.brand, k.brandProfile) || {};
  const sig = P(k.signals, k.briefSignals);
  return {
    id: idOf(k), brand: typeof br === 'object' ? refB(br) : idOf(P(k.brandId, br)), brandName: who(br), title: T(P(k.title, k.name)) || 'Untitled campaign',
    platform: lower(k.platform) === 'youtube' ? 'youtube' : 'instagram', budget: money(k.budget, k.budgetMax, k.budgetMin), bids: N(k.bidCount, k.bids, k.bidsSummary && k.bidsSummary.total) || 0,
    posted: T(P(k.postedAt, k.createdAt, k.submittedAt)), status: CSTATUS[lower(k.status)] || 'live', flags: N(k.flags, k.reportCount, k.flagCount) || 0, rule: T(P(k.ruleBroken, k.rule)),
    mod: k.moderation || k.moderatedBy ? { by: who(P(k.moderatedBy, k.moderation && k.moderation.by)), at: T(P(k.moderatedAt, k.moderation && k.moderation.at)), reason: T(P(k.moderationReason, k.moderation && k.moderation.reason)) } : null,
    brief: { text: T(P(k.brief, k.description)), del: T(P(k.deliverables)) || 'Not stated' },
    signals: Array.isArray(sig) ? sig.map(s => [!(s.ok === false || /fail|bad|warn/.test(lower(P(s.status, s.level)))), T(P(s.label, s.message, s.text))]) : null,
    changed: names(k.changedFields), bidsSummary: k.bidsSummary || null
  };
}

/* ---------- orders, disputes, money ---------- */
const PHASE = { invited: 'invited', pending: 'invited', accepted: 'accepted', awaiting_payment: 'accepted', funded: 'funded', paid: 'funded', in_escrow: 'funded', in_progress: 'in_progress', active: 'in_progress',
  submitted: 'submitted', delivered: 'submitted', revision: 'revision', revision_requested: 'revision', approved: 'approved', released: 'released', completed: 'released', paid_out: 'released',
  disputed: 'disputed', refunded: 'refunded', cancelled: 'refunded' };
export function mapOrder(o = {}) {
  const f = o.financials || o.breakdown || o.money || {};
  const amount = money(o.amount, o.price, f.price);
  return {
    id: idOf(o), brand: refB(P(o.brand, o.brandId)), creator: refC(P(o.creator, o.creatorId)), title: T(P(o.title, o.campaignTitle, o.campaign && o.campaign.title, o.package && o.package.title)) || 'Order',
    amount, phase: PHASE[lower(P(o.phase, o.status))] || 'in_progress', funded: T(P(o.fundedAt, o.paidAt)), due: T(P(o.dueAt, o.dueDate, o.deadline)), released: T(o.releasedAt), refunded: T(o.refundedAt),
    forced: T(P(o.forced, o.override)), dispute: idOf(P(o.disputeId, o.dispute)),
    money: { price: money(f.price) || amount, commission: money(f.commission), gateway: money(f.gateway, f.gatewayFee), creatorGets: money(f.creatorGets) || amount, linkloom: money(f.linkloomNet, f.linkloom) }
  };
}
export function mapDispute(d = {}) {
  const by = lower(P(d.openedByRole, d.raisedByRole, d.openedBy && d.openedBy.role, d.by));
  return {
    id: idOf(d), order: idOf(P(d.orderId, d.order)), opened: T(P(d.openedAt, d.createdAt)), by: by === 'brand' ? 'brand' : 'creator', claim: T(P(d.claim, d.reason, d.description)),
    evidence: names(P(d.evidence, d.attachments)), other: T(P(d.response, d.otherSide, d.counterClaim)) || 'No reply recorded.',
    status: /resolv|closed|decided/.test(lower(d.status)) ? 'resolved' : 'open', sla: T(P(d.slaDueAt, d.dueAt, d.sla)), kind: /pay/.test(lower(P(d.kind, d.type))) ? 'payment' : 'dispute',
    outcome: T(P(d.outcome, d.resolution)), reason: T(P(d.resolutionReason, d.adminReason)), by_admin: who(P(d.resolvedBy)), resolvedAt: T(d.resolvedAt)
  };
}
const PAY = { paid: 'paid', completed: 'paid', success: 'paid', scheduled: 'scheduled', pending: 'scheduled', queued: 'scheduled', processing: 'processing', sent: 'processing', cancelled: 'cancelled', failed: 'cancelled' };
export function mapPayout(p = {}) {
  return { id: idOf(p), creator: refC(P(p.creator, p.creatorId)), amount: money(p.amount), order: idOf(P(p.orderId, p.order)), at: T(P(p.paidAt, p.scheduledAt, p.createdAt)),
    method: T(P(p.method, p.maskedMethod, p.destination)) || '—', utr: T(P(p.utr, p.reference)), status: PAY[lower(p.status)] || 'scheduled' };
}
function mapSummary(s = {}) {
  const months = A(P(s.months, s.series, s.monthly)).map(m => ({ m: T(P(m.month, m.m, m.period)).slice(0, 7), subs: money(m.subscriptions, m.subs, m.revenue), gmv: money(m.gmv), gateway: money(m.gateway, m.gatewayFees) })).filter(m => /^\d{4}-\d{2}$/.test(m.m));
  const sub = s.subscribers || {};
  return { months, subscribers: { creators: N(sub.creators, s.creatorSubscribers) || 0, brands: N(sub.brands, s.brandSubscribers) || 0 } };
}
function mapRules(r = {}) {
  return { commissionPct: N(r.commissionPct, r.commissionPercent, r.commission_rate) ?? 0, gatewayPct: N(r.gatewayPct, r.gatewayFeePercent, r.gateway_rate) ?? 0 };
}

/* ---------- system ---------- */
export function mapAudit(e = {}) {
  return { id: idOf(e), at: T(P(e.at, e.createdAt, e.timestamp)), who: who(P(e.actor, e.admin, e.who, e.user)) || 'System', action: T(P(e.action, e.event, e.type)),
    target: T(P(e.targetLabel, e.target, e.object, e.targetId)), detail: T(P(e.reason, e.detail, e.note, e.message)), hash: T(P(e.hash, e.entryHash)).slice(0, 12), prev: T(P(e.prevHash, e.previousHash, e.prev)).slice(0, 12) };
}
const NGO = { verification: '#verify-', report: '#moderation-', abuse_report: '#moderation-', dispute: '#orders-', order: '#orders-', campaign: '#marketplace-', bid_alert: '#marketplace-bids' };
export function mapNotification(n = {}) {
  const kind = lower(P(n.kind, n.type, n.category));
  const ref = idOf(P(n.targetId, n.objectId, n.refId));
  const base = Object.keys(NGO).find(k => kind.includes(k));
  return { id: idOf(n), kind: /verif/.test(kind) ? 'verify' : /report|abuse/.test(kind) ? 'report' : /disput/.test(kind) ? 'dispute' : /bid/.test(kind) ? 'bids' : 'info',
    text: T(P(n.title, n.text, n.message, n.body)) || 'Notification', at: T(P(n.createdAt, n.at)), read: B(n.read, n.isRead, n.readAt ? true : null),
    go: T(P(n.link && String(n.link).startsWith('#') ? n.link : null, base ? NGO[base] + (base === 'bid_alert' ? '' : ref) : null)) };
}

/* ---------- loaders ---------- */
const all = (path, map, query) => async signal => (await list(path, { signal, query })).map(map);
const one = (path, map) => async signal => map((await get(path, { signal })) || {});
const LOAD = {
  creators: all('/v1/admin/users/creators/', mapCreator),
  brands: all('/v1/admin/users/brands/', mapBrand),
  verifications: all('/v1/admin/verifications/', mapVerification),
  reports: all('/v1/admin/moderation/abuse-reports/', mapReport),
  bidAlerts: all('/v1/admin/moderation/bid-alerts/', mapBidAlert),
  reviews: all('/v1/admin/moderation/reviews/', mapReview),
  campaigns: all('/v1/admin/campaigns/', mapCampaign, { filter: 'all' }),
  categories: async signal => (await list('/v1/admin/users/categories/', { signal })).map(c => ({ id: idOf(c), name: T(P(c.name, c.label, c.title, c)), count: N(c.creatorCount, c.count, c.creators) })),
  featured: async signal => (await list('/v1/admin/users/featured-creators/', { signal })).map(c => refC(P(c.creator, c))),
  orders: all('/v1/admin/finance/orders/', mapOrder),
  disputes: all('/v1/admin/finance/disputes/', mapDispute),
  payouts: all('/v1/admin/finance/payouts/', mapPayout),
  rules: one('/v1/admin/finance/rules/', mapRules),
  summary: async signal => mapSummary((await get('/v1/admin/finance/summary/', { signal, query: { months: 6 } })) || {}),
  audit: async signal => (await list('/v1/admin/system/audit-log/', { signal, max: 1000 })).map(mapAudit).sort((a, b) => String(a.at).localeCompare(String(b.at))),
  dashboard: one('/v1/admin/system/dashboard/', d => d),
  counts: one('/v1/admin/system/counts/', d => d),
  notifications: all('/v1/admin/system/notifications/', mapNotification)
};
/* where each key lands in data */
const PUT = {
  categories: rows => { data.categories = rows.map(r => r.name); data.catInfo = Object.fromEntries(rows.map(r => [r.name, r])); },
  featured: ids => { data.featuredOrder = ids; },
  payouts: rows => { data.finance.payouts = rows; },
  summary: s => { data.finance.months = s.months; data.finance.subscribers = s.subscribers; },
  rules: r => { data.rules = r; }
};
const EMPTY = { creators: [], brands: [], verifications: [], reports: [], bidAlerts: [], reviews: [], campaigns: [], categories: [], featured: [], orders: [], disputes: [], payouts: [], audit: [], notifications: [] };

data.res = data.res || {};
const res = k => (data.res[k] = data.res[k] || { status: 'idle', error: '', loaded: false });

async function load(k) {
  const r = res(k), c = new AbortController(), t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const v = await LOAD[k](c.signal);
    store.set(() => { (PUT[k] || (x => { data[k] = x; }))(v); Object.assign(r, { status: 'ready', error: '', loaded: true }); }, 'live');
  } catch (e) {
    const forbidden = e instanceof ApiError && e.status === 403;
    store.set(() => {
      if (!r.loaded && EMPTY[k]) (PUT[k] || (x => { data[k] = x; }))(EMPTY[k]);
      Object.assign(r, { status: forbidden ? 'forbidden' : 'failed', error: forbidden ? 'Your admin role cannot see this.' : e && e.name === 'AbortError' ? 'The server took too long to answer.' : (e && e.message) || 'It did not load.' });
    }, 'live');
  } finally { clearTimeout(t); }
}
/* load each key once */
export function ensure(keys) { keys.forEach(k => { const r = res(k); if (r.status === 'idle') { r.status = 'loading'; load(k); } }); }
/* fetch again (after an action); keeps what is on screen until the new answer arrives */
export function reload(keys) { return Promise.all(keys.map(k => { res(k).status = res(k).loaded ? 'ready' : 'loading'; return load(k); })); }
export function retry(keys) { keys.forEach(k => { if (['failed', 'idle'].includes(res(k).status)) { res(k).status = 'loading'; load(k); } }); store.set(() => {}, 'live'); }
export const state = k => res(k);
/* forget everything on sign-out */
export function forget() {
  Object.keys(data.res).forEach(k => { data.res[k] = { status: 'idle', error: '', loaded: false }; });
  Object.entries(EMPTY).forEach(([k, v]) => (PUT[k] || (x => { data[k] = x; }))(v));
  data.refs = { c: {}, b: {} }; data.dashboard = null; data.counts = null;
}

/* ---------- details (fetched when a page opens; merged into the list record) ---------- */
const merge = (key, rec) => store.set(() => { const arr = data[key]; const i = arr.findIndex(x => x.id === rec.id); if (i >= 0) arr[i] = { ...arr[i], ...rec }; else arr.push(rec); }, 'live');
export async function fetchVerification(id) { const raw = await get(`/v1/admin/verifications/${enc(id)}/`); const v = mapVerification(raw || {}); if (v.id) merge('verifications', v); return v; }
export async function fetchCreator(id) {
  const raw = (await get(`/v1/admin/users/creators/${enc(id)}/`)) || {};
  const c = { ...mapCreator(raw), detail: { orders: A(raw.orders).map(mapOrder), reports: A(P(raw.abuseReports, raw.reportsList)).map(mapReport), sessions: null } };
  if (c.id) merge('creators', c); return c;
}
export async function fetchBrand(id) {
  const raw = (await get(`/v1/admin/users/brands/${enc(id)}/`)) || {};
  const b = { ...mapBrand(raw), detail: { campaigns: A(raw.campaigns).map(mapCampaign), reports: A(P(raw.abuseReports, raw.reportsList)).map(mapReport) } };
  if (b.id) merge('brands', b); return b;
}
export async function fetchCampaign(id) { const k = mapCampaign((await get(`/v1/admin/campaigns/${enc(id)}/`)) || {}); if (k.id) merge('campaigns', k); return k; }
export async function fetchReport(id) { const r = mapReport((await get(`/v1/admin/moderation/abuse-reports/${enc(id)}/`)) || {}); if (r.id) merge('reports', r); return r; }
export async function fetchOrder(id) { const o = mapOrder((await get(`/v1/admin/finance/orders/${enc(id)}/`)) || {}); if (o.id) merge('orders', o); return o; }
export async function fetchDispute(id) { const d = mapDispute((await get(`/v1/admin/finance/disputes/${enc(id)}/`)) || {}); if (d.id) merge('disputes', d); return d; }
export async function fetchSessions(userId) {
  return (await list(`/v1/admin/users/accounts/${enc(userId)}/sessions/`, { max: 50 })).map(s => ({ id: idOf(s), d: T(P(s.device, s.userAgent, s.client)) || 'Device', p: T(P(s.city, s.location, s.ip)) || '—', at: T(P(s.createdAt, s.lastSeenAt, s.since)) }));
}
export const verifyAuditChain = () => get('/v1/admin/system/audit-log/verify/');

/* ---------- actions: each returns a promise; the confirm sheets wait for it ---------- */
const enc = encodeURIComponent;
const post = (path, body, headers) => request(path, { method: 'POST', body: body || {}, headers });
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2));
export const act = {
  approveVerification: (id, note) => post(`/v1/admin/verifications/${enc(id)}/approve/`, note ? { note } : {}),
  rejectVerification: (id, reason, note) => post(`/v1/admin/verifications/${enc(id)}/reject/`, { reason, note }),
  requestInfo: (id, items, message) => post(`/v1/admin/verifications/${enc(id)}/request-info/`, { items, message }),

  updateCreator: (id, patch) => request(`/v1/admin/users/creators/${enc(id)}/`, { method: 'PATCH', body: patch }),
  suspend: (userId, reason, note) => post(`/v1/admin/users/accounts/${enc(userId)}/suspend/`, { reason, note }),
  reactivate: (userId, reason) => post(`/v1/admin/users/accounts/${enc(userId)}/reactivate/`, { reason }),
  passwordReset: (userId, reason) => post(`/v1/admin/users/accounts/${enc(userId)}/password-reset/`, { reason }),
  revokeSessions: (userId, sessionIds, reason) => post(`/v1/admin/users/accounts/${enc(userId)}/sessions/revoke/`, { ...(sessionIds ? { sessionIds } : {}), reason }),
  addCategory: name => post('/v1/admin/users/categories/', { name }),
  renameCategory: (id, name) => request(`/v1/admin/users/categories/${enc(id)}/`, { method: 'PATCH', body: { name } }),
  mergeCategory: (id, intoId) => post(`/v1/admin/users/categories/${enc(id)}/merge/`, { intoId, targetId: intoId }),
  orderFeatured: creatorIds => request('/v1/admin/users/featured-creators/order/', { method: 'PUT', body: { creatorIds } }),

  campaign: (id, verb, body) => post(`/v1/admin/campaigns/${enc(id)}/${verb}/`, body),          // approve | reject | hide | remove | restore
  report: (id, verb, reason) => post(`/v1/admin/moderation/abuse-reports/${enc(id)}/${verb}/`, { reason }),   // remove | warn | suspend-account | dismiss
  bidAlert: (id, verb, reason) => post(`/v1/admin/moderation/bid-alerts/${enc(id)}/${verb}/`, { reason }),    // freeze-bids | suspend-accounts | warn | dismiss
  review: (id, verb, reason) => post(`/v1/admin/moderation/reviews/${enc(id)}/${verb}/`, { reason }),          // delete | keep

  forceRelease: (id, reason, disputeId) => post(`/v1/admin/finance/orders/${enc(id)}/force-release/`, { reason, ...(disputeId ? { disputeId } : {}) }, { 'Idempotency-Key': uuid() }),
  refund: (id, reason, disputeId) => post(`/v1/admin/finance/orders/${enc(id)}/refund/`, { reason, ...(disputeId ? { disputeId } : {}) }, { 'Idempotency-Key': uuid() }),
  resolveDispute: (id, reason) => post(`/v1/admin/finance/disputes/${enc(id)}/resolve/`, { reason }),

  readNotification: id => post(`/v1/admin/system/notifications/${enc(id)}/read/`),
  readAllNotifications: () => post('/v1/admin/system/notifications/read-all/')
};
/* CSV exports come from the server, so they carry the server's own audit entry */
export async function downloadCsv(path, name, query) {
  const a = auth(), base = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '');
  const url = new URL(base + path, location.href); if (query) Object.entries(query).forEach(([k, v]) => v != null && v !== '' && url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { Accept: 'text/csv', ...(a && a.access ? { Authorization: `Bearer ${a.access}` } : {}) } });
  if (!r.ok) { let m = 'The export did not go through.'; try { const j = await r.json(); m = (j.error && j.error.message) || m; } catch (e) {} throw new ApiError(r.status, m); }
  const blob = await r.blob(), href = URL.createObjectURL(blob), el = document.createElement('a');
  el.href = href; el.download = name; document.body.append(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(href), 4000);
}
/* a plain sentence for an action that failed */
export function why(e) {
  const c = e && e.code, s = e && e.status;
  if (c === 'VERIFICATION_BLOCKED') return (e.message || 'An automated check blocks approval.') + ' Reject it or ask for more information instead.';
  if (c === 'ALREADY_DECIDED' || c === 'CONFLICT' || s === 409) return (e && e.message) || 'Someone already acted on this. Reload to see the latest.';
  if (s === 403) return 'Your admin role cannot do this.';
  if (c === 'NETWORK' || !s) return 'Could not reach Linkloom. Check your connection, then try again.';
  if (s === 400 && e.details) { const d = Object.values(e.details).flat().filter(x => typeof x === 'string'); if (d.length) return d.join(' '); }
  return (e && e.message) || 'That didn’t go through. Try again.';
}

/* the admin's role, as the console shows it */
const ROLE = { super_admin: 'Super admin', trust_safety: 'Trust & safety', finance: 'Finance' };
export const roleName = u => ROLE[(u && u.adminRole) || ''] || 'Admin';
/* what an admin sees right after signing in: the side menu numbers */
export const ensureChrome = () => ensure(['counts', 'dashboard']);
