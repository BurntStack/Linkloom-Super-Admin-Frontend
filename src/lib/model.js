/* The record shapes the console's design is built on (the Linkloom Super Admin artifact), filled from the admin API.
   Each adapter reads the design's own field name first, then the names the live API is known or likely to use, so a
   backend that returns the field names in docs/BACKEND-REQUIREMENTS.md connects with no change here.
   Money is integer paise ({ amount, currency } objects are unwrapped). Dates are ISO strings. */
import { str, pick, num, arr, nameOf, idOf, userIdOf } from './admin.js';
import { paise } from './api.js';

const lc = v => str(v).toLowerCase();
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const money = v => { const p = paise(v); return p == null ? null : p; };
const bool = (...v) => { const x = v.find(y => y === true || y === false); return x == null ? null : x; };
/* a person or company a record points at: id + name, whether the API sent an object or a bare id */
const ref = (v, ...nameAlts) => {
  const o = obj(v);
  return { id: o ? str(pick(o.id, o.uuid)) : str(v), name: o ? nameOf(o) : str(pick(...nameAlts)), userId: o ? userIdOf(o) : '', handle: o ? str(pick(o.handle, o.username)) : '' };
};

/* ---------- accounts ---------- */
const KYC = { verified: 'verified', approved: 'verified', under_review: 'under_review', pending: 'under_review', submitted: 'under_review', in_review: 'under_review',
  action_needed: 'action_needed', info_requested: 'action_needed', needs_info: 'action_needed', rejected: 'rejected', not_started: 'not_started', none: 'not_started', '': 'not_started' };
const ACC = s => (/suspend|banned|blocked|disabled/.test(s) ? 'suspended' : s || 'active');

export function toCreator(r) {
  if (!r) return null;
  const u = obj(r.user) || {}, k = obj(r.kyc);
  const st = lc(pick(r.accountStatus, u.status, r.status, r.isSuspended === true || r.suspended === true ? 'suspended' : '', r.isActive === false ? 'suspended' : ''));
  const sus = obj(r.suspended) || obj(r.suspension);
  return {
    id: str(r.id), userId: userIdOf(r), name: str(pick(r.name, r.displayName, r.fullName, u.fullName, u.displayName, u.email, 'Creator')),
    handle: str(pick(r.handle, r.username, r.instagramHandle)), email: str(pick(r.email, u.email)), city: str(pick(r.city, r.location)),
    status: ACC(st), kyc: KYC[lc(pick(r.kyc && !k ? r.kyc : null, k && k.status, r.kycStatus, r.verificationStatus))] || 'not_started',
    joined: str(pick(r.joined, r.joinedAt, r.createdAt, u.dateJoined, u.createdAt)), lastActive: str(pick(r.lastActive, r.lastActiveAt, r.lastSeenAt, u.lastLogin, u.lastLoginAt)),
    followers: num(pick(r.followers, r.followerCount, r.totalFollowers)), er: num(pick(r.er, r.engagementRate)), rating: num(pick(r.rating, r.avgRating, r.averageRating)),
    jobs: num(pick(r.jobs, r.completedJobs, r.ordersCompleted, r.jobsCompleted)) || 0, earned: money(pick(r.earned, r.totalEarned, r.earnings, r.lifetimeEarnings)) || 0,
    badges: arr(r.badges).map(b => (obj(b) ? nameOf(b) : str(b))), tags: arr(pick(r.tags, r.categories, r.niches)).map(t => (obj(t) ? nameOf(t) : str(t))),
    featured: !!pick(r.featured, r.isFeatured), reports: num(pick(r.reports, r.reportCount, r.openReports, r.abuseReportCount)) || 0,
    suspended: sus ? { at: str(pick(sus.at, sus.since, sus.createdAt)), reason: str(pick(sus.reason, sus.note)) } : st === 'suspended' && (r.suspendedAt || r.suspensionReason) ? { at: str(r.suspendedAt), reason: str(r.suspensionReason) } : null,
    orders: arr(r.orders), reportList: arr(pick(r.abuseReports, r.reportList)), history: arr(pick(r.adminHistory, r.auditTrail, r.history)), raw: r
  };
}
const BVER = s => (/verified|approved/.test(s) ? 'verified' : /review|pending|submitted/.test(s) ? 'under_review' : /reject/.test(s) ? 'rejected' : /action|info/.test(s) ? 'action_needed' : 'not_started');
export function toBrand(r) {
  if (!r) return null;
  const u = obj(r.user) || {}, c = obj(r.company) || obj(r.business) || {};
  const st = lc(pick(r.accountStatus, u.status, r.status, r.isSuspended === true ? 'suspended' : '', r.isActive === false ? 'suspended' : ''));
  return {
    id: str(r.id), userId: userIdOf(r), name: str(pick(r.name, r.brandName, r.companyName, c.name, u.fullName, 'Brand')),
    contact: str(pick(r.contact, r.contactName, r.contactPerson, u.fullName)), email: str(pick(r.email, r.businessEmail, u.email)),
    mailVerified: bool(r.mailVerified, r.emailVerified, r.isEmailVerified, u.emailVerified, u.isEmailVerified),
    legal: str(pick(r.legal, r.legalName, c.legalName)), gstin: str(pick(r.gstin, c.gstin)), pan: str(pick(r.pan, r.panMasked, c.pan)), cin: str(pick(r.cin, c.cin)),
    regVerified: bool(r.regVerified, r.registrationVerified, r.gstinVerified, c.verified), city: str(pick(r.city, c.city, r.location)),
    status: ACC(st), verify: BVER(lc(pick(r.verify, r.verificationStatus, r.kycStatus, r.verified === true ? 'verified' : ''))),
    joined: str(pick(r.joined, r.joinedAt, r.createdAt, u.dateJoined)), postsLast30: num(pick(r.postsLast30, r.campaignsLast30Days, r.postingLast30, r.campaignStats && r.campaignStats.last30Days)),
    postsAvg: num(pick(r.postsAvg, r.campaignsMonthlyAvg, r.postingAvg, r.campaignStats && r.campaignStats.monthlyAverage)),
    spent: money(pick(r.spent, r.totalSpent, r.spend, r.campaignStats && r.campaignStats.totalSpent)) || 0,
    open: num(pick(r.open, r.openCampaigns, r.liveCampaigns, r.campaignStats && r.campaignStats.open)) || 0,
    reports: num(pick(r.reports, r.reportCount, r.openReports)) || 0, campaigns: arr(r.campaigns), reportList: arr(pick(r.abuseReports, r.reportList)),
    history: arr(pick(r.adminHistory, r.auditTrail, r.history)), raw: r
  };
}

/* ---------- verification desk ---------- */
const VST = { pending: 'pending', under_review: 'pending', submitted: 'pending', in_review: 'pending', approved: 'approved', verified: 'approved',
  rejected: 'rejected', info_requested: 'info', action_needed: 'info', needs_info: 'info' };
const MATCH = s => { const v = lc(s); return !v ? '' : /under.?18|minor/.test(v) ? 'under18' : /mismatch|fail|no.?match|differ/.test(v) ? 'mismatch' : /ok|match|pass|valid|true/.test(v) ? 'ok' : v; };
export function toVerification(v) {
  if (!v) return null;
  const u = obj(v.user) || obj(v.creator) || obj(v.brand) || obj(v.profile) || {};
  const k = obj(v.kyc) || v, steps = obj(k.steps) || {};
  const idd = obj(v.id_doc) || obj(v.idDocument) || obj(steps.id) || {}, pan = obj(v.pan) || obj(steps.pan) || {}, bank = obj(v.bank) || obj(v.payout) || obj(steps.bank) || {};
  const sf = obj(v.selfie) || obj(steps.selfie), biz = obj(v.business) || obj(v.company), per = obj(v.person) || obj(v.signatory) || obj(v.authorisedPerson), bill = obj(v.billing);
  const kind = /brand/.test(lc(pick(v.kind, v.accountType, v.role, u.role, v.brand ? 'brand' : ''))) ? 'brand' : 'creator';
  const raw = lc(pick(v.status, k.status, v.kycStatus));
  return {
    id: str(v.id), kind, status: VST[raw] || (raw ? raw : 'pending'), rawStatus: raw,
    account: str(pick(v.account, v.profileId, v.creatorId, v.brandId, u.id)), userId: str(pick(v.userId, u.userId, userIdOf(v))),
    name: str(pick(v.name, v.fullName, v.displayName, v.brandName, u.brandName, u.displayName, u.fullName, u.name, u.email, v.email, 'Unnamed account')),
    email: str(pick(v.email, u.email)), submitted: str(pick(v.submitted, v.submittedAt, k.submittedAt, v.createdAt)), slaDueAt: str(pick(v.slaDueAt, v.dueAt)),
    note: str(pick(v.note, v.adminNote)), reason: str(pick(v.rejectionReason, k.rejectionReason, v.reason)),
    decidedAt: str(pick(v.decidedAt, v.reviewedAt, v.verifiedAt)), decidedBy: nameOf(pick(v.decidedBy, v.reviewedBy)),
    id_doc: (idd.type || idd.idType || idd.masked || idd.done) ? { type: str(pick(idd.type, idd.idType)).replace(/_/g, ' '), masked: str(pick(idd.masked, idd.numberMasked, idd.last4 && '•••• ' + idd.last4)),
      name: str(pick(idd.name, idd.nameOnId)), dob: str(pick(idd.dob, idd.dateOfBirth)), match: MATCH(pick(idd.match, idd.nameMatch, idd.ageCheck)), uploadId: str(idd.uploadId), done: !!idd.done } : null,
    pan: (pan.masked || pan.panLast4 || pan.done || pan.name) ? { masked: str(pick(pan.masked, pan.panMasked, pan.panLast4 && '••••••' + pan.panLast4)), name: str(pick(pan.name, pan.nameOnPan)), match: MATCH(pick(pan.match, pan.nameMatch)), done: !!pan.done } : null,
    bank: (bank.masked || bank.accountLast4 || bank.upi || bank.done) ? { kind: str(pick(bank.kind, bank.method, bank.upi ? 'UPI' : 'Bank')), masked: str(pick(bank.masked, bank.accountMasked, bank.upiMasked, bank.accountLast4 && '••••' + bank.accountLast4)),
      holder: str(pick(bank.holder, bank.accountHolderName, bank.nameAtBank)), ifsc: str(bank.ifsc), match: MATCH(pick(bank.match, bank.nameMatch)), done: !!bank.done } : null,
    selfie: sf ? { liveness: lc(pick(sf.liveness, sf.livenessStatus)), faceMatch: num(pick(sf.faceMatch, sf.faceMatchScore, sf.score)) } : null,
    socials: arr(pick(v.socials, v.socialAccounts, steps.socials)).map(s => ({ p: lc(pick(s.p, s.platform)), handle: str(pick(s.handle, s.username)), followers: num(pick(s.followers, s.followerCount)), linked: !!pick(s.linked, s.verified, s.isLinked), age: str(pick(s.age, s.accountAge)) })),
    business: biz ? { legal: str(pick(biz.legal, biz.legalName)), gstin: str(biz.gstin), gstinStatus: str(pick(biz.gstinStatus, biz.gstStatus)), pan: str(pick(biz.pan, biz.panMasked)), panFromGstin: !!pick(biz.panFromGstin, biz.panMatchesGstin), cin: str(biz.cin) } : null,
    person: per ? { name: str(pick(per.name, per.fullName)), designation: str(pick(per.designation, per.title, per.role)), mail: str(pick(per.mail, per.email)), mailVerified: bool(per.mailVerified, per.emailVerified) } : null,
    billing: bill ? { address: str(pick(bill.address, bill.line1)), email: str(pick(bill.email, bill.billingEmail)) } : null,
    checks: arr(v.checks), docs: arr(pick(v.documents, v.docs, v.files)).map((d, i) => ({ key: str(pick(d.id, d.key, i)), name: str(pick(d.label, d.name, d.type, d.kind, 'Document')), url: str(pick(d.url, d.downloadUrl, d.signedUrl)), expiresAt: str(d.expiresAt) })),
    raw: v
  };
}
/* problems an admin must look at, read straight from the submission (design: vFlags) */
export function vFlags(v, ageFrom) {
  const f = [];
  if (v.id_doc && v.id_doc.match === 'under18') f.push(`Under 18${v.id_doc.dob && ageFrom ? ` (${ageFrom(v.id_doc.dob)})` : ''}`);
  if (v.bank && v.bank.match === 'mismatch') f.push('Bank name mismatch');
  if (v.pan && v.pan.match === 'mismatch') f.push('PAN name mismatch');
  if (v.kind === 'brand' && (!v.business || !v.business.gstin)) f.push('No business details');
  if (v.person && v.person.mailVerified === false) f.push('Unverified email');
  arr(v.checks).forEach(c => { const s = lc(pick(c.status, c.result)); if (c.blocking && !/pass|ok|match/.test(s)) f.push(str(pick(c.label, c.name, 'Blocking check'))); });
  return f;
}

/* ---------- moderation ---------- */
export function toReport(r) {
  const t = r.target, tgt = obj(t);
  return {
    id: str(r.id), type: lc(pick(r.type, r.targetType, r.contentType, r.kind, 'content')).replace(/^user$/, 'profile'),
    target: str(pick(typeof t === 'string' ? t : '', r.targetLabel, r.targetName, tgt && nameOf(tgt), nameOf(r.reportedUser), nameOf(r.subject))),
    targetId: str(pick(r.targetId, tgt && tgt.id, idOf(r.reportedUser))), targetUserId: str(pick(r.targetUserId, tgt && userIdOf(tgt), userIdOf(obj(r.reportedUser)))),
    excerpt: str(pick(r.excerpt, r.contentExcerpt, r.snippet)), by: str(pick(nameOf(r.by), nameOf(r.reporter), nameOf(r.reportedBy), 'System')),
    reason: str(pick(r.reason, r.category, r.reasonCode, 'Reported')), text: str(pick(r.description, r.details, r.message)),
    at: str(pick(r.at, r.createdAt, r.reportedAt)), status: lc(pick(r.status, 'open')).replace(/^(resolved|removed|warned|closed)$/, 'actioned'),
    severity: lc(pick(r.severity, r.priority, 'medium')), count: num(pick(r.count, r.reportCount, r.reports)) || 1, action: str(pick(r.action, r.outcome, r.resolution)),
    link: str(pick(r.link, r.campaignId, r.reviewId)), context: arr(pick(r.context, r.thread, r.surrounding)), raw: r
  };
}
export function toBidAlert(a) {
  return {
    id: str(a.id), pattern: str(pick(a.pattern, a.title, a.type, a.kind, 'Bid pattern')).replace(/_/g, ' '), detail: str(pick(a.detail, a.description, a.message, a.summary)),
    accounts: arr(pick(a.accounts, a.accountIds, a.users)).map(x => (obj(x) ? nameOf(x) : str(x))), at: str(pick(a.at, a.createdAt, a.detectedAt)),
    status: lc(pick(a.status, 'open')), risk: num(pick(a.risk, a.riskScore, a.score)), campaignId: str(pick(a.campaignId, idOf(a.campaign))), raw: a
  };
}
export function toReview(r) {
  return {
    id: str(r.id), from: str(pick(nameOf(r.from), nameOf(r.brand), nameOf(r.reviewer), nameOf(r.author))), to: str(pick(nameOf(r.to), nameOf(r.creator), nameOf(r.reviewee))),
    toId: str(pick(r.creatorId, idOf(r.creator), idOf(r.to))), stars: num(pick(r.stars, r.rating)) || 0, text: str(pick(r.text, r.comment, r.body)),
    at: str(pick(r.at, r.createdAt)), order: str(pick(r.order && !obj(r.order) ? r.order : '', r.orderId, idOf(r.order))), status: lc(pick(r.status, 'visible')),
    flagReason: str(pick(r.flagReason, r.reason)), raw: r
  };
}

/* ---------- marketplace ---------- */
export function reviewStateOf(k) {
  if (!k || typeof k !== 'object') return '';
  const m = obj(k.moderation);
  const d = pick(k.moderationStatus, m && pick(m.status, m.state), typeof k.moderation === 'string' ? k.moderation : null, k.reviewStatus, k.reviewState, k.moderationState, k.approvalStatus, k.adminStatus, k.listingStatus);
  if (str(d)) return lc(d);
  for (const [key, v] of Object.entries(k)) if (/moderat|review|approv/i.test(key) && typeof v === 'string' && v) return lc(v);
  if (k.isApproved === false || k.approved === false) return 'pending';
  if (k.isApproved === true || k.approved === true) return 'live';
  if (k.isHidden === true || k.hidden === true) return 'hidden';
  return '';
}
export function toCampaign(k) {
  const b = ref(k.brand, k.brandName);
  const bmin = money(pick(k.budgetMin, obj(k.budget) && !('amount' in k.budget) ? k.budget.min : null)), bmax = money(pick(k.budgetMax, obj(k.budget) && !('amount' in k.budget) ? k.budget.max : k.budget));
  const m = obj(k.moderation);
  return {
    id: str(k.id), title: str(pick(k.title, k.name, 'Untitled campaign')), brandId: str(pick(k.brandId, b.id)), brandName: b.name, brandUserId: b.userId,
    platform: lc(k.platform), budget: bmax != null ? bmax : bmin, budgetMin: bmin, budgetMax: bmax, bids: num(pick(k.bids, k.bidCount, obj(k.bidsSummary) && k.bidsSummary.count)) || 0,
    posted: str(pick(k.posted, k.submittedAt, k.createdAt)), closesAt: str(k.closesAt), review: reviewStateOf(k), lifecycle: lc(k.status),
    status: reviewStateOf(k) || lc(k.status), flags: num(pick(k.flags, k.flagCount, k.reportCount)) || 0, rule: str(pick(k.rule, k.ruleBroken, m && m.reason)),
    brief: str(pick(k.brief, k.description)), deliverables: str(k.deliverables), signals: arr(pick(k.signals, k.briefSignals)),
    changed: pick(k.changedFields, m && m.changedFields), bidsSummary: obj(k.bidsSummary), raw: k
  };
}
export function toCategory(c) { return obj(c) ? { id: str(pick(c.id, c.slug, c.name)), name: str(pick(c.name, c.label, c.title)), count: num(pick(c.count, c.creatorCount, c.creators, c.usage)) } : { id: str(c), name: str(c), count: null }; }

/* ---------- orders, disputes, payouts ---------- */
const PHASE = { pending: 'invited', invited: 'invited', accepted: 'accepted', awaiting_payment: 'accepted', funded: 'funded', paid: 'funded', in_escrow: 'funded', escrow: 'funded',
  in_progress: 'in_progress', active: 'in_progress', submitted: 'submitted', delivered: 'submitted', revision: 'revision', revision_requested: 'revision', changes_requested: 'revision',
  approved: 'approved', released: 'released', completed: 'released', complete: 'released', refunded: 'refunded', cancelled: 'refunded', canceled: 'refunded', disputed: 'disputed', in_dispute: 'disputed' };
export const phaseOf = s => PHASE[lc(s)] || lc(s);
export const LIVE_PHASES = ['funded', 'in_progress', 'submitted', 'revision', 'approved', 'disputed'];
export function toOrder(o) {
  const b = ref(o.brand, o.brandName), c = ref(o.creator, o.creatorName), bd = obj(o.breakdown) || {};
  return {
    id: str(o.id), ref: str(pick(o.reference, o.ref, o.code, o.number)), title: str(pick(o.title, o.campaignTitle, nameOf(o.campaign), 'Order')),
    brandId: str(pick(o.brandId, b.id)), brandName: b.name, creatorId: str(pick(o.creatorId, c.id)), creatorName: c.name,
    amount: money(pick(o.amount, o.price, o.total, bd.price)) || 0, phase: phaseOf(pick(o.phase, o.status, o.state)),
    funded: str(pick(o.funded, o.fundedAt, o.paidAt)), due: str(pick(o.due, o.dueAt, o.deadline, o.dueDate)), released: str(pick(o.released, o.releasedAt)), refunded: str(pick(o.refunded, o.refundedAt)),
    dispute: str(pick(o.dispute && !obj(o.dispute) ? o.dispute : '', o.disputeId, idOf(obj(o.dispute)))),
    breakdown: { price: money(pick(bd.price, o.amount, o.price)), commission: money(pick(bd.commission, o.commission)) || 0, gateway: money(pick(bd.gateway, bd.gatewayFee, o.gatewayFee)),
      creatorGets: money(pick(bd.creatorGets, bd.net, o.creatorGets)), linkloomNet: money(pick(bd.linkloomNet, o.linkloomNet)) },
    timeline: arr(pick(o.timeline, o.events, o.history)).map(e => ({ at: str(pick(e.at, e.createdAt, e.timestamp)), phase: phaseOf(pick(e.phase, e.status, e.to)), text: str(pick(e.text, e.label, e.note, e.event, e.type)), by: nameOf(pick(e.by, e.actor)) })),
    raw: o
  };
}
export function toDispute(d) {
  const o = obj(d.order);
  return {
    id: str(d.id), ref: str(pick(d.reference, d.code)), order: str(pick(d.orderId, o && o.id, !o ? d.order : '')), orderRec: o ? toOrder(o) : null,
    opened: str(pick(d.opened, d.openedAt, d.createdAt)), by: lc(pick(d.by, d.openedBy && typeof d.openedBy === 'string' ? d.openedBy : '', obj(d.openedBy) && pick(d.openedBy.role, d.openedBy.kind), d.raisedBy, 'creator')),
    claim: str(pick(d.claim, d.reason, d.description)), evidence: arr(pick(d.evidence, d.attachments)).map(e => (obj(e) ? str(pick(e.label, e.name, e.title, e.url)) : str(e))),
    other: str(pick(d.other, d.response, d.counterResponse, d.otherSide)), status: lc(pick(d.status, 'open')).replace(/^(closed|settled)$/, 'resolved'),
    outcome: str(pick(d.outcome, d.resolution)), sla: str(pick(d.sla, d.slaDueAt, d.dueAt)), kind: lc(pick(d.kind, d.type, d.category)), raw: d
  };
}
export function toPayout(p) {
  const c = ref(p.creator, p.creatorName, nameOf(p.payee));
  return {
    id: str(p.id), creatorId: str(pick(p.creatorId, c.id)), creatorName: c.name || nameOf(p.payee) || 'Creator', amount: money(pick(p.amount, p.net, p.total)) || 0,
    order: str(pick(p.orderId, idOf(p.order), !obj(p.order) ? p.order : '')), at: str(pick(p.at, p.paidAt, p.scheduledFor, p.createdAt)),
    method: str(pick(p.method, p.destination, p.payoutMethod)), utr: str(pick(p.utr, p.reference)), status: lc(pick(p.status, p.state)), raw: p
  };
}

/* ---------- audit, admins, sessions ---------- */
export function toAudit(e) {
  const tt = str(pick(e.targetType, e.entityType, e.resourceType)), ti = str(pick(e.targetId, e.entityId, e.resourceId));
  return {
    id: str(pick(e.id, e.seq, e.sequence)), seq: num(pick(e.seq, e.sequence, e.index)), at: str(pick(e.at, e.createdAt, e.timestamp)),
    who: str(pick(nameOf(e.who), nameOf(e.actor), nameOf(e.admin), nameOf(e.performedBy), 'System')), whoId: str(pick(e.actorId, idOf(e.actor))),
    action: str(pick(e.action, e.event, e.verb, e.type)), target: str(pick(typeof e.target === 'string' ? e.target : '', e.targetLabel, nameOf(obj(e.target)), [tt, ti].filter(Boolean).join(' '))),
    detail: str(pick(e.detail, e.reason, e.note, e.details && typeof e.details === 'string' ? e.details : '')),
    prev: str(pick(e.prev, e.prevHash, e.previousHash)), hash: str(pick(e.hash, e.entryHash)), ip: str(e.ip), raw: e
  };
}
const ROLE = { super_admin: 'Super admin', trust_safety: 'Trust & safety', finance: 'Finance' };
export function toAdmin(a) {
  return { id: str(a.id), name: str(pick(a.name, a.fullName, a.displayName, a.email)), email: str(a.email), role: ROLE[lc(pick(a.adminRole, a.role))] || str(pick(a.adminRole, a.role)),
    mfa: !!pick(a.mfa, a.mfaEnabled, a.totpEnabled), lastSeen: str(pick(a.lastSeen, a.lastSeenAt, a.lastLogin, a.lastLoginAt)), raw: a };
}
export function toSession(s) {
  const ua = str(pick(s.device, s.userAgent));
  return { id: str(pick(s.id, s.jti, s.sessionId)), who: nameOf(pick(s.who, s.user, s.admin)), device: ua.length > 60 ? ua.slice(0, 57) + '…' : ua || 'Unknown device',
    ip: [str(pick(s.ip, s.ipAddress)), str(pick(s.location, s.city))].filter(Boolean).join(' · '), since: str(pick(s.since, s.createdAt, s.issuedAt, s.lastSeenAt, s.lastUsedAt)),
    current: !!pick(s.current, s.isCurrent), raw: s };
}

/* ---------- dashboard ----------
   The design's ink band: active creators / brands (and suspended, unverified), live orders by phase, escrow held. */
const flat = (o, pre = '', out = {}) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const key = pre ? pre + '.' + k : k; if (typeof v === 'number' || (obj(v) && 'amount' in v)) out[key] = v; else if (obj(v)) flat(v, key, out); } return out; };
const find = (f, ...res) => { for (const re of res) { const k = Object.keys(f).find(x => re.test(x)); if (k != null) return f[k]; } return null; };
export function toDashboard(d) {
  const f = flat(d || {});
  const phases = {};
  const ph = obj(d && pick(d.ordersByPhase, d.liveOrdersByPhase, d.pipeline, obj(d.orders) && d.orders.byPhase));
  if (ph) Object.entries(ph).forEach(([k, v]) => { const n = num(obj(v) ? pick(v.count, v.n) : v); if (n != null) phases[phaseOf(k)] = (phases[phaseOf(k)] || 0) + n; });
  return {
    creatorsActive: num(find(f, /^creators?\.active$/i, /activeCreators/i, /creators?.*active/i)), creatorsSuspended: num(find(f, /^creators?\.suspended$/i, /suspendedCreators/i, /creators?.*suspend/i)),
    brandsActive: num(find(f, /^brands?\.active$/i, /activeBrands/i, /brands?.*active/i)), brandsSuspended: num(find(f, /^brands?\.suspended$/i, /suspendedBrands/i, /brands?.*suspend/i)),
    brandsUnverified: num(find(f, /brands?.*(unverified|notVerified|not_verified)/i)),
    liveOrders: num(find(f, /liveOrders$/i, /orders?\.(live|inProgress|active)$/i, /liveOrders/i)), phases,
    escrowHeld: money(find(f, /escrow.*(held|balance|total)/i, /^escrow$/i, /escrow/i)), gatewayPct: num(find(f, /gateway.*(pct|percent|rate)/i)),
    commissionPct: num(find(f, /commission.*(pct|percent|rate)/i)), raw: d
  };
}

/* ---------- audit action names, in words (design: LLD.auditLabel) ---------- */
const ALABEL = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.password_change': 'Changed password',
  'session.invalidate': 'Ended a session', 'session.invalidate_all': 'Ended all other sessions', 'mfa.reset': 'Reset MFA', 'mfa.untrust': 'Removed a trusted device',
  'account.suspend': 'Suspended an account', 'account.reactivate': 'Reactivated an account', 'account.password_reset': 'Sent a password reset', 'account.sessions_invalidate': 'Signed an account out of its devices', 'account.warn': 'Warned an account',
  'creator.tags_edit': 'Edited creator tags', 'creator.badges_edit': 'Edited badges', 'creator.feature': 'Featured a creator', 'creator.unfeature': 'Unfeatured a creator',
  'verification.approve': 'Approved verification', 'verification.reject': 'Rejected verification', 'verification.request_info': 'Asked for more info',
  'report.dismiss': 'Dismissed a report', 'report.remove': 'Removed content', 'report.warn': 'Warned an account',
  'campaign.approve': 'Approved a campaign', 'campaign.reject': 'Rejected a campaign', 'campaign.hide': 'Hid a campaign', 'campaign.remove': 'Removed a campaign', 'campaign.restore': 'Restored a campaign',
  'bids.freeze': 'Froze bids', 'bids.dismiss': 'Dismissed a bid alert', 'review.delete': 'Deleted a review', 'review.keep': 'Kept a review',
  'featured.reorder': 'Reordered featured creators', 'category.add': 'Added a category', 'category.rename': 'Renamed a category', 'category.merge': 'Merged categories',
  'escrow.force_release': 'Force-released escrow', 'escrow.refund': 'Refunded escrow', 'dispute.resolve': 'Resolved a dispute',
  'support.reply': 'Replied to a support ticket', 'support.note': 'Added a support note', 'support.assign': 'Assigned a support ticket', 'support.resolve': 'Resolved a support ticket', 'support.close': 'Closed a support ticket', 'support.reopen': 'Reopened a support ticket', 'support.priority': 'Changed ticket priority',
  'payouts.export': 'Exported payouts', 'audit.export': 'Exported the audit log', 'audit.verify': 'Verified the chain'
};
const AGROUP = { auth: 'Sign-in', session: 'Sessions', mfa: 'Sessions', account: 'Accounts', creator: 'Accounts', brand: 'Accounts', verification: 'Verification', report: 'Moderation',
  review: 'Marketplace', campaign: 'Marketplace', marketplace: 'Marketplace', bids: 'Marketplace', featured: 'Marketplace', category: 'Marketplace',
  order: 'Orders and escrow', dispute: 'Orders and escrow', escrow: 'Orders and escrow', support: 'Support', ticket: 'Support', payouts: 'Financials', finance: 'Financials', audit: 'Audit log' };
const human = a => { const t = String(a || '').split('.').pop().replace(/[_-]/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
export const auditLabel = a => ALABEL[a] || human(a);
export const auditGroup = a => AGROUP[String(a).split('.')[0]] || 'Other';
