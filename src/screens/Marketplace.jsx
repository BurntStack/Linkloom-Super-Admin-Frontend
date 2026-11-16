/* Marketplace curation (#marketplace, #marketplace-<tab|campaignId>).
   Tabs: campaigns, bids, reviews, featured, categories. Every admin action goes through a reason sheet, then L.audit(), then "Logged to audit".
   Creators read coral, brands violet. Money is integer paise. */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { data } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { ui, mo, flip, nowISO, time, when, plat, plural, Glyph, Who, CrWho, BrWho, Pill, Stars, reasonSheet, suspend, closeReport, reportFor } from '../lib/mx.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import Select from '../components/Select.jsx';

const S = () => data;

/* ---------- sample context the data file does not carry (admin view only) ---------- */
const BRIEF = {
  k1: { text: 'Launch Reel for our Barrier Repair Serum. Show your evening routine, one honest before and after after 14 days.', del: '1 Reel, 30 to 45 s, plus 3 Stories' },
  k2: { text: 'A night routine for oily skin, 6 to 8 minutes. Our gel moisturiser in one step, your own picks for the rest.', del: '1 YouTube video, integrated mention' },
  k3: { text: 'Make filter coffee at home for Diwali guests. Real kitchen, real steel tumbler, no studio set.', del: '1 Reel and 2 Stories' },
  k4: { text: 'Two nights at our Alibaug property. A travel vlog that shows the drive, the food and the beach at sunrise.', del: '1 YouTube vlog, 10 to 14 min' },
  k5: { text: 'Grow herbs on a balcony with our starter kit and post your day 30 result.', del: '1 Reel and a day 1 Story' },
  k9: { text: 'Join the GlowCash paid creator network! Pay ₹999 registration to unlock ₹50,000 a week, guaranteed. Send payment to glowcash@ybl and DM the screenshot to get approved fast.', del: 'Not stated' },
  k10: { text: 'DM us on WhatsApp +91 98••• ••421 for an instant paid collab. No brief needed, we share details on chat.', del: 'Not stated' }
};
/* bids behind each pattern alert (what the system saw) */
const ALERT_BIDS = {
  ba1: { total: 18, rows: [
    ['c', 'Rahul Verma', 'k1', 1750000, '2026-10-29T23:36:00+05:30', 'Same device as 2 others'],
    ['x', 'Linked account A', 'k1', 1740000, '2026-10-29T23:37:00+05:30', 'Same payout UPI'],
    ['x', 'Linked account B', 'k1', 1760000, '2026-10-29T23:38:00+05:30', 'Same payout UPI'],
    ['c', 'Rahul Verma', 'k3', 1180000, '2026-10-29T23:39:00+05:30', 'Same device as 2 others'],
    ['x', 'Linked account A', 'k3', 1190000, '2026-10-29T23:39:00+05:30', 'Same payout UPI']] },
  ba2: { total: 41, rows: [
    ['x', 'new.creator.2291', 'k9', 5000000, '2026-11-03T12:18:00+05:30', 'Exact budget · pitch copied'],
    ['x', 'glow.girl.real', 'k9', 5000000, '2026-11-03T12:19:00+05:30', 'Exact budget · pitch copied'],
    ['x', 'collab.with.me.88', 'k10', 2500000, '2026-11-03T12:21:00+05:30', 'Exact budget · pitch copied'],
    ['x', 'insta.money.now', 'k9', 5000000, '2026-11-03T12:24:00+05:30', 'Exact budget · pitch copied'],
    ['x', 'riya.official.07', 'k10', 2500000, '2026-11-03T12:29:00+05:30', 'Name close to Riya Thomas']] },
  ba3: { total: 1, rows: [['c', 'Tanvi Shah', 'k1', 700000, '2026-11-03T18:00:00+05:30', '61% under the ₹18,000 budget']] }
};
/* how each risk score is made: signal, points */
const SIGNALS = {
  ba1: [['Same device fingerprint on 3 accounts', 35], ['One payout UPI shared by all 3', 30], ['Bids on the same 6 jobs within 4 minutes', 20], ['2 accounts under a week old', 7]],
  ba2: [['41 bids in 12 minutes', 30], ['Same pitch text, word for word', 25], ['17 accounts made in the last 48 hours', 14], ['Every bid at the exact budget', 12]],
  ba3: [['Bid 61% under the brief’s budget', 18], ['Account is 6 weeks old', 6], ['No completed orders yet', 4]]
};
const PITCH = { ba2: 'Same pitch on all 41: “Hi mam I am intrested pls check DM for collab details”' };

const TABS = [['campaigns', 'Campaigns'], ['bids', 'Bids'], ['reviews', 'Reviews'], ['featured', 'Featured'], ['categories', 'Categories']];
const CST = { live: ['pill-ok', 'eye', 'Live'], hidden: ['pill-line', 'eye', 'Hidden'], removed: ['pill-paper', 'trash', 'Removed'] };
const P3 = ({ m }) => <Pill cls={m[0]} icon={m[1]} label={m[2]} />;
const camp = id => S().campaigns.find(c => c.id === id) || null;
const flagged = c => c.status === 'live' && c.flags > 0;
const openAlerts = () => S().bidAlerts.filter(a => a.status === 'open');
const flaggedReviews = () => S().reviews.filter(r => r.status === 'flagged');

const CampMini = ({ c }) => {
  const b = L.brand(c.brand) || { name: 'Brand' };
  return <div className="mx-mini"><span className="mx-plat"><Glyph p={c.platform} /><span>{`${plat(c.platform)} · ${b.name}`}</span></span>
    <p className="t-money mx-mini-p">{L.inr(c.budget)}</p><p className="t-small muted">{c.title}</p></div>;
};
const ReviewMini = ({ r }) => <div className="mx-mini"><Stars n={r.stars} /><p className="mx-quote">{`“${r.text}”`}</p><p className="t-small muted">{`${r.from} on ${r.to} · ${L.fmtDate(r.at)}`}</p></div>;

function hideCampaign(id, done) {
  const c = camp(id), b = L.brand(c.brand);
  reasonSheet({
    title: 'Hide this campaign?', mini: <CampMini c={c} />, action: 'campaign.hide', target: `Campaign ${c.id} · ${b.name}`, yes: 'Hide campaign', danger: true,
    bullets: ['Creators stop seeing it in Find jobs. The brand sees it as “Hidden by Linkloom”.', `Its ${c.bids} bids are frozen, not declined. You can restore it later.`, 'No money moves. Nothing is in escrow on it.'],
    reasons: c.rule ? [c.rule, 'Under investigation', 'Misleading pay claims'] : ['Under investigation', 'Misleading pay claims', 'Brand not verified'], preset: !!c.rule,
    onYes(reason) { L.store.set(s => { const x = s.campaigns.find(y => y.id === id); x.status = 'hidden'; x.mod = { by: s.me.name, at: nowISO(), reason }; }, 'campaign'); done && done(); }
  });
}
function removeCampaign(id, done) {
  const c = camp(id), b = L.brand(c.brand), r = reportFor(id);
  reasonSheet({
    title: 'Remove this campaign?', mini: <CampMini c={c} />, action: 'campaign.remove', target: `Campaign ${c.id} · ${b.name}`, yes: 'Remove campaign', danger: true,
    bullets: [`It is taken down for good, and the ${c.bids} open bids on it are declined.`, 'Each bidder is told why, in plain words, so nobody pays the brand.', r && r.status === 'open' ? `Report ${r.id} (${plural(r.count, 'report')}) is closed as actioned.` : 'The brand keeps its account. Suspend it from Moderation if needed.'],
    reasons: c.rule ? [c.rule, 'Scam: asks creators to pay', 'Off-platform payment'] : ['Scam: asks creators to pay', 'Off-platform payment', 'Breaks posting rules'], preset: !!c.rule,
    onYes(reason) {
      L.store.set(s => { const x = s.campaigns.find(y => y.id === id); x.status = 'removed'; x.mod = { by: s.me.name, at: nowISO(), reason }; }, 'campaign');
      if (r) closeReport(r.id, 'actioned', 'Campaign removed', reason);
      done && done();
    }
  });
}
function restoreCampaign(id, done) {
  const c = camp(id), b = L.brand(c.brand);
  reasonSheet({
    title: 'Restore this campaign?', mini: <CampMini c={c} />, action: 'campaign.restore', target: `Campaign ${c.id} · ${b.name}`, yes: 'Restore campaign',
    bullets: ['It shows in Find jobs again and its frozen bids come back as they were.'],
    reasons: ['Checked: within the rules', 'Brand fixed the brief'],
    onYes(reason) { L.store.set(s => { const x = s.campaigns.find(y => y.id === id); x.status = 'live'; x.flags = 0; x.mod = { by: s.me.name, at: nowISO(), reason, restored: true }; }, 'campaign'); done && done(); }
  });
}

function briefSheet(id, refresh) {
  const c = camp(id); if (!c) return;
  const b = L.brand(c.brand), br = BRIEF[id] || { text: c.title, del: 'Not stated' }, r = reportFor(id);
  const posts2d = b.postsLast30 >= 8 && b.postsAvg === 0;
  const sig = [
    [b.verify === 'verified', b.verify === 'verified' ? 'Brand verified: GSTIN and company PAN match' : 'Brand not verified: no GSTIN or company PAN'],
    [b.mailVerified && !/gmail|yahoo/.test(b.email), b.mailVerified && !/gmail|yahoo/.test(b.email) ? 'Business mail on its own domain' : `Free mail address, not verified (${b.email})`],
    [!posts2d, posts2d ? `${b.postsLast30} campaigns posted in 2 days, no history before` : `${b.postsLast30} campaigns in 30 days (average ${b.postsAvg})`],
    [!/pay|₹999|upi|whatsapp|dm/i.test(br.text), /pay|₹999|upi|whatsapp|dm/i.test(br.text) ? 'Brief asks for payment or contact off Linkloom' : 'No payment or contact asks in the brief'],
    [c.budget <= 2000000, c.budget <= 2000000 ? 'Budget in the usual range for this format' : `Budget ${L.inr(c.budget)} is far above similar briefs`]
  ];
  const bad = sig.filter(s => !s[0]).length;
  L.openSheet({
    title: 'Campaign brief', wide: true,
    body: (
      <div className="stack mk-brief">
        <div className="row between wrap"><BrWho b={b} /><span className="row mk-pills"><P3 m={CST[c.status]} />{c.flags && c.status === 'live' ? <Pill cls="pill-err" icon="alert" label={plural(c.flags, 'report')} /> : null}</span></div>
        <h3 className="t-h2">{c.title}</h3>
        <dl className="mx-meta"><div><dt>Budget</dt><dd>{L.inr(c.budget)}</dd></div><div><dt>Platform</dt><dd>{plat(c.platform)}</dd></div><div><dt>Bids</dt><dd>{c.bids}</dd></div><div><dt>Posted</dt><dd>{L.fmtDate(c.posted)}</dd></div></dl>
        <div className="mk-brief-txt"><p className="t-eyebrow">The brief, as creators see it</p><p>{br.text}</p><p className="t-small muted">{`Deliverables: ${br.del}`}</p></div>
        <div><p className="t-eyebrow mk-sig-h">Signals <span className="muted">{`· ${bad ? plural(bad, 'concern') : 'nothing unusual'}`}</span></p>
          <ul className="mk-sig">{sig.map(([ok, t], i) => <li className={ok ? 'is-ok' : 'is-bad'} key={i}><Icon n={ok ? 'check' : 'alert'} /><span>{t}</span></li>)}</ul></div>
        {r ? <a className="btn-q" href={`#moderation-${r.id}`}><Icon n="flag" />{`See ${plural(r.count, 'report')} in Moderation`}</a> : null}
        {c.mod ? <p className="mk-modnote"><Icon n="shield" /><span>{`${c.status === 'live' ? 'Restored' : CST[c.status][2]} by ${c.mod.by}, ${when(c.mod.at)}. Reason: ${c.mod.reason}`}</span></p> : null}
        <div className="row wrap">{c.status === 'live' ? <><Lq className="lq-p mx-danger" data-rm="" onClick={() => removeCampaign(id, refresh)}><Icon n="trash" />Remove campaign</Lq><Lq className="lq-s" data-hide="" onClick={() => hideCampaign(id, refresh)}>Hide for now</Lq></> : c.status === 'hidden' ? <><Lq className="lq-p mx-danger" data-rm="" onClick={() => removeCampaign(id, refresh)}><Icon n="trash" />Remove campaign</Lq><Lq className="lq-s" data-restore="" onClick={() => restoreCampaign(id, refresh)}>Restore</Lq></> : null}</div>
      </div>
    )
  });
}

/* ----- tab: campaigns ----- */
const CF = [['all', 'All'], ['flagged', 'Flagged'], ['hidden', 'Hidden'], ['removed', 'Removed']];
const inCF = (c, f) => f === 'all' || (f === 'flagged' && flagged(c)) || c.status === f;
function CampSlip({ c, x }) {
  const b = L.brand(c.brand), f = flagged(c), r = reportFor(c.id);
  const burst = b.postsLast30 >= 8 && b.postsAvg === 0;
  const brief = () => briefSheet(c.id, x.after(`[data-id="${c.id}"]`, 'Campaign updated'));
  const rm = <button className="btn-q mx-q-danger" type="button" data-rm={c.id} onClick={() => removeCampaign(c.id, x.after(`[data-id="${c.id}"]`, 'Campaign removed'))}><Icon n="trash" />Remove</button>;
  return (
    <article className={`mx-slip mk-camp is-${c.status}${f ? ' is-flag' : ''}`} data-id={c.id} aria-labelledby={`mkc-${c.id}`}>
      <div className="mx-stub"><p className="mx-stub-l">Budget</p><p className="mx-price t-money">{L.inr(c.budget)}</p><p className="mx-stub-d">{`Posted ${L.fmtDate(c.posted)}`}</p></div>
      <div className="mx-body">
        <div className="mx-top"><BrWho b={b} /><span className="row mk-pills">{f ? <Pill cls="pill-err" icon="alert" label={plural(c.flags, 'report')} /> : null}<P3 m={CST[c.status]} /></span></div>
        <h3 className="mx-t" id={`mkc-${c.id}`}><button type="button" data-brief={c.id} onClick={brief}>{c.title}</button></h3>
        <dl className="mx-meta"><div><dt>Platform</dt><dd><span className="mx-plat-i"><Glyph p={c.platform} /></span>{plat(c.platform)}</dd></div><div><dt>Bids</dt><dd>{c.bids}</dd></div>
          <div className={burst ? 'is-bad' : ''}><dt>Brand posts</dt><dd>{burst ? `${b.postsLast30} in 2 days` : `${b.postsLast30} in 30 days`}</dd></div></dl>
        {c.rule && c.status === 'live' ? <p className="mx-rule"><Icon n="alert" /><span>{`Breaks the rules: ${c.rule}`}</span></p> : null}
        {c.mod ? <p className="mx-note">{`${c.status === 'live' ? 'Restored' : CST[c.status][2]} by ${c.mod.by} · ${c.mod.reason}`}</p> : null}
        <div className="mx-acts">
          <Lq className={`${f ? 'lq-p' : 'lq-s'} lq-sm`} data-brief={c.id} onClick={brief}>Inspect brief</Lq>
          {c.status === 'live' ? <><button className="btn-q" type="button" data-hide={c.id} onClick={() => hideCampaign(c.id, x.after(`[data-id="${c.id}"]`, 'Campaign hidden'))}><Icon n="eye" />Hide</button>{rm}</> : null}
          {c.status === 'hidden' ? <><button className="btn-q" type="button" data-restore={c.id} onClick={() => restoreCampaign(c.id, x.after(`[data-id="${c.id}"]`, 'Campaign restored'))}>Restore</button>{rm}</> : null}
          {r && r.status === 'open' ? <a className="btn-q" href={`#moderation-${r.id}`}><Icon n="flag" />{`Report ${r.id}`}</a> : null}
        </div>
      </div></article>
  );
}
function TabCampaigns({ u, x }) {
  const all = S().campaigns, list = all.filter(c => inCF(c, u.cf || 'all'));
  const order = (a, b) => (flagged(b) - flagged(a)) || b.flags - a.flags || String(b.posted).localeCompare(String(a.posted));
  const groups = [['Needs a decision', c => flagged(c)], ['Live', c => c.status === 'live' && !flagged(c)], ['Hidden or removed', c => c.status !== 'live']];
  const setCf = k => () => { u.cf = k; x.refresh(`Showing ${k} campaigns`); const f = x.$(`[data-cf="${k}"]`); f && f.focus(); };
  return (
    <>
      <div className="chips mx-filter" role="group" aria-label="Filter campaigns">{CF.map(([k, n]) => <button className="chip" type="button" data-cf={k} aria-pressed={(u.cf || 'all') === k} key={k} onClick={setCf(k)}>{n + ' '}<span className="mx-cn">{all.filter(c => inCF(c, k)).length}</span></button>)}</div>
      <div className="mx-board">{list.length
        ? groups.map(([t, has], i) => { const rows = list.filter(has).sort(order); return rows.length ? <section className="mx-group" aria-labelledby={`mkg${i}`} key={i}><h2 className="mx-gh" id={`mkg${i}`}><span className="t-h3">{t}</span><span className="mx-gn num">{rows.length}</span></h2><div className="mx-list">{rows.map(c => <CampSlip c={c} x={x} key={c.id} />)}</div></section> : null; })
        : <div className="empty"><p className="t-h2">Nothing here.</p><p className="muted">No campaigns match this filter.</p><Lq className="lq-s" data-cf="all" onClick={setCf('all')}>Show all campaigns</Lq></div>}</div>
    </>
  );
}

/* ----- tab: bids ----- */
const level = r => (r >= 70 ? ['high', 'High risk'] : r >= 40 ? ['mid', 'Medium risk'] : ['low', 'Low risk']);
const AST = { open: ['pill-warn', 'clock', 'Needs review'], actioned: ['pill-ok', 'check', 'Actioned'], dismissed: ['pill-paper', '', 'Dismissed'] };
function alertAction(kind, id, done) {
  const a = S().bidAlerts.find(x => x.id === id), named = a.accounts.map(L.creator).filter(Boolean);
  const mini = <div className="mx-mini"><p className="t-eyebrow">{`${a.pattern} · risk ${a.risk}/100`}</p><p className="t-small">{a.detail}</p></div>;
  const set = patch => L.store.set(s => Object.assign(s.bidAlerts.find(x => x.id === id), patch), 'bids');
  const n = a.id === 'ba2' ? 17 : a.accounts.length;
  if (kind === 'susp') reasonSheet({
    title: `Suspend ${plural(n, 'account')}?`, mini, danger: true, yes: `Suspend ${plural(n, 'account')}`, action: 'account.suspend', target: `${a.pattern} (${a.id}) · ${plural(n, 'account')}`,
    bullets: ['They are signed out and can’t bid, message or withdraw.', 'Their open bids are withdrawn and brands are told the bid is no longer available.', 'Money already in escrow stays put until an admin decides each order.'],
    reasons: a.id === 'ba2' ? ['Bid flooding with copied pitches', 'Fake accounts', 'Bid ring: linked accounts'] : ['Bid ring: linked accounts', 'Fake accounts', 'Bid flooding with copied pitches'], preset: true,
    onYes(r) { named.forEach(c => suspend('c', c.id, r)); set({ status: 'actioned', outcome: `${plural(n, 'account')} suspended by ${S().me.name} · ${r}` }); done(); }
  });
  if (kind === 'freeze') reasonSheet({
    title: 'Freeze these bids?', mini, yes: 'Freeze bids', action: 'bids.freeze', target: `${a.pattern} (${a.id}) · ${ALERT_BIDS[id].total} bids`,
    bullets: ['Brands stop seeing these bids until you decide. The accounts can still sign in.', 'Nothing is declined yet, so you can still clear them.'],
    reasons: ['Hold while we investigate', 'Protect brands from spam bids'], preset: true,
    onYes() { set({ frozen: true }); done(); }
  });
  if (kind === 'warn') reasonSheet({
    title: `Warn ${named[0].name}?`, mini, yes: 'Send warning', action: 'account.warn', target: `${named[0].name} (${named[0].id})`,
    bullets: [`${named[0].name.split(' ')[0]} gets a plain note in their inbox about fair pricing. The bid stays live.`, 'A warning shows on their account for other admins.'],
    reasons: ['Pricing far under budget', 'Repeated lowball bids'],
    onYes(r) { set({ status: 'actioned', outcome: `Warned by ${S().me.name} · ${r}` }); done(); }
  });
  if (kind === 'dis') reasonSheet({
    title: 'Dismiss this alert?', mini, yes: 'Dismiss alert', action: 'bids.dismiss', target: `${a.pattern} (${a.id})`,
    bullets: ['The alert closes and the bids carry on as normal.', 'The system keeps watching these accounts.'],
    reasons: ['Within the platform rules', 'False match: different people', 'Already handled elsewhere'],
    onYes(r) { set({ status: 'dismissed', frozen: false, outcome: `Dismissed by ${S().me.name} · ${r}` }); done(); }
  });
}
function AlertCard({ a, u, x }) {
  const [lv, lvT] = level(a.risk), st = AST[a.status] || AST.open, sig = SIGNALS[a.id] || [], bids = ALERT_BIDS[a.id] || { total: 0, rows: [] };
  const open = !!(u.openBids || {})[a.id];
  const named = a.accounts.map(L.creator).filter(Boolean);
  const go = (kind, msg) => () => alertAction(kind, a.id, x.after(`[data-id="${a.id}"]`, msg));
  const toggle = () => {
    u.openBids = u.openBids || {}; u.openBids[a.id] = !u.openBids[a.id]; x.refresh('', false);
    const n = x.$(`[data-abids="${a.id}"]`); n && n.focus(); const tb = x.$('#mkb-' + a.id); tb && !tb.hidden && mo('reveal', tb);
  };
  const acts = [];
  if (a.status === 'open') {
    if (a.risk >= 40) acts.push(<Lq className="lq-p lq-sm mx-danger" data-asusp={a.id} key="s" onClick={go('susp', 'Accounts suspended')}>Suspend accounts</Lq>);
    else if (named.length) acts.push(<Lq className="lq-s lq-sm" data-awarn={a.id} key="w" onClick={go('warn', 'Warning sent')}>{`Warn ${named[0].name.split(' ')[0]}`}</Lq>);
    if (!a.frozen && a.risk >= 40) acts.push(<Lq className="lq-s lq-sm" data-afreeze={a.id} key="f" onClick={go('freeze', 'Bids frozen')}><Icon n="lock" />Freeze these bids</Lq>);
    acts.push(<button className="btn-q" type="button" data-adis={a.id} key="d" onClick={go('dis', 'Alert dismissed')}>Dismiss</button>);
  }
  return (
    <article className={`mk-alert is-${lv} is-${a.status}`} data-id={a.id} aria-labelledby={`mka-${a.id}`}>
      <div className="mk-risk">
        <p className="mx-stub-l">Risk score</p>
        <p className="mk-risk-n"><span className="t-money">{a.risk}</span><span className="muted">/100</span></p>
        <span className="mk-meter" aria-hidden="true"><span style={{ width: a.risk + '%' }}></span></span>
        <p className="mk-risk-l">{lvT}</p>
        <ul className="mk-why" aria-label="How the score is made">{sig.map(([t, p]) => <li key={t}><span>{t}</span><b className="num">{`+${p}`}</b></li>)}</ul>
      </div>
      <div className="mx-body">
        <div className="mx-top"><p className="t-eyebrow">{`${a.pattern} · ${L.ago(a.at)}`}</p><span className="row mk-pills">{a.frozen && a.status === 'open' ? <Pill cls="pill-escrow" icon="lock" label="Bids frozen" /> : null}<P3 m={st} /></span></div>
        <h3 className="mx-t" id={`mka-${a.id}`}>{a.detail}</h3>
        {PITCH[a.id] ? <p className="mx-quote">{PITCH[a.id]}</p> : null}
        <div className="mk-accts"><p className="mx-stub-l">Accounts</p><div className="mk-accts-l">{a.accounts.map(k => { const c = L.creator(k); return c ? <CrWho c={c} sub={c.status === 'suspended' ? 'Suspended' : c.handle} key={k} /> : <span className="mx-who is-x" key={k}><span className="avatar mx-av is-x" aria-hidden="true"><Icon n="users" /></span><span className="mx-who-t"><b>{k}</b></span></span>; })}</div></div>
        <button className="btn-q mk-bt" type="button" data-abids={a.id} aria-expanded={open} aria-controls={`mkb-${a.id}`} onClick={toggle}><Icon n={open ? 'minus' : 'plus'} />{open ? 'Hide the bids' : `See the bids (${bids.total})`}</button>
        <div className="mk-bids" id={`mkb-${a.id}`} hidden={!open}>
          <table className="mk-tbl"><caption className="sr-only">{`Bids behind ${a.pattern}`}</caption><thead><tr><th scope="col">Account</th><th scope="col">Campaign</th><th scope="col" className="r">Bid</th><th scope="col">When</th><th scope="col">Why it stands out</th></tr></thead>
            <tbody>{bids.rows.map(([k, n, cid, amt, at, why], i) => { const c = camp(cid); return <tr key={i}><td><span className={`mk-acc is-${k}`}>{n}</span></td><td>{c ? c.title : cid}</td><td className="r num">{L.inr(amt)}</td><td className="num">{time(at)}</td><td className="muted">{why}</td></tr>; })}</tbody></table>
          {bids.total > bids.rows.length ? <p className="t-small muted">{`and ${bids.total - bids.rows.length} more like these`}</p> : null}
        </div>
        {a.outcome ? <p className="mx-note">{a.outcome}</p> : null}
        {acts.length ? <div className="mx-acts">{acts}</div> : null}
      </div></article>
  );
}
function TabBids({ u, x }) {
  const all = S().bidAlerts.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.risk - a.risk);
  const live = S().campaigns.filter(c => c.status === 'live').reduce((n, c) => n + c.bids, 0);
  return (
    <>
      <p className="mk-lede">{`${plural(openAlerts().length, 'pattern')} to review across ${live} bids on live campaigns. Scores add up the signals listed under each one.`}</p>
      <div className="mx-list">{all.map(a => <AlertCard a={a} u={u} x={x} key={a.id} />)}</div>
    </>
  );
}

/* ----- tab: reviews ----- */
const RF = [['all', 'All'], ['flagged', 'Flagged'], ['removed', 'Deleted']];
const RST = { visible: ['pill-ok', 'eye', 'Visible'], flagged: ['pill-warn', 'flag', 'Flagged'], removed: ['pill-paper', 'trash', 'Deleted'] };
function reviewAction(kind, id, done) {
  const r = S().reviews.find(x => x.id === id), rep = reportFor(id);
  const set = (status, reason) => L.store.set(s => { const x = s.reviews.find(y => y.id === id); x.status = status; x.mod = { by: s.me.name, at: nowISO(), reason }; }, 'review');
  if (kind === 'del') reasonSheet({
    title: 'Delete this review?', mini: <ReviewMini r={r} />, danger: true, yes: 'Delete review', action: 'review.delete', target: `Review ${r.id} · ${r.from} on ${r.to}`,
    bullets: [`It comes off ${r.to}’s profile and their rating is worked out again without it.`, 'The reviewer is told it broke the review rules.', rep && rep.status === 'open' ? `Report ${rep.id} is closed as actioned.` : 'This can’t be undone.'],
    reasons: r.order ? ['Abusive language', 'Personal details shared'] : ['Fake review: no order between them', 'Abusive language', 'Posted by a competitor'], preset: !r.order,
    onYes(reason) { set('removed', reason); if (rep) closeReport(rep.id, 'actioned', 'Review deleted', reason); done(); }
  });
  if (kind === 'keep') reasonSheet({
    title: 'Keep this review?', mini: <ReviewMini r={r} />, yes: 'Keep review', action: 'review.keep', target: `Review ${r.id} · ${r.from} on ${r.to}`,
    bullets: ['The flag clears and the review stays on the profile.'],
    reasons: ['Honest, if harsh', 'Matches the order history'],
    onYes(reason) { set('visible', reason); if (rep) closeReport(rep.id, 'dismissed', 'Review kept', reason); done(); }
  });
}
function ReviewCard({ r, x }) {
  const c = S().creators.find(y => y.name === r.to), b = S().brands.find(y => y.name === r.from), o = r.order && S().orders.find(y => y.id === r.order);
  const del = () => reviewAction('del', r.id, x.after(`[data-id="${r.id}"]`, 'Review deleted'));
  return (
    <article className={`mk-rev is-${r.status}`} data-id={r.id}>
      <div className="mk-rev-h"><span className="row mk-rev-ppl">{b ? <BrWho b={b} sub="Brand" /> : <Who kind="x" name={r.from} sub="Not linked to a verified brand" />}<span className="mk-arrow" aria-hidden="true"><Icon n="arrow" /></span>{c ? <CrWho c={c} sub="Creator" /> : <Who kind="c" name={r.to} />}</span><span className="row mk-pills"><P3 m={RST[r.status]} /></span></div>
      <div className="row mk-rev-s"><Stars n={r.stars} /><span className="t-small muted">{L.fmtDate(r.at, { year: true })}</span></div>
      <p className="mk-rev-t">{`“${r.text}”`}</p>
      {o ? <p className="mk-rev-o"><Icon n="check" /><span>{`Order ${o.id} · ${o.title} · ${o.phase === 'released' ? 'paid out' : o.phase}`}</span></p> : <p className="mx-rule"><Icon n="alert" /><span>No order between them. Reviews need a completed order.</span></p>}
      {r.mod ? <p className="mx-note">{`${r.status === 'removed' ? 'Deleted' : 'Kept'} by ${r.mod.by} · ${r.mod.reason}`}</p> : null}
      {r.status !== 'removed' ? <div className="mx-acts">{r.status === 'flagged'
        ? <><Lq className="lq-p lq-sm mx-danger" data-rdel={r.id} onClick={del}><Icon n="trash" />Delete review</Lq><Lq className="lq-s lq-sm" data-rkeep={r.id} onClick={() => reviewAction('keep', r.id, x.after(`[data-id="${r.id}"]`, 'Review kept'))}>Keep it</Lq></>
        : <button className="btn-q mx-q-danger" type="button" data-rdel={r.id} onClick={del}><Icon n="trash" />Delete</button>}</div> : null}
    </article>
  );
}
function TabReviews({ u, x }) {
  const all = S().reviews, f = u.rf || 'all', list = all.filter(r => f === 'all' || r.status === f).sort((a, b) => (b.status === 'flagged') - (a.status === 'flagged') || b.at.localeCompare(a.at));
  const setRf = k => () => { u.rf = k; x.refresh(`Showing ${k} reviews`); const n = x.$(`[data-rf="${k}"]`); n && n.focus(); };
  return (
    <>
      <div className="chips mx-filter" role="group" aria-label="Filter reviews">{RF.map(([k, n]) => <button className="chip" type="button" data-rf={k} aria-pressed={f === k} key={k} onClick={setRf(k)}>{n + ' '}<span className="mx-cn">{all.filter(r => k === 'all' || r.status === k).length}</span></button>)}</div>
      {list.length ? <div className="mk-revs">{list.map(r => <ReviewCard r={r} x={x} key={r.id} />)}</div> : <div className="empty"><p className="t-h2">No reviews here.</p><p className="muted">Flagged and deleted reviews show up in their own filters.</p></div>}
    </>
  );
}

/* ----- tab: featured creators ----- */
const featOrder = () => {
  const u = ui('marketplace'), ids = S().creators.filter(c => c.featured && c.status === 'active').map(c => c.id);
  if (!u.feat) u.feat = ids.slice();
  u.feat = u.feat.filter(id => ids.includes(id)).concat(ids.filter(id => !u.feat.includes(id)));
  return u.feat;
};
function TabFeatured({ u, x }) {
  const ord = u.draft || featOrder(), dirty = !!u.draft;
  const pool = S().creators.filter(c => !c.featured && c.status === 'active' && c.kyc === 'verified' && (c.rating || 0) >= 4.4).sort((a, b) => b.rating - a.rating);
  const move = (i, up) => () => {
    const o = (u.draft || featOrder()).slice(), j = up ? i - 1 : i + 1;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]]; u.draft = o.join() === featOrder().join() ? null : o;
    x.refresh(`${L.creator(o[j]).name} moved to number ${j + 1}`);
    const n = x.$(`.mk-feat[data-id="${o[j]}"] [data-${up ? 'up' : 'dn'}]`); (n && !n.disabled ? n : x.$(`.mk-feat[data-id="${o[j]}"] .btn-q`)).focus();
  };
  const save = () => { const o = u.draft; u.feat = o; u.draft = null; L.audit('featured.reorder', 'Featured creators', o.map((id, i) => `${i + 1}. ${L.creator(id).name}`).join(', ')); L.toast('Logged to audit', 'check'); x.refresh('Order saved'); };
  const undo = () => { u.draft = null; x.refresh('Order change undone'); };
  const feature = (id, on) => () => {
    const c = L.creator(id);
    L.store.set(s => { s.creators.find(y => y.id === id).featured = on; }, 'featured');
    if (on) { u.feat = featOrder().filter(y => y !== id).concat(id); }
    if (u.draft) u.draft = on ? u.draft.concat(id) : u.draft.filter(y => y !== id);
    L.audit(on ? 'creator.feature' : 'creator.unfeature', `${c.name} (${c.id})`, on ? `Added at number ${featOrder().length}` : 'Removed from Discover');
    L.toast('Logged to audit', 'check'); x.refresh(on ? `${c.name} featured` : `${c.name} unfeatured`);
    const n = x.$(`.mk-feat[data-id="${id}"]`); n && mo('fresh', n);
  };
  return (
    <div className="mk-feat-g">
      <section className="stack" aria-labelledby="mkfh"><div className="row between wrap"><h2 className="t-h3" id="mkfh">On Discover, in this order</h2><span className="t-small muted">Brands see the first three on their home</span></div>
        <ol className="mk-feats">{ord.map((id, i) => { const c = L.creator(id); return (
          <li className="mk-feat" data-id={c.id} key={c.id}>
            <span className="mk-rank t-money num" aria-hidden="true">{i + 1}</span>
            <div className="mk-feat-w"><CrWho c={c} /><span className="row mk-feat-b">{c.badges.map(b => <Pill cls="pill-line" icon="verified" label={b} key={b} />)}</span></div>
            <dl className="mk-feat-s"><div><dt>Followers</dt><dd className="num">{L.compact(c.followers)}</dd></div><div><dt>Rating</dt><dd className="num">{c.rating ? c.rating.toFixed(1) : '—'}</dd></div><div><dt>Jobs</dt><dd className="num">{c.jobs}</dd></div></dl>
            <span className="row mk-feat-c">
              <button className="ibtn" type="button" data-up={i} aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={move(i, true)}><Icon n="down" /></button>
              <button className="ibtn" type="button" data-dn={i} aria-label={`Move ${c.name} down`} disabled={i === ord.length - 1} onClick={move(i, false)}><Icon n="down" /></button>
              <button className="btn-q" type="button" data-unfeat={c.id} onClick={feature(c.id, false)}>Unfeature</button></span></li>); })}</ol>
        {dirty ? <div className="mk-save" role="status"><span>Order changed. Brands see it once you save.</span><span className="row"><Lq className="lq-p lq-sm" data-fsave="" onClick={save}>Save order</Lq><button className="btn-q" type="button" data-fundo="" onClick={undo}>Undo</button></span></div> : null}
      </section>
      <aside className="stack mk-pool" aria-labelledby="mkph"><h2 className="t-h3" id="mkph">Could be featured</h2><p className="t-small muted">Verified, active, rated 4.4 or more.</p>
        {pool.length ? <ul className="stack">{pool.map(c => <li className="mk-pool-r" key={c.id}><CrWho c={c} sub={`${L.compact(c.followers)} · ${c.rating.toFixed(1)} rating`} /><Lq className="lq-s lq-sm" data-feat={c.id} onClick={feature(c.id, true)}><Icon n="plus" />Feature</Lq></li>)}</ul> : <p className="muted">Everyone who qualifies is featured.</p>}
      </aside></div>
  );
}

/* ----- tab: categories ----- */
const tagCount = n => S().creators.filter(c => c.tags.includes(n)).length;
function CatForm({ kind, name, done, close }) {
  const others = S().categories.filter(x => x !== name), k = tagCount(name);
  const form = useRef(null);
  const [err, setErr] = useState('');
  const submit = e => {
    e.preventDefault();
    if (kind === 'ren') {
      const v = form.current.querySelector('#mkCn').value.trim().replace(/\s+/g, ' ');
      const m = !v ? 'Give it a name.' : v === name ? 'That is the same name.' : others.some(o => o.toLowerCase() === v.toLowerCase()) ? `${v} already exists. Merge into it instead.` : '';
      if (m) { setErr(m); return; }
      L.store.set(s => { s.categories = s.categories.map(x => (x === name ? v : x)); s.creators.forEach(c => { c.tags = c.tags.map(t => (t === name ? v : t)); }); }, 'cats');
      L.audit('category.rename', 'Category ' + name, `${name} → ${v}`); ui('marketplace').freshCat = v;
    } else {
      const to = form.current.querySelector('#mkCm').value;
      L.store.set(s => { s.categories = s.categories.filter(x => x !== name); s.creators.forEach(c => { if (c.tags.includes(name)) c.tags = [...new Set(c.tags.map(t => (t === name ? to : t)))]; }); }, 'cats');
      L.audit('category.merge', 'Category ' + name, `${name} merged into ${to}, ${plural(k, 'creator')} moved`); ui('marketplace').freshCat = to;
    }
    close(); L.toast('Logged to audit', 'check'); done();
  };
  return (
    <form className="stack mx-sheet" noValidate ref={form} onSubmit={submit}>
      {kind === 'ren' ? <div className="field"><label htmlFor="mkCn">New name</label><input className="input" id="mkCn" maxLength={28} defaultValue={name} autoComplete="off" /></div>
        : <div className="field"><label htmlFor="mkCm">Merge into</label><Select id="mkCm">{others.map(o => <option key={o}>{o}</option>)}</Select></div>}
      <ul className="mx-conseq"><li>{kind === 'ren' ? (k ? plural(k, 'creator') + ' tagged ' + name + ' keep the tag under its new name.' : 'No creators use it yet.') : `${k ? plural(k, 'creator') + ' move' + (k === 1 ? 's' : '') + ' to the category you pick.' : 'No creators use it, so nothing moves.'} ${name} is then removed.`}</li><li>Creators and brands see the change on their next search.</li></ul>
      <p className="err" id="mkCe" role="alert" hidden={!err}>{err}</p>
      <p className="mx-logged"><Icon n="shield" /><span>Logged as <code>{`category.${kind === 'ren' ? 'rename' : 'merge'}`}</code>{` by ${S().me.name}.`}</span></p>
      <div className="row wrap"><Lq type="submit" className="lq-p">{kind === 'ren' ? 'Rename' : 'Merge categories'}</Lq><Lq className="lq-s" data-no="" onClick={() => close()}>Cancel</Lq></div></form>
  );
}
const catSheet = (kind, name, done) => L.openSheet({ title: kind === 'ren' ? `Rename ${name}` : `Merge ${name}`, body: o => <CatForm kind={kind} name={name} done={done} close={o.close} /> });
function TabCategories({ u, x }) {
  const cats = S().categories;
  const inp = useRef(null);
  const [err, setErr] = useState('');
  const add = e => {
    e.preventDefault();
    const v = inp.current.value.trim().replace(/\s+/g, ' ');
    const m = !v ? 'Type a name first.' : v.length < 3 ? 'Use at least 3 letters.' : S().categories.some(c => c.toLowerCase() === v.toLowerCase()) ? `${v} already exists.` : '';
    if (m) { flushSync(() => setErr(m)); mo('shake', inp.current); inp.current.focus(); return; }
    L.store.set(s => { s.categories = [...s.categories, v]; }, 'cats'); u.freshCat = v;
    L.audit('category.add', 'Category ' + v, 'New category for creators and briefs'); L.toast('Logged to audit', 'check');
    x.refresh(`${v} added`); const n = x.$('.mk-cat.is-fresh'); n && mo('fresh', n); x.$('#mkCat').focus();
  };
  return (
    <>
      <form className="mk-catadd" noValidate onSubmit={add}><div className={'field' + (err ? ' is-err' : '')}><label htmlFor="mkCat">New category</label><input className="input" id="mkCat" maxLength={28} autoComplete="off" placeholder="For example, Parenting" ref={inp} onInput={() => setErr('')} /></div>
        <Lq type="submit" className="lq-p"><Icon n="plus" />Add</Lq><p className="err" id="mkCatErr" role="alert" hidden={!err}>{err}</p></form>
      <ul className="mk-cats">{cats.map(n => { const k = tagCount(n); return (
        <li className={'mk-cat' + (u.freshCat === n ? ' is-fresh' : '')} key={n}><span className="mk-cat-n">{n}</span><span className="t-small muted num">{k ? plural(k, 'creator') : 'No creators yet'}</span>
          <span className="row mk-cat-a"><button className="btn-q" type="button" data-ren={n} onClick={() => catSheet('ren', n, () => x.refresh('Category renamed'))}><Icon n="edit" />Rename</button><button className="btn-q" type="button" data-merge={n} onClick={() => catSheet('merge', n, () => x.refresh('Categories merged'))}>Merge</button></span></li>); })}</ul>
    </>
  );
}

const PANES = { campaigns: TabCampaigns, bids: TabBids, reviews: TabReviews, featured: TabFeatured, categories: TabCategories };
const ROWS = '.mx-slip,.mk-alert,.mk-rev,.mk-feat,.mk-cat';

function Marketplace({ param }) {
  const root = useRef(null), live = useRef(null), tick = useRef(0);
  const rerender = useRerender();
  const u = ui('marketplace');
  let tab = TABS.some(t => t[0] === param) ? param : 'campaigns', openBrief = null;
  if (param && camp(param)) { tab = 'campaigns'; openBrief = param; }

  const $ = q => root.current.querySelector(q);
  /* refresh: the pane is drawn afresh (new elements), and rows glide from where they were */
  const refresh = (msg, animate = true) => {
    const m = () => { tick.current++; flushSync(rerender); };
    animate ? flip(m, () => L.$$(ROWS, root.current)) : m();
    if (msg) live.current.textContent = msg;
  };
  const after = (sel, msg) => () => { refresh(msg); const n = sel && $(sel); n && mo('fresh', n); };
  const x = { refresh, after, $ };

  useLayoutEffect(() => { mo('stagger', L.$$(ROWS, root.current)); }, []);
  useEffect(() => {
    let raf = 0;
    if (openBrief) raf = requestAnimationFrame(() => briefSheet(openBrief, after(`[data-id="${openBrief}"]`, 'Campaign updated')));
    return () => { cancelAnimationFrame(raf); u.freshCat = null; };
  }, []);

  const a = S().campaigns.filter(flagged).length, b = openAlerts().length, r = flaggedReviews().length;
  const summary = a + b + r ? `${plural(a, 'flagged campaign')}, ${plural(b, 'bid pattern')} and ${plural(r, 'flagged review')} need a decision.` : 'Nothing waiting. The marketplace is clean right now.';
  const counts = { campaigns: a, bids: b, reviews: r };
  const Pane = PANES[tab];
  return (
    <div className="view-in mk" ref={root}>
      <header className="mx-head"><div className="mx-head-t"><h1 className="t-h1">Marketplace</h1><p className="muted" id="mkSum">{summary + ' '}<span className="sample">Sample data</span></p></div></header>
      <nav className="chips mx-filter mk-tabs" aria-label="Marketplace sections">{TABS.map(([k, n]) => <a className="chip mk-tab" href={`#marketplace-${k}`} aria-current={k === tab ? 'page' : undefined} key={k}>{n}{counts[k] ? <> <span className="mx-cn is-hot">{counts[k]}</span></> : null}</a>)}</nav>
      <p className="sr-only" id="mkLive" aria-live="polite" ref={live}></p>
      <div className="mk-pane no-anchor" id="mkPane"><Fragment key={tick.current}><Pane u={u} x={x} /></Fragment></div>
    </div>
  );
}

L.register('marketplace', {
  title: p => (p && TABS.find(t => t[0] === p) ? TABS.find(t => t[0] === p)[1] + ' · Marketplace' : 'Marketplace'), nav: 'marketplace',
  Component: Marketplace
});
