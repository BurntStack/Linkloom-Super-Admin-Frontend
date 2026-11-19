/* Accounts (#accounts, #creator-<id>, #brand-<id>), as designed (artifact screens/accounts.js).
   List: search, Creators / Brands, status and quick filters. Creator detail: badges, category tags, featured, reports, orders,
   suspend or reactivate, password-reset help, signed-in devices, admin history. Brand detail: campaign posting over 30 days
   against their usual pace, company registration, business mail, campaigns.
   - GET   /v1/admin/users/creators/?q=&status=&kyc=&badge=&featured=&hasReports=      GET /v1/admin/users/creators/<id>/
   - PATCH /v1/admin/users/creators/<id>/   { badges } | { tags } | { featured }   (with { reason })
   - GET   /v1/admin/users/brands/?q=&status=&verified=&postingSpike=&hasReports=      GET /v1/admin/users/brands/<id>/
   - POST  /v1/admin/users/<user_id>/suspend/ { reason, note } · reactivate/ { reason } · password-reset/ { reason, note }
   - GET   /v1/admin/users/<user_id>/sessions/ · POST .../sessions/revoke/ { reason, sessionId? }
   - GET   /v1/admin/system/audit-log/?targetId=<id>     admin history for this account
   Classes are .acc-*. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import L, { data } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import { api, can, whoCan, str, pick, num, arr } from '../lib/admin.js';
import { toCreator, toBrand, toReport, toOrder, toCampaign, toAudit, toSession, toCategory, toVerification, auditLabel } from '../lib/model.js';
import { mailMask, mask, freeMail, gstState } from './Verify.jsx';
import Av from '../components/Av.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { confirm, LogLine } from '../components/Confirm.jsx';
import { useLoad, usePaged, More, Failed, Loading, errText } from '../components/Admin.jsx';

const ui = () => (data.ui.accounts = data.ui.accounts || { tab: 'creator', q: '', status: 'all', f: [] });
const BADGES = [['Verified Pro', 'Verified KYC and 5+ approved jobs'], ['Top rated', 'Rated 4.7 or more by brands'], ['Rising', 'Fast-growing new creator']];
const KYC = { verified: ['pill-ok', 'check', 'Verified'], under_review: ['pill-info', 'clock', 'In review'], action_needed: ['pill-warn', 'info', 'Action needed'], rejected: ['pill-err', 'alert', 'Rejected'], not_started: ['pill-paper', 'minus', 'Not verified'] };
const KycPill = ({ k }) => { const m = KYC[k] || KYC.not_started; return <span className={`pill ${m[0]}`}><Icon n={m[1]} />{m[2]}</span>; };
const spike = b => b.postsLast30 != null && b.postsLast30 >= 5 && b.postsLast30 > 2 * (b.postsAvg || 0);
const hasBadge = (c, b) => c.badges.some(x => x.toLowerCase().replace(/[_-]/g, ' ') === b.toLowerCase());

/* suspension can show up in many places: a status word, a flag, a timestamp, or an inactive user account */
const SUSP = /suspend|banned|disabled|blocked|deactivated/;
function isSuspended(r) {
  if (!r || typeof r !== 'object') return false;
  return [r, r.user, r.account, r.profile].filter(o => o && typeof o === 'object').some(o => SUSP.test(String(o.status || '').toLowerCase()) || SUSP.test(String(o.accountStatus || '').toLowerCase())
    || o.isSuspended === true || o.suspended === true || !!o.suspendedAt || o.isActive === false || o.is_active === false);
}
/* what this tab just did wins over a record that does not say (user id -> true / false) */
const justSet = {};
const susp = a => (a.userId && a.userId in justSet ? justSet[a.userId] : a.status === 'suspended' || isSuspended(a.raw));
const StPill = ({ a }) => (susp(a) ? <span className="pill pill-err"><Icon n="alert" />Suspended</span> : <span className="pill pill-ok"><Icon n="check" />Active</span>);
/* a 404 on an account action means the backend has no user with that id: say which id */
const onUser = (a, p) => p.catch(e => { if (e && e.status === 404) { e.status = 0; e.code = 'USER_NOT_FOUND'; e.message = `The backend has no user account with id ${a.userId}.`; } throw e; });

/* ---------- list ---------- */
const QF = {
  creator: [['pro', 'Verified Pro', c => hasBadge(c, 'Verified Pro'), { badge: 'Verified Pro' }], ['feat', 'Featured', c => c.featured, { featured: 'true' }], ['kyc', 'KYC not done', c => c.kyc !== 'verified', { kyc: 'not_verified' }], ['rep', 'Has reports', c => c.reports > 0, { hasReports: 'true' }]],
  brand: [['ver', 'Verified', b => b.verify === 'verified', { verified: 'true' }], ['unv', 'Not verified', b => b.verify !== 'verified', { verified: 'false' }], ['spike', 'Posting spike', spike, { postingSpike: 'true' }], ['rep', 'Has reports', b => b.reports > 0, { hasReports: 'true' }]]
};
function List() {
  const root = useRef(null);
  const rerender = useRerender();
  const u = ui(), isC = u.tab === 'creator';
  const [q, setQ] = useState(u.q);
  useEffect(() => { const t = setTimeout(() => { if (u.q !== q) { u.q = q; rerender(); } }, 300); return () => clearTimeout(t); }, [q]);
  const fs = QF[u.tab].filter(([k]) => u.f.includes(k));
  const query = Object.assign({ q: u.q, status: u.status === 'all' ? '' : u.status }, ...fs.map(f => f[3]));
  const p = usePaged(isC ? api.creators : api.brands, { tab: u.tab, ...query });
  const all = p.rows.map(isC ? toCreator : toBrand);
  /* the same filters again here, in case the backend ignores one */
  const rows = all.filter(a => (u.status === 'all' || (u.status === 'suspended') === susp(a)) && fs.every(f => f[2](a)));
  const total = num(p.meta && pick(p.meta.total, p.meta.count));
  const nSusp = all.filter(susp).length;
  useLayoutEffect(() => { if (!p.loading && root.current) mo('stagger', [...root.current.querySelectorAll('.acc-row')]); }, [p.loading, u.tab]);
  const set = fn => { const items = root.current ? [...root.current.querySelectorAll('.acc-list>li')] : []; fn(); mo('flip', () => {}, items); rerender(); };
  const dirty = u.q || u.status !== 'all' || u.f.length;
  return (
    <div className="view-in acc" ref={root}>
      <header className="page-h acc-head">
        <div className="t"><p className="t-eyebrow">Accounts</p><h1 className="t-h1">People and brands on Linkloom</h1>
          <p className="muted">{total != null ? `${total} ${isC ? 'creators' : 'brands'}` : `${all.length}${p.next ? '+' : ''} ${isC ? 'creators' : 'brands'}`}{nSusp ? `, ${nSusp} suspended` : ''}. Changes here are logged.</p></div>
        <div className="acc-search"><Icon n="search" /><label className="sr-only" htmlFor="accQ">Search accounts</label>
          <input className="input" id="accQ" type="search" autoComplete="off" spellCheck="false" placeholder="Name, @handle, city or GSTIN" value={q} onChange={e => setQ(e.target.value)} /></div>
      </header>
      <div className="acc-bar">
        <div className="seg acc-seg" role="group" aria-label="Account type">
          <button type="button" aria-pressed={isC} onClick={() => set(() => { u.tab = 'creator'; u.f = []; })}><i className="dot acc-dot-c"></i>Creators</button>
          <button type="button" aria-pressed={!isC} onClick={() => set(() => { u.tab = 'brand'; u.f = []; })}><i className="dot acc-dot-b"></i>Brands</button>
        </div>
        <div className="chips acc-st" role="group" aria-label="Status">{[['all', 'Any status'], ['active', 'Active'], ['suspended', 'Suspended']].map(([k, t]) => <button className="chip" type="button" key={k} aria-pressed={u.status === k} onClick={() => set(() => { u.status = k; })}>{t}</button>)}</div>
        <div className="chips acc-qf" role="group" aria-label="Filters">{QF[u.tab].map(([k, t]) => <button className="chip" type="button" key={k} aria-pressed={u.f.includes(k)} onClick={() => set(() => { u.f = u.f.includes(k) ? u.f.filter(x => x !== k) : [...u.f, k]; })}>{t}</button>)}</div>
      </div>
      <div className="acc-count"><p aria-live="polite"><b>{rows.length}</b>{` of ${total != null ? total : all.length} ${isC ? 'creators' : 'brands'}`}</p>
        <button className="btn-q" type="button" hidden={!dirty} onClick={() => { setQ(''); set(() => { u.q = ''; u.status = 'all'; u.f = []; }); }}>Clear filters</button></div>
      {p.err ? <Failed err={p.err} retry={p.reload} what={isC ? 'Creators' : 'Brands'} /> : p.loading ? <Loading what={isC ? 'creators' : 'brands'} /> :
        <ul className="acc-list no-anchor">{rows.length ? rows.map(a => isC ? <CRow c={a} key={a.id} /> : <BRow b={a} key={a.id} />)
          : <li className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h3">{`No ${isC ? 'creators' : 'brands'} match`}</p><p className="muted">Try another name, or clear the filters.</p></li>}</ul>}
      <More p={p} />
    </div>
  );
}
const CRow = ({ c }) => (
  <li><a className="acc-row" href={`#creator-${c.id}`}>
    <Av kind="creator" name={c.name} />
    <span className="acc-id"><b>{c.name}</b><span>{[c.handle, c.city || c.email].filter(Boolean).join(' · ')}</span></span>
    <span className="acc-tags">{c.badges.map(b => <span className="acc-badge" key={b}><Icon n="verified" />{b}</span>)}{c.tags.slice(0, 2).map(t => <span className="pill pill-line" key={t}>{t}</span>)}{c.featured ? <span className="acc-feat"><Icon n="star" />Featured</span> : null}</span>
    <span className="acc-n"><b className="t-money">{c.followers ? L.compact(c.followers) : '—'}</b><span>followers</span></span>
    <span className="acc-k"><KycPill k={c.kyc} />{c.reports ? <span className="acc-rep"><Icon n="flag" />{c.reports} report{c.reports > 1 ? 's' : ''}</span> : null}</span>
    <span className="acc-s"><StPill a={c} /></span><span className="acc-go"><Icon n="chevron" /></span></a></li>
);
const BRow = ({ b }) => {
  const mailOk = b.mailVerified !== false && !freeMail(b.email);
  return (
    <li><a className="acc-row" href={`#brand-${b.id}`}>
      <Av kind="brand" name={b.name} />
      <span className="acc-id"><b>{b.name}</b><span>{[b.contact, b.city].filter(Boolean).join(' · ')}</span></span>
      <span className="acc-tags">{b.email ? <span className={'acc-mail' + (mailOk ? '' : ' is-bad')}><Icon n={mailOk ? 'check' : 'alert'} />{b.email}</span> : null}</span>
      <span className="acc-n"><b className="t-money">{b.postsLast30 != null ? b.postsLast30 : '—'}</b><span>posts in 30 days</span></span>
      <span className="acc-k"><KycPill k={b.verify} />{spike(b) ? <span className="acc-rep"><Icon n="chart" />Posting spike</span> : b.reports ? <span className="acc-rep"><Icon n="flag" />{b.reports} report{b.reports > 1 ? 's' : ''}</span> : null}</span>
      <span className="acc-s"><StPill a={b} /></span><span className="acc-go"><Icon n="chevron" /></span></a></li>
  );
};

/* ---------- shared detail parts ---------- */
function History({ a, bump }) {
  const allowed = can('audit');
  const h = useLoad(() => (allowed ? api.auditLog({ targetId: a.id }).then(p => p.rows.map(toAudit).filter(e => !e.raw.targetId || [a.id, a.userId].includes(str(pick(e.raw.targetId, e.raw.entityId))))) : Promise.resolve([])), [a.id, bump]);
  const r = allowed ? h : null;
  const rows = r && r.data ? r.data : [];
  return (
    <section className="acc-sec" aria-labelledby="accHist"><h2 className="t-h3" id="accHist">Admin history</h2>
      {!r ? <p className="muted">{`Reading the audit log needs the ${whoCan('audit')} role.`}</p> : r.err ? <p className="muted">{errText(r.err)}</p> : !r.data ? <p className="muted">Loading.</p>
        : rows.length ? <ol className="acc-hist">{rows.map((e, i) => <li key={e.id || i}><span className="acc-hist-a">{auditLabel(e.action)}</span><span className="acc-hist-d">{e.detail}</span><span className="acc-hist-w num">{e.who} · {e.at ? L.fmtDate(e.at) : ''}{e.hash ? <> · <code>{e.hash.slice(0, 8)}</code></> : null}</span></li>)}</ol>
        : <p className="muted">No admin actions on this account yet.</p>}
      {can('audit') ? <a className="btn-q" href="#audit"><Icon n="shield" />Full audit log</a> : null}</section>
  );
}

function Security({ kind, a, after }) {
  const sess = useLoad(() => (a.userId && can('accounts') ? api.sessions(a.userId).then(p => p.rows.map(toSession)) : Promise.resolve(null)), [a.userId]);
  const ss = sess.data || [];
  const s = susp(a), first = String(kind === 'brand' ? (a.contact || a.name) : a.name).split(' ')[0];
  const noUid = !a.userId, off = !can('accounts') || noUid;
  const why = ({ reason, note }) => (reason === 'Other' ? note : reason + (note ? ': ' + note : ''));
  const done = v => () => { if (v != null) justSet[a.userId] = v; after(); sess.reload(); };

  const suspend = () => confirm({
    title: `Suspend ${a.name}`, cta: 'Suspend account', danger: true,
    lead: <p>{kind === 'brand' ? 'Campaigns are hidden, no new hires can start, and money in escrow stays held until each order is settled.' : `${first} cannot bid or be hired. Live orders and money in escrow are not touched; settle them in Orders.`}</p>,
    reasons: kind === 'brand' ? ['Scam or pay-to-join campaigns', 'Off-platform payment requests', 'Fake business details', 'Abuse or harassment'] : ['Bid ring or linked accounts', 'Scam or off-platform payment', 'Fake reviews or followers', 'Abuse or harassment', 'Under 18'],
    init: { out: true }, extra: ({ x, set }) => <label className="check"><input type="checkbox" checked={x.out} onChange={e => set('out', e.target.checked)} /><span>Also sign out of every device</span></label>,
    run: async o => { await onUser(a, api.suspend(a.userId, { reason: why(o), note: o.note })); if (o.x.out) await api.revokeSessions(a.userId, { reason: why(o) }).catch(() => {}); },
    toast: 'Account suspended · Logged to audit', done: done(true)
  });
  const reactivate = () => confirm({
    title: `Reactivate ${a.name}`, cta: 'Reactivate',
    lead: <p>{a.suspended ? `Suspended${a.suspended.at ? ' on ' + L.fmtDate(a.suspended.at) : ''}: “${a.suspended.reason || 'no reason recorded'}”. ` : ''}Once reactivated they can sign in, bid and be hired again. Badges and featured status do not come back on their own.</p>,
    reasons: ['Appeal accepted', 'Suspended by mistake', 'Issue resolved'],
    run: o => onUser(a, api.reactivate(a.userId, { reason: why(o), note: o.note })), toast: 'Account reactivated · Logged to audit', done: done(false)
  });
  const reset = () => confirm({
    title: 'Send a reset link', cta: 'Send link',
    lead: <p>{kind === 'brand' ? `To ${mailMask(a.email) || 'their registered email'}. Check it is really ${a.contact || a.name} before you send.` : `To ${a.email ? mailMask(a.email) : 'their registered email or mobile'}. Check it is really ${a.name} before you send.`}</p>,
    reasonLabel: 'How you confirmed it is them',
    reasons: kind === 'brand' ? ['Mail from the registered address', 'Called the registered number', 'Matched last invoice amount'] : ['OTP to the registered mobile', 'Matched last payout amount', 'Video call with ID'],
    placeholder: 'Support ticket number or a short note',
    run: o => onUser(a, api.passwordReset(a.userId, { reason: why(o), note: o.note })), toast: 'Reset link sent · Logged to audit', done: done(null)
  });
  const signOut = one => confirm({
    title: one ? `Sign out ${one.device}` : 'Sign out of every device', cta: 'Sign out', danger: true,
    lead: <p>{`${one ? 'That device' : `All ${ss.length || ''} devices`.replace('  ', ' ')} must sign in again. Nothing else changes.`}</p>,
    reasons: ['Account may be compromised', 'Lost or shared device', 'They asked for it'],
    run: o => onUser(a, api.revokeSessions(a.userId, one ? { reason: why(o), sessionId: one.id, sessionIds: [one.id] } : { reason: why(o) })), toast: 'Signed out · Logged to audit', done: done(null)
  });

  return (
    <section className="acc-sec acc-card acc-secu" aria-labelledby="accSec">
      <h2 className="t-h3" id="accSec">Status and security</h2>
      <div className="acc-status"><StPill a={a} /><p>{s ? `Suspended${a.suspended && a.suspended.at ? ' on ' + L.fmtDate(a.suspended.at) : ''}. ${(a.suspended && a.suspended.reason) || ''}` : a.lastActive ? `Last active ${L.ago(a.lastActive)}.` : a.joined ? `Joined ${L.ago(a.joined)}.` : ''}</p></div>
      {noUid ? <p className="err">The API did not send this account's user id, so account actions are off.</p> : null}
      {s ? <Lq className="lq-s lq-sm" onClick={reactivate} disabled={off}><Icon n="refund" className="ic" />Reactivate</Lq>
        : <Lq className="lq-ink lq-sm acc-susp" onClick={suspend} disabled={off}><Icon n="lock" className="ic" />Suspend account</Lq>}
      <div className="acc-sub"><p className="t-label">Password reset help</p>
        <p className="muted">{kind === 'brand' ? `Sends a reset link to ${mailMask(a.email) || 'their registered email'}. It expires in 30 minutes.` : `Sends ${first} a reset link${a.email ? ' at ' + mailMask(a.email) : ''}. It expires in 30 minutes and their old password works until they use it.`} Nobody at Linkloom sees or sets a password.</p>
        <Lq className="lq-s lq-sm" onClick={reset} disabled={off || s}><Icon n="send" className="ic" />Send reset link</Lq></div>
      <div className="acc-sub"><div className="row between"><p className="t-label">Signed in on</p><span className="t-cap muted">{sess.data ? `${ss.length} device${ss.length === 1 ? '' : 's'}` : ''}</span></div>
        {sess.err ? <p className="muted">{errText(sess.err)}</p> : !sess.data ? <p className="muted">{noUid ? 'Unknown without the user id.' : can('accounts') ? 'Loading.' : `Needs the ${whoCan('accounts')} role.`}</p>
          : ss.length ? <><ul className="acc-sess">{ss.map(x => <li key={x.id}><span className="acc-sess-t"><b>{x.device}</b><span>{x.ip ? x.ip + ' · ' : 'Location unknown · '}since {L.ago(x.since)}</span></span><button className="btn-q" type="button" onClick={() => signOut(x)} disabled={off}>Sign out</button></li>)}</ul>
            <Lq className="lq-s lq-sm" onClick={() => signOut(null)} disabled={off}><Icon n="logout" className="ic" />Sign out of every device</Lq></> : <p className="muted">Not signed in anywhere.</p>}</div>
    </section>
  );
}
const Missing = ({ kind }) => <div className="view-in"><div className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h2">{`No ${kind} with that link.`}</p><p className="muted">Search the accounts list instead.</p><Lq as="a" className="lq-p" href="#accounts">Accounts</Lq></div></div>;
const back = <a className="btn-q acc-back" href="#accounts"><Icon n="back" />Accounts</a>;
const RepStatus = ({ r }) => <span className={`pill ${r.status === 'open' ? 'pill-warn' : 'pill-paper'}`}>{r.status === 'open' ? <><Icon n="flag" />Open</> : r.status === 'actioned' ? <><Icon n="check" />{r.action || 'Actioned'}</> : 'Dismissed'}</span>;
/* the record, with the profile merged in when the API nests it */
const flatOf = d => (d && d.profile && typeof d.profile === 'object' ? { ...d, ...d.profile, user: d.user || d.profile.user } : d);
const kycReq = (kind, id) => api.verifications({ status: 'pending', kind }).then(p => p.rows.map(toVerification).find(v => v.account === id)).catch(() => null);

/* ---------- creator detail ---------- */
function CreatorView({ id }) {
  const root = useRef(null);
  const [bump, setBump] = useState(0);
  const r = useLoad(() => api.creator(id).then(flatOf), [id]);
  const vr = useLoad(() => kycReq('creator', id), [id]);
  useLayoutEffect(() => { if (r.data && root.current) mo('stagger', [...root.current.querySelectorAll('.acc-sec')]); }, [!!r.data]);
  if (r.err) return r.err.status === 404 ? <Missing kind="creator" /> : <div className="view-in">{back}<Failed err={r.err} retry={r.reload} what="This creator" /></div>;
  if (!r.data) return <div className="view-in">{back}<Loading what="this creator" /></div>;
  const c = toCreator(r.data);
  document.title = c.name + ' · Linkloom';
  ui().tab = 'creator';
  const s = susp(c), v = vr.data;
  const orders = c.orders.map(toOrder), live = orders.filter(o => ['funded', 'in_progress', 'submitted', 'revision', 'approved', 'disputed'].includes(o.phase));
  const reps = c.reportList.map(toReport);
  const after = () => { r.reload(); setBump(b => b + 1); };
  const off = !can('catalog') || s;
  const patch = (body, audit) => api.updateCreator(c.id, { ...body, reason: audit });
  const toggleBadge = async b => {
    if (off) return;
    const on = !hasBadge(c, b), next = on ? [...c.badges, b] : c.badges.filter(x => x.toLowerCase() !== b.toLowerCase());
    r.set(d => ({ ...d, badges: next }));
    try { await patch({ badges: next }, `${on ? 'Added' : 'Removed'} badge ${b}`); L.toast('Logged to audit', 'check'); setBump(x => x + 1); } catch (e) { r.reload(); L.toast(errText(e), 'alert'); }
  };
  const toggleFeat = async () => {
    if (off) return;
    const on = !c.featured;
    r.set(d => ({ ...d, featured: on, isFeatured: on }));
    try { await patch({ featured: on }, on ? 'Added to featured creators' : 'Removed from featured creators'); L.toast('Logged to audit', 'check'); setBump(x => x + 1); } catch (e) { r.reload(); L.toast(errText(e), 'alert'); }
  };
  return (
    <div className="view-in acc acc-d" ref={root}>
      {back}
      <header className="acc-mast">
        <Av kind="creator" name={c.name} cls="acc-av" />
        <div className="acc-mast-t"><p className="acc-kind acc-kind--c"><i className="dot"></i>{['Creator', c.city, c.joined && 'joined ' + L.fmtDate(c.joined, { year: true })].filter(Boolean).join(' · ')}</p>
          <h1 className="t-h1">{c.name}</h1>
          <p className="acc-mast-m">{c.handle ? <span className="acc-handle">{c.handle}</span> : <span className="muted">No handle yet</span>}<KycPill k={c.kyc} />{v ? <a className="btn-q" href={`#verify-${v.id}`}>Open KYC request</a> : null}</p></div>
        <div className="acc-mast-s"><StPill a={c} /></div>
      </header>
      <dl className="acc-band">
        <div><dt>Followers</dt><dd className="t-money">{c.followers ? L.compact(c.followers) : '—'}</dd><p>Instagram and YouTube</p></div>
        <div><dt>Engagement</dt><dd className="t-money">{c.er != null ? c.er.toFixed(1) + '%' : '—'}</dd><p>{c.er > 12 ? 'Unusually high, check for bought likes' : 'average per post'}</p></div>
        <div><dt>Approved jobs</dt><dd className="t-money">{c.jobs}</dd><p>{c.rating ? `rated ${c.rating.toFixed(1)} by brands` : 'no ratings yet'}</p></div>
        <div><dt>Paid out</dt><dd className="t-money">{L.inr(c.earned)}</dd><p>{live.length ? `${live.length} live order${live.length > 1 ? 's' : ''} in escrow` : 'nothing in escrow now'}</p></div>
      </dl>
      <div className="acc-grid">
        <div className="acc-col">
          <section className="acc-sec" aria-labelledby="accBdg"><h2 className="t-h2" id="accBdg">Badges</h2>
            <p className="muted">Badges show on the creator’s public profile and in brand search.</p>
            <ul className="acc-badges">{BADGES.map(([b, d]) => { const on = hasBadge(c, b), need = b === 'Verified Pro' && c.kyc !== 'verified' && !on;
              return <li key={b}><button className="acc-bd" type="button" aria-pressed={on} disabled={need || off} onClick={() => toggleBadge(b)}>
                <span className="acc-bd-i"><Icon n="verified" /></span><span className="acc-bd-t"><b>{b}</b><span>{need ? 'Needs verified KYC first' : d}</span></span>
                <span className="acc-sw" aria-hidden="true"><i></i></span></button></li>; })}</ul>
          </section>
          <section className="acc-sec" aria-labelledby="accTag"><div className="row between"><h2 className="t-h2" id="accTag">Category tags</h2><Lq className="lq-s lq-sm" onClick={() => editTags(c, after)} disabled={!can('catalog')}><Icon n="edit" className="ic" />Edit tags</Lq></div>
            <div className="chips acc-tagl">{c.tags.length ? c.tags.map(t => <span className="pill pill-line" key={t}>{t}</span>) : <p className="muted">No tags yet. Tags decide which brand searches they show up in.</p>}</div>
          </section>
          <section className="acc-sec" aria-labelledby="accFeat"><h2 className="t-h2" id="accFeat">Featured</h2>
            <button className="acc-bd acc-bd--wide" type="button" aria-pressed={c.featured} disabled={off} onClick={toggleFeat}>
              <span className="acc-bd-i acc-bd-i--star"><Icon n="star" /></span><span className="acc-bd-t"><b>{c.featured ? 'Featured on Discover' : 'Not featured'}</b><span>{s ? 'Suspended accounts cannot be featured' : 'Shown in the top row of brand search. Order is set in Marketplace.'}</span></span>
              <span className="acc-sw" aria-hidden="true"><i></i></span></button>
            <a className="btn-q" href="#marketplace-featured">Featured order<Icon n="arrow" /></a>
          </section>
          <section className="acc-sec" aria-labelledby="accRep"><h2 className="t-h2" id="accRep">Reports</h2>
            {reps.length ? <ul className="acc-reps">{reps.map(x => <li key={x.id}><a href={`#report-${x.id}`}><span className="acc-reps-t"><b>{x.reason}</b><span>{[x.target, `by ${x.by}`, L.ago(x.at)].filter(Boolean).join(' · ')}</span></span><RepStatus r={x} /></a></li>)}</ul>
              : <p className="muted">{c.reports ? `${c.reports} report${c.reports > 1 ? 's' : ''} on record; the API did not send the list.` : `No reports against ${c.name.split(' ')[0]}.`}</p>}
          </section>
        </div>
        <div className="acc-col acc-col--side">
          <Security kind="creator" a={c} after={after} />
          <section className="acc-sec acc-card" aria-labelledby="accOrd"><h2 className="t-h3" id="accOrd">Orders</h2>
            {orders.length ? <ul className="acc-ord">{orders.slice(0, 5).map(o => <li key={o.id}><a href={`#order-${o.id}`}><span><b>{o.title}</b><span>{o.brandName}</span></span><span className="num">{L.inr(o.amount)}</span></a></li>)}</ul> : <p className="muted">No orders yet.</p>}
          </section>
          <History a={c} bump={bump} />
        </div>
      </div>
    </div>
  );
}
function editTags(c, after) {
  const MAX = 4;
  function Pick({ close }) {
    const [pick_, setPick] = useState(c.tags);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const cats = useLoad(() => api.categories({}).then(p => p.rows.map(toCategory).map(x => x.name)), []);
    const list = [...new Set([...(cats.data || []), ...c.tags])];
    const save = async () => {
      setBusy(true); setErr('');
      try { await api.updateCreator(c.id, { tags: pick_, reason: `${c.tags.join(', ') || 'none'} → ${pick_.join(', ') || 'none'}` }); close(); L.toast('Logged to audit', 'check'); after(); }
      catch (e) { setErr(errText(e)); setBusy(false); }
    };
    return (
      <div className="adm-form"><p className="adm-lead">{`Pick up to ${MAX}. Brands filter search by these, so keep them to what ${c.name.split(' ')[0]} actually makes.`}</p>
        {cats.err ? <p className="err">{errText(cats.err)}</p> : !cats.data ? <p className="muted">Loading categories.</p> :
          <div className="chips acc-tagpick" role="group" aria-label="Categories">{list.map(t => { const on = pick_.includes(t); return <button className="chip" type="button" key={t} aria-pressed={on} disabled={!on && pick_.length >= MAX} onClick={() => setPick(p => (p.includes(t) ? p.filter(x => x !== t) : [...p, t]))}>{t}</button>; })}</div>}
        <p className="help" aria-live="polite">{`${pick_.length} of ${MAX} chosen`}</p>
        {err ? <p className="err" role="alert">{err}</p> : null}
        <LogLine />
        <div className="adm-btns"><Lq className="lq-p" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save tags'}</Lq><Lq className="lq-s" onClick={() => close()}>Cancel</Lq></div></div>
    );
  }
  L.openSheet({ title: `Tags for ${c.name}`, body: s => <Pick close={s.close} /> });
}

/* ---------- brand detail ---------- */
const DAY = 864e5, istDay = t => Math.floor((t + 19800000) / DAY);
function postDays(b, camps) {
  const today = istDay(Date.now()), days = [];
  for (let i = 29; i >= 0; i--) days.push({ t: (today - i) * DAY - 19800000 + 43200000, n: 0 });
  const series = arr(pick(b.raw.postingDaily, b.raw.postsByDay, b.raw.campaignStats && b.raw.campaignStats.daily));
  if (series.length) series.forEach(x => { const t = Date.parse(pick(x.date, x.day, x.d)); const i = 29 - (today - istDay(t)); if (Number.isFinite(t) && i >= 0 && i < 30) days[i].n += num(pick(x.count, x.n, x.posts)) || 0; });
  else camps.forEach(k => { const t = Date.parse(k.posted); const i = 29 - (today - istDay(t)); if (Number.isFinite(t) && i >= 0 && i < 30) days[i].n++; });
  return days;
}
function Chart({ b, camps }) {
  const [tip, setTip] = useState(null);
  const days = postDays(b, camps), have = days.some(x => x.n) || b.postsLast30 === 0;
  const last30 = b.postsLast30 != null ? b.postsLast30 : days.reduce((n, x) => n + x.n, 0), avg = b.postsAvg || 0;
  const max = Math.max(3, ...days.map(x => x.n));
  const W = 300, H = 96, bw = 8, gap = 2, top = 8, y = v => H - (v / max) * (H - top);
  const avgDay = avg / 30, recent = days.slice(-3).reduce((n, x) => n + x.n, 0);
  const pct = avg ? Math.round((last30 / avg - 1) * 100) : null, sp = spike({ postsLast30: last30, postsAvg: avg });
  const fd = t => L.fmtDate(new Date(t).toISOString());
  return <>
    <div className="acc-cmp">
      <div><span>Last 30 days</span><b className="t-money">{last30}</b><i style={{ '--w': Math.min(100, last30 / Math.max(last30, avg, 1) * 100) + '%' }}></i></div>
      <div><span>Usual month</span><b className="t-money">{avg ? avg.toFixed(1) : 'None'}</b><i className="is-avg" style={{ '--w': (avg ? avg / Math.max(last30, avg, 1) * 100 : 0) + '%' }}></i></div>
      <p className={sp ? 'acc-cmp-bad' : ''}>{sp ? <Icon n="alert" /> : null}{avg ? (pct > 0 ? `${pct}% above their usual pace` : pct < 0 ? `${-pct}% below their usual pace` : 'On their usual pace') : 'New account: no usual pace yet'}{sp ? `. ${last30} posted in ${days.filter(x => x.n).length} days` : ''}.</p>
    </div>
    {have ? <figure className="acc-ch">
      <figcaption className="sr-only">Campaigns posted per day, last 30 days</figcaption>
      <div className="acc-ch-w" onPointerLeave={() => setTip(null)}><svg viewBox={`0 0 ${W - gap} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <line className="acc-ch-g" x1="0" x2={W} y1={y(max)} y2={y(max)} />
        {days.map((x, i) => (x.n ? <rect className={'acc-ch-b' + (tip === i ? ' is-on' : '')} key={i} x={i * (bw + gap)} y={y(x.n)} width={bw} height={H - y(x.n)} rx="2" /> : <rect className="acc-ch-z" key={i} x={i * (bw + gap)} y={H - 1} width={bw} height="1" />))}
        {avgDay ? <line className="acc-ch-avg" x1="0" x2={W} y1={y(avgDay)} y2={y(avgDay)} /> : null}
        {days.map((x, i) => <rect className="acc-ch-h" key={'h' + i} x={i * (bw + gap)} y="0" width={bw + gap} height={H} onPointerMove={() => setTip(i)} />)}</svg>
        <span className="acc-ch-ymax num" style={{ top: (y(max) / H * 100) + '%' }}>{max}</span>
        <div className="acc-tip" role="status" hidden={tip == null} style={tip != null ? { left: ((tip + 0.5) / 30 * 100) + '%' } : undefined}>{tip != null ? <><b>{days[tip].n} posted</b><span>{fd(days[tip].t)}</span></> : null}</div></div>
      <div className="acc-ch-x num"><span>{fd(days[0].t)}</span><span>{fd(days[15].t)}</span><span>Today</span></div>
      <table className="sr-only"><caption>Campaigns posted per day</caption><tbody><tr><th scope="col">Day</th><th scope="col">Posts</th></tr>{days.filter(x => x.n).map((x, i) => <tr key={i}><td>{fd(x.t)}</td><td>{x.n}</td></tr>)}</tbody></table>
    </figure> : <p className="muted">The API did not send posting dates for this brand.</p>}
    <p className="t-cap muted">Bars: campaigns posted each day.{avgDay ? ' Dashed line: their usual daily pace.' : ''} Last 3 days: {recent}.</p>
  </>;
}
function BrandView({ id }) {
  const root = useRef(null);
  const [bump, setBump] = useState(0);
  const r = useLoad(() => api.brand(id).then(flatOf), [id]);
  const vr = useLoad(() => kycReq('brand', id), [id]);
  const cr = useLoad(() => (r.data && !arr(r.data.campaigns).length ? api.campaigns({ brandId: id, filter: 'all' }).then(p => p.rows).catch(() => []) : Promise.resolve(null)), [id, !!r.data]);
  useLayoutEffect(() => { if (r.data && root.current) mo('stagger', [...root.current.querySelectorAll('.acc-sec')]); }, [!!r.data]);
  if (r.err) return r.err.status === 404 ? <Missing kind="brand" /> : <div className="view-in">{back}<Failed err={r.err} retry={r.reload} what="This brand" /></div>;
  if (!r.data) return <div className="view-in">{back}<Loading what="this brand" /></div>;
  const b = toBrand(r.data);
  document.title = b.name + ' · Linkloom';
  ui().tab = 'brand';
  const v = vr.data;
  const camps = (b.campaigns.length ? b.campaigns : cr.data || []).map(toCampaign);
  const reps = b.reportList.map(toReport), free = freeMail(b.email), st = gstState(b.gstin);
  const after = () => { r.reload(); setBump(x => x + 1); };
  const open = b.open || camps.filter(k => /live|open/.test(k.status)).length;
  return (
    <div className="view-in acc acc-d" ref={root}>
      {back}
      <header className="acc-mast">
        <Av kind="brand" name={b.name} cls="acc-av" />
        <div className="acc-mast-t"><p className="acc-kind acc-kind--b"><i className="dot"></i>{['Brand', b.city, b.joined && 'joined ' + L.fmtDate(b.joined, { year: true })].filter(Boolean).join(' · ')}</p>
          <h1 className="t-h1">{b.name}</h1>
          <p className="acc-mast-m"><span>{b.contact}</span><KycPill k={b.verify} />{v ? <a className="btn-q" href={`#verify-${v.id}`}>Open verification request</a> : null}</p></div>
        <div className="acc-mast-s"><StPill a={b} /></div>
      </header>
      <dl className="acc-band">
        <div><dt>Posted in 30 days</dt><dd className="t-money">{b.postsLast30 != null ? b.postsLast30 : '—'}</dd><p>{spike(b) ? 'well above normal' : 'campaigns'}</p></div>
        <div><dt>Open now</dt><dd className="t-money">{open}</dd><p>campaigns taking bids</p></div>
        <div><dt>Paid via escrow</dt><dd className="t-money">{L.inr(b.spent)}</dd><p>all time</p></div>
        <div><dt>Reports</dt><dd className="t-money">{b.reports}</dd><p>{reps.filter(x => x.status === 'open').length} open in moderation</p></div>
      </dl>
      <div className="acc-grid">
        <div className="acc-col">
          <section className="acc-sec" aria-labelledby="accPost"><h2 className="t-h2" id="accPost">Campaign posting</h2><Chart b={b} camps={camps} /></section>
          <section className="acc-sec" aria-labelledby="accCo"><h2 className="t-h2" id="accCo">Company</h2>
            <dl className="acc-kv">
              <div><dt>Legal name</dt><dd>{b.legal || <span className="muted">Not provided</span>}</dd></div>
              <div><dt>GSTIN</dt><dd>{b.gstin ? <span className="acc-mono">{b.gstin}</span> : <span className="muted">Not provided</span>}{b.gstin ? (b.regVerified ? <span className="acc-m is-ok"><Icon n="check" />Verified on the GST portal{st ? ' · ' + st : ''}</span> : <span className="acc-m is-warn"><Icon n="info" />Not checked yet</span>) : <span className="acc-m is-bad"><Icon n="alert" />No company registration</span>}</dd></div>
              <div><dt>Company PAN</dt><dd>{b.gstin || b.pan ? <><span className="acc-mono">{mask(b.pan || b.gstin.slice(2, 12))}</span>{b.gstin ? <span className="acc-m is-ok"><Icon n="check" />Read from the GSTIN</span> : null}</> : <span className="muted">—</span>}</dd></div>
              {b.cin ? <div><dt>CIN</dt><dd><span className="acc-mono">{b.cin}</span></dd></div> : null}
              <div><dt>Business mail</dt><dd>{b.email || <span className="muted">Not provided</span>}{!b.email ? null : free ? <span className="acc-m is-bad"><Icon n="alert" />Free mailbox, not a company domain</span> : b.mailVerified ? <span className="acc-m is-ok"><Icon n="check" />Verified by link</span> : b.mailVerified === false ? <span className="acc-m is-bad"><Icon n="alert" />Not verified</span> : null}</dd></div>
            </dl>
          </section>
          <section className="acc-sec" aria-labelledby="accCamp"><h2 className="t-h2" id="accCamp">Campaigns</h2>
            {camps.length ? <ul className="acc-reps">{camps.map(k => <li key={k.id}><a href={`#campaign-${k.id}`}><span className="acc-reps-t"><b>{k.title}</b><span>{[k.platform === 'youtube' ? 'YouTube' : k.platform ? 'Instagram' : '', k.budget != null ? L.inr(k.budget) : '', `${k.bids} bids`, k.posted && L.ago(k.posted)].filter(Boolean).join(' · ')}</span></span>
              {k.flags ? <span className="pill pill-err"><Icon n="alert" />{k.flags} flag{k.flags > 1 ? 's' : ''}</span> : <span className="pill pill-paper">{k.status === 'live' ? 'Live' : k.status ? k.status.replace(/_/g, ' ') : '—'}</span>}</a></li>)}</ul>
              : <p className="muted">{cr.loading ? 'Loading campaigns.' : 'No campaigns posted yet.'}</p>}
          </section>
          {reps.length ? <section className="acc-sec" aria-labelledby="accRepB"><h2 className="t-h2" id="accRepB">Reports</h2>
            <ul className="acc-reps">{reps.map(x => <li key={x.id}><a href={`#report-${x.id}`}><span className="acc-reps-t"><b>{x.reason}</b><span>{[x.target, `by ${x.by}`, L.ago(x.at)].filter(Boolean).join(' · ')}</span></span><RepStatus r={x} /></a></li>)}</ul></section> : null}
        </div>
        <div className="acc-col acc-col--side"><Security kind="brand" a={b} after={after} /><History a={b} bump={bump} /></div>
      </div>
    </div>
  );
}

L.register('accounts', { title: 'Accounts', nav: 'accounts', Component: List });
L.register('creator', { title: 'Creator', nav: 'accounts', Component: ({ param }) => <CreatorView id={param} key={param} /> });
L.register('brand', { title: 'Brand', nav: 'accounts', Component: ({ param }) => <BrandView id={param} key={param} /> });
