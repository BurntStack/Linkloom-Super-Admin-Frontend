/* Accounts governance (#accounts, #creator-<id>, #brand-<id>).
   List: search, Creators / Brands, status and quick filters. Creator detail: badges, category tags, featured, reports, suspend or reactivate,
   password-reset help, sign out of devices. Brand detail: business mail, company registration, campaign posting frequency (30 days vs usual).
   Every change is logged with L.audit; destructive ones go through the confirm sheet in lib/adm.jsx. Classes are .acc-*. */
import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { data } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import { confirm, mask, mailMask, freeMail, gstState, Av, LogLine } from '../lib/adm.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';

const S = () => data;
const ui = () => { const s = S(); s.ui = s.ui || {}; return (s.ui.accounts = s.ui.accounts || { tab: 'creator', q: '', status: 'all', f: [], sess: {} }); };

const BADGES = [['Verified Pro', 'Verified KYC and 5+ approved jobs'], ['Top rated', 'Rated 4.7 or more by brands'], ['Rising', 'Fast-growing new creator']];
const KYC = { verified: ['pill-ok', 'check', 'Verified'], under_review: ['pill-info', 'clock', 'In review'], action_needed: ['pill-warn', 'info', 'Action needed'], rejected: ['pill-err', 'alert', 'Rejected'], not_started: ['pill-paper', 'minus', 'Not verified'] };
const KycPill = ({ k }) => { const m = KYC[k] || KYC.not_started; return <span className={`pill ${m[0]}`}><Icon n={m[1]} />{m[2]}</span>; };
const StPill = ({ a }) => a.status === 'suspended' ? <span className="pill pill-err"><Icon n="alert" />Suspended</span> : <span className="pill pill-ok"><Icon n="check" />Active</span>;
const spike = b => b.postsLast30 >= 5 && b.postsLast30 > 2 * b.postsAvg;
const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const phone = id => `+91 ••••• ••${String(10 + hash(id) % 90)}`;
const stamp = () => new Date(L.today().getTime() + S().audit.length * 1000).toISOString();
const None = ({ t = 'Not provided' }) => <span className="muted">{t}</span>;

/* sample signed-in devices per account (kept in ui so sign-outs stick for this visit) */
function sessions(kind, a) {
  const u = ui(); u.sess = u.sess || {};
  if (!u.sess[a.id]) u.sess[a.id] = a.status === 'suspended' ? [] : kind === 'creator'
    ? [{ d: 'Linkloom app · Android', p: a.city, at: a.lastActive || a.joined }, ...(hash(a.id) % 2 ? [{ d: 'Chrome · Windows', p: a.city, at: a.joined }] : [])]
    : [{ d: 'Chrome · macOS', p: a.city, at: '2026-11-04T09:10:00+05:30' }, { d: 'Safari · iPhone', p: a.city, at: '2026-11-02T20:30:00+05:30' }];
  return u.sess[a.id];
}

/* ---------- list ---------- */
const QF = {
  creator: [['pro', 'Verified Pro', c => c.badges.includes('Verified Pro')], ['feat', 'Featured', c => c.featured], ['kyc', 'KYC not done', c => c.kyc !== 'verified'], ['rep', 'Has reports', c => c.reports > 0]],
  brand: [['ver', 'Verified', b => b.verify === 'verified'], ['unv', 'Not verified', b => b.verify !== 'verified'], ['spike', 'Posting spike', spike], ['rep', 'Has reports', b => b.reports > 0]]
};
const CRow = ({ c }) => (
  <li><a className="acc-row" href={`#creator-${c.id}`}>
    <Av kind="creator" name={c.name} />
    <span className="acc-id"><b>{c.name}</b><span>{(c.handle ? c.handle + ' · ' : '') + c.city}</span></span>
    <span className="acc-tags">{c.badges.map(b => <span className="acc-badge" key={b}><Icon n="verified" />{b}</span>)}{c.tags.slice(0, 2).map(t => <span className="pill pill-line" key={t}>{t}</span>)}{c.featured ? <span className="acc-feat"><Icon n="star" />Featured</span> : null}</span>
    <span className="acc-n"><b className="t-money">{c.followers ? L.compact(c.followers) : '—'}</b><span>followers</span></span>
    <span className="acc-k"><KycPill k={c.kyc} />{c.reports ? <span className="acc-rep"><Icon n="flag" />{`${c.reports} report${c.reports > 1 ? 's' : ''}`}</span> : null}</span>
    <span className="acc-s"><StPill a={c} /></span><span className="acc-go"><Icon n="chevron" /></span></a></li>
);
const BRow = ({ b }) => { const good = b.mailVerified && !freeMail(b.email); return (
  <li><a className="acc-row" href={`#brand-${b.id}`}>
    <Av kind="brand" name={b.name} />
    <span className="acc-id"><b>{b.name}</b><span>{b.contact + (b.city && b.city !== '—' ? ' · ' + b.city : '')}</span></span>
    <span className="acc-tags"><span className={'acc-mail' + (good ? '' : ' is-bad')}><Icon n={good ? 'check' : 'alert'} />{b.email}</span></span>
    <span className="acc-n"><b className="t-money">{b.postsLast30}</b><span>posts in 30 days</span></span>
    <span className="acc-k"><KycPill k={b.verify} />{spike(b) ? <span className="acc-rep"><Icon n="chart" />Posting spike</span> : b.reports ? <span className="acc-rep"><Icon n="flag" />{`${b.reports} report${b.reports > 1 ? 's' : ''}`}</span> : null}</span>
    <span className="acc-s"><StPill a={b} /></span><span className="acc-go"><Icon n="chevron" /></span></a></li>
); };

function List() {
  const root = useRef(null), search = useRef(null);
  const rerender = useRerender();
  const s = S(), u = ui();
  const [head] = useState(() => ({ creators: s.creators.length, brands: s.brands.length, susp: [...s.creators, ...s.brands].filter(a => a.status === 'suspended').length }));
  useLayoutEffect(() => { mo('stagger', [...root.current.querySelectorAll('.acc-row')]); }, []);

  const q = u.q.trim().toLowerCase();
  const src = u.tab === 'creator' ? s.creators : s.brands;
  const fs = QF[u.tab].filter(([k]) => u.f.includes(k));
  const rows = src.filter(a => (u.status === 'all' || a.status === u.status) && fs.every(([, , fn]) => fn(a)) &&
    (!q || [a.name, a.handle, a.city, a.contact, a.gstin, a.email].some(x => x && String(x).toLowerCase().includes(q))));
  const dirty = u.q || u.status !== 'all' || u.f.length;

  const set = fn => () => { fn(); flushSync(rerender); };
  const setTab = k => set(() => { u.tab = k; u.f = []; });
  const setStatus = k => set(() => { u.status = k; });
  const toggle = k => set(() => { u.f = u.f.includes(k) ? u.f.filter(x => x !== k) : [...u.f, k]; });
  const clear = set(() => { u.q = ''; u.status = 'all'; u.f = []; search.current.value = ''; });

  return (
    <div className="view-in acc" ref={root}>
      <header className="page-h acc-head">
        <div className="t"><p className="t-eyebrow">Accounts</p><h1 className="t-h1">People and brands on Linkloom</h1>
          <p className="muted">{`${head.creators} creators and ${head.brands} brands${head.susp ? `, ${head.susp} suspended` : ''}. Changes here are logged. `}<span className="sample">Sample data</span></p></div>
        <div className="acc-search"><Icon n="search" /><label className="sr-only" htmlFor="accQ">Search accounts</label>
          <input className="input" id="accQ" type="search" autoComplete="off" spellCheck="false" placeholder="Name, @handle, city or GSTIN" defaultValue={u.q} ref={search} onInput={e => { u.q = e.currentTarget.value; rerender(); }} /></div>
      </header>
      <div className="acc-bar">
        <div className="seg acc-seg" role="group" aria-label="Account type">
          <button type="button" data-tab="creator" aria-pressed={u.tab === 'creator'} onClick={setTab('creator')}><i className="dot acc-dot-c"></i>Creators</button>
          <button type="button" data-tab="brand" aria-pressed={u.tab === 'brand'} onClick={setTab('brand')}><i className="dot acc-dot-b"></i>Brands</button>
        </div>
        <div className="chips acc-st" role="group" aria-label="Status">{[['all', 'Any status'], ['active', 'Active'], ['suspended', 'Suspended']].map(([k, t]) => <button className="chip" type="button" data-st={k} aria-pressed={u.status === k} key={k} onClick={setStatus(k)}>{t}</button>)}</div>
        <div className="chips acc-qf no-anchor" role="group" aria-label="Filters" id="accQf">{QF[u.tab].map(([k, t]) => <button className="chip" type="button" data-f={k} aria-pressed={u.f.includes(k)} key={u.tab + k} onClick={toggle(k)}>{t}</button>)}</div>
      </div>
      <div className="acc-count"><p id="accCount" aria-live="polite"><b>{rows.length}</b>{` of ${src.length} ${u.tab === 'creator' ? 'creators' : 'brands'}`}</p><button className="btn-q" type="button" data-clear="" hidden={!dirty} onClick={clear}>Clear filters</button></div>
      <ul className="acc-list no-anchor" id="accList">
        {rows.length ? rows.map(a => (u.tab === 'creator' ? <CRow c={a} key={a.id} /> : <BRow b={a} key={a.id} />))
          : <li className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h3">{`No ${u.tab === 'creator' ? 'creators' : 'brands'} match`}</p><p className="muted">Try another name, or clear the filters.</p></li>}
      </ul>
    </div>
  );
}

/* ---------- shared detail parts ---------- */
function History({ a }) {
  const rows = S().audit.filter(e => String(e.target).includes('(' + a.id + ')')).slice().reverse();
  return (
    <section className="acc-sec" aria-labelledby="accHist"><h2 className="t-h3" id="accHist">Admin history</h2>
      {rows.length ? <ol className="acc-hist">{rows.map(e => <li key={e.id}><span className="acc-hist-a">{e.action}</span><span className="acc-hist-d">{e.detail || ''}</span><span className="acc-hist-w num">{`${e.who} · ${L.fmtDate(e.at)} · `}<code>{e.hash}</code></span></li>)}</ol>
        : <p className="muted">No admin actions on this account yet.</p>}
      <a className="btn-q" href="#audit"><Icon n="shield" />Full audit log</a></section>
  );
}
function Security({ kind, a }) {
  const ss = sessions(kind, a), first = String(kind === 'brand' ? a.contact : a.name).split(' ')[0];
  const target = `${a.name} (${a.id})`;
  const susp = a.status === 'suspended';
  const suspend = () => confirm({
    title: `Suspend ${a.name}`, cta: 'Suspend account', danger: true,
    lead: kind === 'brand' ? `Campaigns are hidden, no new hires can start, and money in escrow stays held until each order is settled.` : `${a.name.split(' ')[0]} cannot bid or be hired. Live orders and money in escrow are not touched; settle them in Orders.`,
    reasons: kind === 'brand' ? ['Scam or pay-to-join campaigns', 'Off-platform payment requests', 'Fake business details', 'Abuse or harassment'] : ['Bid ring or linked accounts', 'Scam or off-platform payment', 'Fake reviews or followers', 'Abuse or harassment', 'Under 18'],
    extra: <label className="check"><input type="checkbox" data-outall="" defaultChecked /><span>Also sign out of every device</span></label>,
    onConfirm: ({ reason, note, body }) => {
      const out = body.querySelector('[data-outall]').checked, why = reason === 'Other' ? note : reason + (note ? ': ' + note : '');
      L.store.set(st => { const x = (kind === 'brand' ? st.brands : st.creators).find(y => y.id === a.id); x.status = 'suspended'; x.suspended = { at: stamp(), by: st.me.name, reason: why }; if (kind === 'creator') x.featured = false; }, 'account');
      if (out) ui().sess[a.id] = [];
      L.audit('account.suspend', target, why + (out ? ' · signed out everywhere' : ''));
      L.route();
    }
  });
  const reactivate = () => confirm({
    title: `Reactivate ${a.name}`, cta: 'Reactivate',
    lead: `${a.suspended ? `Suspended by ${a.suspended.by || 'Linkloom team'} on ${L.fmtDate(a.suspended.at)}: “${a.suspended.reason || 'no reason recorded'}”. ` : ''}Once reactivated they can sign in, bid and be hired again. Badges and featured status do not come back on their own.`,
    reasons: ['Appeal accepted', 'Suspended by mistake', 'Issue resolved'],
    onConfirm: ({ reason, note }) => {
      const was = a.suspended && (a.suspended.by || 'Linkloom team');
      L.store.set(st => { const x = (kind === 'brand' ? st.brands : st.creators).find(y => y.id === a.id); x.status = 'active'; delete x.suspended; }, 'account');
      L.audit('account.reactivate', target, (reason === 'Other' ? note : reason + (note ? ': ' + note : '')) + (was ? ` · was suspended by ${was}` : ''));
      L.route();
    }
  });
  const reset = () => confirm({
    title: 'Send a reset link', cta: 'Send link',
    lead: kind === 'brand' ? `To ${mailMask(a.email)}. Check it is really ${a.contact} before you send.` : `By SMS to ${phone(a.id)}. Check it is really ${a.name} before you send.`,
    reasonLabel: 'How you confirmed it is them',
    reasons: kind === 'brand' ? ['Mail from the registered address', 'Called the registered number', 'Matched last invoice amount'] : ['OTP to the registered mobile', 'Matched last payout amount', 'Video call with ID'],
    placeholder: 'Support ticket number or a short note',
    onConfirm: ({ reason, note }) => { L.audit('account.password_reset', target, 'Reset link sent · ' + (reason === 'Other' ? note : reason) + (note && reason !== 'Other' ? ' · ' + note : '')); L.route(); }
  });
  const signOut = one => () => confirm({
    title: one ? `Sign out ${one.d}` : 'Sign out of every device', cta: 'Sign out', danger: true,
    lead: `${one ? 'That device' : `All ${ss.length} devices`} must sign in again. Nothing else changes.`,
    reasons: ['Account may be compromised', 'Lost or shared device', 'They asked for it'],
    onConfirm: ({ reason, note }) => {
      const u = ui(); u.sess[a.id] = one ? ss.filter(x => x !== one) : [];
      L.audit('account.sessions_invalidate', target, (one ? one.d : 'All devices') + ' · ' + (reason === 'Other' ? note : reason));
      L.route();
    }
  });
  return (
    <section className="acc-sec acc-card acc-secu" aria-labelledby="accSec">
      <h2 className="t-h3" id="accSec">Status and security</h2>
      <div className="acc-status"><StPill a={a} /><p>{susp ? `Suspended by ${a.suspended.by || 'Linkloom team'} on ${L.fmtDate(a.suspended.at)}. ${a.suspended.reason || ''}` : (a.lastActive ? `Last active ${L.ago(a.lastActive)}.` : `Joined ${L.ago(a.joined)}.`)}</p></div>
      {susp
        ? <Lq className="lq-s lq-sm" data-do="reactivate" onClick={reactivate}><Icon n="refund" className="ic" />Reactivate</Lq>
        : <Lq className="lq-ink lq-sm acc-susp" data-do="suspend" onClick={suspend}><Icon n="lock" className="ic" />Suspend account</Lq>}
      <div className="acc-sub"><p className="t-label">Password reset help</p>
        <p className="muted">{(kind === 'brand' ? `Sends a reset link to ${mailMask(a.email)}. It expires in 30 minutes.` : `${first} signs in with Google or a mobile OTP. A reset link lets them re-verify ${phone(a.id)} and sign in again.`) + ' Nobody at Linkloom sees or sets a password.'}</p>
        <Lq className="lq-s lq-sm" data-do="reset" onClick={reset} disabled={susp} aria-disabled={susp ? 'true' : undefined}><Icon n="send" className="ic" />Send reset link</Lq></div>
      <div className="acc-sub"><div className="row between"><p className="t-label">Signed in on</p><span className="t-cap muted">{`${ss.length} device${ss.length === 1 ? '' : 's'}`}</span></div>
        {ss.length ? <><ul className="acc-sess">{ss.map((x, i) => <li key={i}><span className="acc-sess-t"><b>{x.d}</b><span>{(x.p && x.p !== '—' ? x.p + ' · ' : 'Location unknown · ') + `since ${L.ago(x.at)}`}</span></span><button className="btn-q" type="button" data-do="out" data-i={i} onClick={signOut(x)}>Sign out</button></li>)}</ul>
          <Lq className="lq-s lq-sm" data-do="outall" onClick={signOut(null)}><Icon n="logout" className="ic" />Sign out of every device</Lq></> : <p className="muted">Not signed in anywhere.</p>}</div>
    </section>
  );
}
const Missing = ({ kind }) => <div className="view-in"><div className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h2">{`No ${kind} with that link.`}</p><p className="muted">Search the accounts list instead.</p><Lq className="lq-p" data-go="#accounts">Accounts</Lq></div></div>;

/* ---------- creator detail ---------- */
function TagPicker({ c, target, close }) {
  const cats = S().categories, MAX = 4;
  const [pick, setPick] = useState(() => [...c.tags]);
  const toggle = v => () => setPick(p => (p.includes(v) ? p.filter(x => x !== v) : [...p, v]));
  const save = () => {
    const before = c.tags.join(', ') || 'none';
    L.store.set(() => { c.tags = [...pick]; }, 'tags');
    L.audit('creator.tags_edit', target, `${before} → ${pick.join(', ') || 'none'}`);
    close(); L.toast('Logged to audit', 'check'); L.route();
  };
  return (
    <div className="adm-form"><p className="adm-lead">{`Pick up to ${MAX}. Brands filter search by these, so keep them to what ${c.name.split(' ')[0]} actually makes.`}</p>
      <div className="chips acc-tagpick" role="group" aria-label="Categories">{cats.map(t => { const on = pick.includes(t); return <button className="chip" type="button" data-t={t} aria-pressed={on} disabled={!on && pick.length >= MAX} key={t} onClick={toggle(t)}>{t}</button>; })}</div>
      <p className="help" aria-live="polite" data-n="">{`${pick.length} of ${MAX} chosen`}</p><LogLine />
      <div className="adm-btns"><Lq className="lq-p" data-save="" onClick={save}>Save tags</Lq><Lq className="lq-s" data-cancel="" onClick={() => close()}>Cancel</Lq></div></div>
  );
}
function CreatorView({ id }) {
  const root = useRef(null);
  const rerender = useRerender();
  const s = S(), c = L.creator(id);
  useLayoutEffect(() => { if (c) mo('stagger', [...root.current.querySelectorAll('.acc-sec')]); }, []);
  if (!c) return <Missing kind="creator" />;
  ui().tab = 'creator';
  const orders = s.orders.filter(o => o.creator === c.id), live = orders.filter(o => L.liveOrders().includes(o));
  const reps = s.reports.filter(r => String(r.target).includes(c.name));
  const v = s.verifications.find(x => x.account === c.id);
  const susp = c.status === 'suspended';
  const target = `${c.name} (${c.id})`;

  const badge = b => () => {
    const on = !c.badges.includes(b);
    L.store.set(() => { c.badges = on ? [...c.badges, b] : c.badges.filter(x => x !== b); }, 'badge');
    L.audit(on ? 'creator.badge_add' : 'creator.badge_remove', target, b);
    L.toast('Logged to audit', 'check'); rerender();
  };
  const feature = () => {
    const on = !c.featured;
    L.store.set(() => { c.featured = on; }, 'featured');
    L.audit(on ? 'creator.feature' : 'creator.unfeature', target, on ? 'Added to featured creators' : 'Removed from featured creators');
    L.toast('Logged to audit', 'check'); rerender();
  };
  const editTags = () => L.openSheet({ title: `Tags for ${c.name}`, body: o => <TagPicker c={c} target={target} close={o.close} /> });

  return (
    <div className="view-in acc acc-d" ref={root}>
      <a className="btn-q acc-back" href="#accounts"><Icon n="back" />Accounts</a>
      <header className="acc-mast">
        <Av kind="creator" name={c.name} cls="acc-av" />
        <div className="acc-mast-t"><p className="acc-kind acc-kind--c"><i className="dot"></i>{`Creator · ${c.city} · joined ${L.fmtDate(c.joined, { year: true })}`}</p>
          <h1 className="t-h1">{c.name}</h1>
          <p className="acc-mast-m">{c.handle ? <span className="acc-handle">{c.handle}</span> : <span className="muted">No handle yet</span>}<KycPill k={c.kyc} />{v && v.status === 'pending' ? <a className="btn-q" href={`#verify-${v.id}`}>Open KYC request</a> : null}</p></div>
        <div className="acc-mast-s"><StPill a={c} /></div>
      </header>
      <dl className="acc-band">
        <div><dt>Followers</dt><dd className="t-money">{c.followers ? L.compact(c.followers) : '—'}</dd><p>Instagram and YouTube</p></div>
        <div><dt>Engagement</dt><dd className="t-money">{c.er != null ? c.er.toFixed(1) + '%' : '—'}</dd><p>{c.er > 12 ? 'Unusually high, check for bought likes' : 'average per post'}</p></div>
        <div><dt>Approved jobs</dt><dd className="t-money">{c.jobs}</dd><p>{c.rating ? `rated ${c.rating.toFixed(1)} by brands` : 'no ratings yet'}</p></div>
        <div><dt>Paid out</dt><dd className="t-money">{L.inr(c.earned)}</dd><p>{live.length ? `${live.length} live order${live.length > 1 ? 's' : ''} in escrow` : 'nothing in escrow now'}</p></div>
      </dl>
      <p className="acc-sample"><span className="sample">Sample figures</span></p>
      <div className="acc-grid">
        <div className="acc-col">
          <section className="acc-sec" aria-labelledby="accBdg"><h2 className="t-h2" id="accBdg">Badges</h2>
            <p className="muted">Badges show on the creator’s public profile and in brand search.</p>
            <ul className="acc-badges">{BADGES.map(([b, d]) => { const on = c.badges.includes(b), need = b === 'Verified Pro' && c.kyc !== 'verified' && !on;
              return <li key={b}><button className="acc-bd" type="button" data-badge={b} aria-pressed={on} disabled={need || susp} onClick={badge(b)}>
                <span className="acc-bd-i"><Icon n="verified" /></span><span className="acc-bd-t"><b>{b}</b><span>{need ? 'Needs verified KYC first' : d}</span></span>
                <span className="acc-sw" aria-hidden="true"><i></i></span></button></li>; })}</ul>
          </section>
          <section className="acc-sec" aria-labelledby="accTag"><div className="row between"><h2 className="t-h2" id="accTag">Category tags</h2><Lq className="lq-s lq-sm" data-tags="" onClick={editTags}><Icon n="edit" className="ic" />Edit tags</Lq></div>
            <div className="chips acc-tagl">{c.tags.length ? c.tags.map(t => <span className="pill pill-line" key={t}>{t}</span>) : <p className="muted">No tags yet. Tags decide which brand searches they show up in.</p>}</div>
          </section>
          <section className="acc-sec" aria-labelledby="accFeat"><h2 className="t-h2" id="accFeat">Featured</h2>
            <button className="acc-bd acc-bd--wide" type="button" data-feature="" aria-pressed={!!c.featured} disabled={susp} onClick={feature}>
              <span className="acc-bd-i acc-bd-i--star"><Icon n="star" /></span><span className="acc-bd-t"><b>{c.featured ? 'Featured on Discover' : 'Not featured'}</b><span>{susp ? 'Suspended accounts cannot be featured' : 'Shown in the top row of brand search. Order is set in Marketplace.'}</span></span>
              <span className="acc-sw" aria-hidden="true"><i></i></span></button>
            <a className="btn-q" href="#marketplace-featured">Featured order<Icon n="arrow" /></a>
          </section>
          <section className="acc-sec" aria-labelledby="accRep"><h2 className="t-h2" id="accRep">Reports</h2>
            {reps.length ? <ul className="acc-reps">{reps.map(r => <li key={r.id}><a href={`#moderation-${r.id}`}><span className="acc-reps-t"><b>{r.reason}</b><span>{`${r.target} · by ${r.by} · ${L.ago(r.at)}`}</span></span>
              <span className={`pill ${r.status === 'open' ? 'pill-warn' : 'pill-paper'}`}>{r.status === 'open' ? <><Icon n="flag" />Open</> : r.status === 'actioned' ? <><Icon n="check" />{r.action || 'Actioned'}</> : 'Dismissed'}</span></a></li>)}</ul>
              : <p className="muted">{`No reports against ${c.name.split(' ')[0]}.`}</p>}
          </section>
        </div>
        <div className="acc-col acc-col--side">
          <Security kind="creator" a={c} />
          <section className="acc-sec acc-card" aria-labelledby="accOrd"><h2 className="t-h3" id="accOrd">Orders</h2>
            {orders.length ? <ul className="acc-ord">{orders.slice(0, 5).map(o => <li key={o.id}><a href={`#orders-${o.id}`}><span><b>{o.title}</b><span>{(L.brand(o.brand) || {}).name || ''}</span></span><span className="num">{L.inr(o.amount)}</span></a></li>)}</ul> : <p className="muted">No orders yet.</p>}
          </section>
          <History a={c} />
        </div>
      </div>
    </div>
  );
}

/* ---------- brand detail ---------- */
/* posting days over the last 30 days: new accounts post from their join day; others spread deterministically */
function postDays(b) {
  const today = L.today(), days = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(today.getTime() - i * 864e5); days.push({ d, n: 0 }); }
  const joinIdx = Math.max(0, days.findIndex(x => L.fmtDate(x.d.toISOString()) === L.fmtDate(b.joined)));
  const camp = S().campaigns.filter(k => k.brand === b.id);
  const span = Math.max(1, Math.min(29 - joinIdx, 30)); // days from join to yesterday
  const n = b.postsLast30;
  if (joinIdx > 0 && 30 - joinIdx <= 4) { const last = Math.max(1, 29 - joinIdx); for (let i = 0; i < n; i++) days[joinIdx + Math.min(last - 1, Math.floor(i * last / n))].n++; }
  else { const h = hash(b.id); for (let i = 0; i < n; i++) days[(joinIdx + Math.floor((i + .5) * span / n) + h % 3) % 30].n++; }
  camp.forEach(k => { const i = days.findIndex(x => L.fmtDate(x.d.toISOString()) === L.fmtDate(k.posted)); if (i >= 0 && !days[i].n) days[i].n = 1; });
  return days;
}
function PostingChart({ b }) {
  const wrap = useRef(null), tip = useRef(null);
  const days = postDays(b), max = Math.max(3, ...days.map(x => x.n));
  const W = 300, H = 96, bw = 8, gap = 2, top = 8;
  const y = v => H - (v / max) * (H - top);
  const avgDay = b.postsAvg / 30;
  const peak = days.reduce((m, x) => x.n > m.n ? x : m, days[0]);
  const recent = days.slice(-3).reduce((n, x) => n + x.n, 0);
  const pct = b.postsAvg ? Math.round((b.postsLast30 / b.postsAvg - 1) * 100) : null;
  const day = x => L.fmtDate(x.d.toISOString());
  /* hover tooltip */
  const hide = () => { tip.current.hidden = true; wrap.current.querySelectorAll('.acc-ch-b.is-on').forEach(r => r.classList.remove('is-on')); };
  const move = e => {
    const r = e.target.closest('.acc-ch-h'); if (!r) return;
    const i = +r.dataset.i, x = days[i], t = tip.current;
    t.textContent = ''; const bEl = document.createElement('b'); bEl.textContent = `${x.n} posted`; const sEl = document.createElement('span'); sEl.textContent = day(x); t.append(bEl, sEl);
    t.hidden = false; t.style.left = ((i + .5) / 30 * 100) + '%';
    wrap.current.querySelectorAll('.acc-ch-b').forEach(n => n.classList.toggle('is-on', n.dataset.i === String(i)));
  };
  return (
    <>
      <div className="acc-cmp">
        <div><span>Last 30 days</span><b className="t-money">{b.postsLast30}</b><i style={{ '--w': Math.min(100, b.postsLast30 / Math.max(b.postsLast30, b.postsAvg, 1) * 100) + '%' }}></i></div>
        <div><span>Usual month</span><b className="t-money">{b.postsAvg ? b.postsAvg.toFixed(1) : 'None'}</b><i className="is-avg" style={{ '--w': (b.postsAvg ? b.postsAvg / Math.max(b.postsLast30, b.postsAvg, 1) * 100 : 0) + '%' }}></i></div>
        <p className={spike(b) ? 'acc-cmp-bad' : ''}>{spike(b) ? <Icon n="alert" /> : null}{(b.postsAvg ? (pct > 0 ? `${pct}% above their usual pace` : pct < 0 ? `${-pct}% below their usual pace` : 'On their usual pace') : `New account: no usual pace yet`) + (spike(b) && peak.n ? `. ${b.postsLast30} posted in ${days.filter(x => x.n).length} days` : '') + '.'}</p>
      </div>
      <figure className="acc-ch">
        <figcaption className="sr-only">Campaigns posted per day, last 30 days</figcaption>
        <div className="acc-ch-w" ref={wrap} onPointerMove={move} onPointerLeave={hide}><svg viewBox={`0 0 ${W - gap} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line className="acc-ch-g" x1="0" x2={W} y1={y(max)} y2={y(max)} />
          {days.map((x, i) => x.n ? <rect className="acc-ch-b" x={i * (bw + gap)} y={y(x.n)} width={bw} height={H - y(x.n)} rx="2" data-i={i} key={'b' + i} /> : <rect className="acc-ch-z" x={i * (bw + gap)} y={H - 1} width={bw} height="1" key={'b' + i} />)}
          {avgDay ? <line className="acc-ch-avg" x1="0" x2={W} y1={y(avgDay)} y2={y(avgDay)} /> : null}
          {days.map((x, i) => <rect className="acc-ch-h" x={i * (bw + gap)} y="0" width={bw + gap} height={H} data-i={i} key={'h' + i} />)}</svg>
          <span className="acc-ch-ymax num" style={{ top: y(max) / H * 100 + '%' }}>{max}</span>
          <div className="acc-tip" role="status" hidden ref={tip}></div></div>
        <div className="acc-ch-x num"><span>{day(days[0])}</span><span>{day(days[15])}</span><span>Today</span></div>
        <table className="sr-only"><caption>Campaigns posted per day</caption><tbody><tr><th scope="col">Day</th><th scope="col">Posts</th></tr>{days.filter(x => x.n).map((x, i) => <tr key={i}><td>{day(x)}</td><td>{x.n}</td></tr>)}</tbody></table>
      </figure>
      <p className="t-cap muted">{`Bars: campaigns posted each day.${avgDay ? ' Dashed line: their usual daily pace.' : ''} Last 3 days: ${recent}.`}</p>
    </>
  );
}
function BrandView({ id }) {
  const root = useRef(null);
  const s = S(), b = L.brand(id);
  useLayoutEffect(() => { if (b) mo('stagger', [...root.current.querySelectorAll('.acc-sec')]); }, []);
  if (!b) return <Missing kind="brand" />;
  ui().tab = 'brand';
  const camps = s.campaigns.filter(k => k.brand === b.id), v = s.verifications.find(x => x.account === b.id);
  const reps = s.reports.filter(r => String(r.target).includes(b.name));
  const free = freeMail(b.email), st = gstState(b.gstin);
  return (
    <div className="view-in acc acc-d" ref={root}>
      <a className="btn-q acc-back" href="#accounts"><Icon n="back" />Accounts</a>
      <header className="acc-mast">
        <Av kind="brand" name={b.name} cls="acc-av" />
        <div className="acc-mast-t"><p className="acc-kind acc-kind--b"><i className="dot"></i>{`Brand${b.city && b.city !== '—' ? ' · ' + b.city : ''} · joined ${L.fmtDate(b.joined, { year: true })}`}</p>
          <h1 className="t-h1">{b.name}</h1>
          <p className="acc-mast-m"><span>{b.contact}</span><KycPill k={b.verify} />{v && v.status === 'pending' ? <a className="btn-q" href={`#verify-${v.id}`}>Open verification request</a> : null}</p></div>
        <div className="acc-mast-s"><StPill a={b} /></div>
      </header>
      <dl className="acc-band">
        <div><dt>Posted in 30 days</dt><dd className="t-money">{b.postsLast30}</dd><p>{spike(b) ? 'well above normal' : 'campaigns'}</p></div>
        <div><dt>Open now</dt><dd className="t-money">{b.open}</dd><p>campaigns taking bids</p></div>
        <div><dt>Paid via escrow</dt><dd className="t-money">{L.inr(b.spent)}</dd><p>all time</p></div>
        <div><dt>Reports</dt><dd className="t-money">{b.reports}</dd><p>{`${reps.filter(r => r.status === 'open').length} open in moderation`}</p></div>
      </dl>
      <p className="acc-sample"><span className="sample">Sample figures</span></p>
      <div className="acc-grid">
        <div className="acc-col">
          <section className="acc-sec" aria-labelledby="accPost"><h2 className="t-h2" id="accPost">Campaign posting</h2><PostingChart b={b} /></section>
          <section className="acc-sec" aria-labelledby="accCo"><h2 className="t-h2" id="accCo">Company</h2>
            <dl className="acc-kv">
              <div><dt>Legal name</dt><dd>{b.legal ? b.legal : <None />}</dd></div>
              <div><dt>GSTIN</dt><dd>{b.gstin ? <span className="acc-mono">{b.gstin}</span> : <None />}{b.gstin ? (b.regVerified ? <span className="acc-m is-ok"><Icon n="check" />{'Verified on the GST portal' + (st ? ' · ' + st : '')}</span> : <span className="acc-m is-warn"><Icon n="info" />Not checked yet</span>) : <span className="acc-m is-bad"><Icon n="alert" />No company registration</span>}</dd></div>
              <div><dt>Company PAN</dt><dd>{b.gstin ? <><span className="acc-mono">{mask(b.gstin.slice(2, 12))}</span><span className="acc-m is-ok"><Icon n="check" />Read from the GSTIN</span></> : <None t="—" />}</dd></div>
              <div><dt>Business mail</dt><dd>{b.email}{free ? <span className="acc-m is-bad"><Icon n="alert" />Free mailbox, not a company domain</span> : b.mailVerified ? <span className="acc-m is-ok"><Icon n="check" />Verified by link</span> : <span className="acc-m is-bad"><Icon n="alert" />Not verified</span>}</dd></div>
            </dl>
          </section>
          <section className="acc-sec" aria-labelledby="accCamp"><h2 className="t-h2" id="accCamp">Campaigns</h2>
            {camps.length ? <ul className="acc-reps">{camps.map(k => <li key={k.id}><a href="#marketplace-campaigns"><span className="acc-reps-t"><b>{k.title}</b><span>{`${k.platform === 'youtube' ? 'YouTube' : 'Instagram'} · ${L.inr(k.budget)} · ${k.bids} bids · ${L.ago(k.posted)}`}</span></span>
              {k.flags ? <span className="pill pill-err"><Icon n="alert" />{`${k.flags} flag${k.flags > 1 ? 's' : ''}`}</span> : <span className="pill pill-paper">{k.status === 'live' ? 'Live' : k.status}</span>}</a></li>)}</ul> : <p className="muted">No campaigns posted yet.</p>}
          </section>
        </div>
        <div className="acc-col acc-col--side"><Security kind="brand" a={b} /><History a={b} /></div>
      </div>
    </div>
  );
}

L.register('accounts', { title: 'Accounts', nav: 'accounts', Component: List });
L.register('creator', { title: id => (L.creator(id) || {}).name || 'Creator', nav: 'accounts', Component: ({ param }) => <CreatorView id={param} /> });
L.register('brand', { title: id => (L.brand(id) || {}).name || 'Brand', nav: 'accounts', Component: ({ param }) => <BrandView id={param} /> });
