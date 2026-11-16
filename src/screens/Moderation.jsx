/* Moderation (#moderation, #moderation-<reportId>). Reported profiles, messages, content, reviews and campaigns.
   Severity, count, excerpt and context, then Remove / Warn / Suspend account / Dismiss: each takes a reason (reasonSheet in lib/mx.jsx) and is logged. */
import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { data } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { ui, mo, flip, nowISO, time, when, plural, Who, CrWho, BrWho, Pill, Sev, Stars, reasonSheet, suspend, closeReport } from '../lib/mx.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';

const S = () => data;

const TYPES = { profile: ['Profile', 'user', 'Profiles'], message: ['Message', 'chat', 'Messages'], content: ['Content', 'file', 'Content'], review: ['Review', 'star', 'Reviews'], campaign: ['Campaign', 'brief', 'Campaigns'] };
const RST = { open: ['pill-warn', 'clock', 'Open'], actioned: ['pill-ok', 'check', 'Actioned'], dismissed: ['pill-paper', '', 'Dismissed'] };
const SEVN = { high: 0, medium: 1, low: 2 };
/* context the data file does not carry: who the report is about, who reported it, what surrounds it (sample) */
const CTX = {
  r1: { acct: ['b', 'b6'], reporters: [['Riya Thomas', '2026-11-04T08:12:00+05:30'], ['Tanvi Shah', '2026-11-03T19:02:00+05:30'], ['Ishita Banerjee', '2026-11-03T14:40:00+05:30'], ['Dev Malhotra', '2026-11-02T21:15:00+05:30']] },
  r2: { acct: ['b', 'b6'], reporters: [['Tanvi Shah', '2026-11-03T21:40:00+05:30']],
    thread: [['b', '2026-11-03T21:31:00+05:30', 'Hi Tanvi, loved your profile. We have a paid collab for you this week.'], ['c', '2026-11-03T21:33:00+05:30', 'Thanks! Is this the brief on Linkloom?'],
      ['b', '2026-11-03T21:36:00+05:30', 'Pay outside Linkloom to my UPI glowcash@ybl and get 2x', true], ['c', '2026-11-03T21:39:00+05:30', 'I will only work through Linkloom escrow.']] },
  r3: { acct: ['c', 'cr11'], reporters: [['System · bid-pattern check', '2026-10-29T23:40:00+05:30'], ['System · device match', '2026-10-29T23:48:00+05:30'], ['System · payout UPI match', '2026-10-29T23:55:00+05:30']], alert: 'ba1' },
  r4: { acct: ['x', 'Brand user 2291'], reporters: [['Meher Gill', '2026-11-02T15:00:00+05:30']] },
  r5: { acct: ['c', 'cr7'], reporters: [['Roz Fit', '2026-09-10T11:00:00+05:30']], file: ['SPF_runtest_final.mp4', '48 s · uploaded 9 Sep', 'Caption: “This SPF cures acne in 3 days, tested on my run.”'] }
};
const REMOVE = { campaign: 'Remove campaign', message: 'Remove message', content: 'Remove file', review: 'Delete review', profile: 'Hide profile' };
const DONE = { campaign: 'Campaign removed', message: 'Message removed', content: 'File removed', review: 'Review deleted', profile: 'Profile hidden' };
const rep = id => S().reports.find(r => r.id === id) || null;
const acctOf = r => {
  const c = (CTX[r.id] || {}).acct; if (!c) return null;
  if (c[0] === 'b') { const b = L.brand(c[1]); return b && { kind: 'b', id: b.id, name: b.name, rec: b }; }
  if (c[0] === 'c') { const k = L.creator(c[1]); return k && { kind: 'c', id: k.id, name: k.name, rec: k }; }
  return { kind: 'x', id: null, name: c[1], rec: null };
};
const personKind = n => (S().creators.some(c => c.name === n) ? 'c' : S().brands.some(b => b.name === n) ? 'b' : /^System/.test(n) ? 's' : 'x');
const TypeTag = ({ r }) => { const t = TYPES[r.type] || TYPES.content; return <span className="md-type"><Icon n={t[1]} />{t[0]}</span>; };
const StPill = ({ r }) => { const m = RST[r.status] || RST.open; return <Pill cls={m[0]} icon={m[1]} label={m[2]} />; };

const ReportMini = ({ r }) => <div className="mx-mini"><p className="row md-mini-h"><TypeTag r={r} /><span className="t-small muted">{`${r.id} · ${plural(r.count, 'report')}`}</span></p><p className="t-label">{r.target}</p>{r.excerpt ? <p className="mx-quote">{`“${r.excerpt}”`}</p> : <p className="t-small muted">{r.reason}</p>}</div>;

function act(kind, id, done) {
  const r = rep(id), a = acctOf(r), tgt = `Report ${r.id} · ${a ? a.name : r.target}`;
  const mini = <ReportMini r={r} />;
  const fin = (status, label, reason) => closeReport(r.id, status, label, reason);
  if (kind === 'remove') reasonSheet({
    title: REMOVE[r.type] + '?', mini, danger: true, yes: REMOVE[r.type], action: 'report.remove', target: tgt, preset: true,
    bullets: {
      campaign: ['The campaign comes down for good and its open bids are declined.', 'Every bidder is told it was a scam, so nobody pays the brand.'],
      message: ['The message is replaced with “Removed by Linkloom” for both sides.', 'The rest of the chat stays, so the creator keeps their record.'],
      content: ['The file comes off the delivery. The order stays open so the creator can upload again.', 'No money moves.'],
      review: ['It comes off the profile and the rating is worked out again without it.'],
      profile: ['The profile is hidden from search and Discover. The account can still sign in.']
    }[r.type].concat('The person who reported it is told it was actioned.'),
    reasons: [r.reason, 'Breaks the community rules', 'Scam or fraud'],
    onYes(reason) {
      if (r.type === 'campaign' && r.link) L.store.set(s => { const k = s.campaigns.find(c => c.id === r.link); if (k) { k.status = 'removed'; k.mod = { by: s.me.name, at: nowISO(), reason }; } }, 'campaign');
      if (r.type === 'review' && r.link) L.store.set(s => { const v = s.reviews.find(c => c.id === r.link); if (v) { v.status = 'removed'; v.mod = { by: s.me.name, at: nowISO(), reason }; } }, 'review');
      fin('actioned', DONE[r.type], reason);
      done();
    }
  });
  if (kind === 'warn') reasonSheet({
    title: `Warn ${a.name}?`, mini, yes: 'Send warning', action: 'report.warn', target: tgt,
    bullets: [`${a.name} gets a plain note in their Linkloom inbox naming the rule. Nothing is taken down.`, 'The warning shows on the account for other admins. A second one usually means suspension.'],
    reasons: [r.reason, 'First offence', 'Breaks the community rules'], preset: true,
    onYes(reason) { fin('actioned', 'Warned', reason); done(); }
  });
  if (kind === 'suspend') reasonSheet({
    title: `Suspend ${a.name}?`, mini, danger: true, yes: 'Suspend account', action: 'account.suspend', target: `${a.name}${a.id ? ' (' + a.id + ')' : ''}`,
    bullets: ['They are signed out on every device and can’t post, bid, message or withdraw.', a.kind === 'b' ? `Its ${a.rec.open} open campaigns are hidden, and creators who bid are told why.` : 'Their open bids are withdrawn. Money in escrow stays put until each order is decided.', `Report ${r.id} is closed as actioned. You can reactivate the account from Accounts.`],
    reasons: [r.reason, 'Repeat offence', 'Scam or fraud'], preset: true,
    onYes(reason) {
      if (a.id) suspend(a.kind, a.id, reason);
      if (a.kind === 'b') L.store.set(s => s.campaigns.forEach(k => { if (k.brand === a.id && k.status === 'live') { k.status = 'hidden'; k.mod = { by: s.me.name, at: nowISO(), reason: 'Brand suspended' }; } }), 'campaign');
      fin('actioned', 'Account suspended', reason); done();
    }
  });
  if (kind === 'dismiss') reasonSheet({
    title: 'Dismiss this report?', mini, yes: 'Dismiss report', action: 'report.dismiss', target: tgt,
    bullets: ['Nothing changes for the account. The report closes.', 'The person who reported it is thanked and told no rule was broken.'],
    reasons: ['No rule broken', 'Already handled', 'Duplicate report'],
    onYes(reason) { fin('dismissed', 'Dismissed', reason); done(); }
  });
}

/* ---------- list ---------- */
function Row({ r }) {
  const c = CTX[r.id] || {}, first = (c.reporters || [[r.by]])[0][0], more = r.count - 1;
  return (
    <article className={`mx-slip md-row is-${r.status} sev-${r.severity}`} data-id={r.id} aria-labelledby={`mdt-${r.id}`}>
      <div className="mx-stub md-stub"><p className="mx-stub-l">Reports</p><p className="mx-price t-money num">{r.count}</p><p className="mx-stub-d">{L.ago(r.at)}</p></div>
      <div className="mx-body">
        <div className="mx-top"><TypeTag r={r} /><span className="row mk-pills"><Sev s={r.severity} /><StPill r={r} /></span></div>
        <h3 className="mx-t" id={`mdt-${r.id}`}><a href={`#moderation-${r.id}`}>{r.target}</a></h3>
        <p className="md-reason">{r.reason}</p>
        {r.excerpt ? <p className="mx-quote">{`“${r.excerpt}”`}</p> : null}
        <p className="mx-note">Reported by <b className={`md-by is-${personKind(first)}`}>{first}</b>{(more > 0 ? ` and ${more} other${more === 1 ? '' : 's'}` : '') + (r.status !== 'open' ? ` · ${r.action || RST[r.status][2]}${r.by_admin ? ' by ' + r.by_admin : ''}` : '')}</p>
        <div className="mx-acts"><Lq as="a" className={`${r.status === 'open' ? 'lq-p' : 'lq-s'} lq-sm`} href={`#moderation-${r.id}`}>{r.status === 'open' ? 'Review report' : 'Open report'}</Lq></div>
      </div></article>
  );
}
function List() {
  const root = useRef(null), live = useRef(null), tick = useRef(0);
  const rerender = useRerender();
  const u = ui('moderation'); u.st = u.st || 'open'; u.ty = u.ty || 'all';
  const byS = r => u.st === 'all' || (u.st === 'open' ? r.status === 'open' : r.status !== 'open');
  const [sum] = useState(() => {
    const o = S().reports.filter(r => r.status === 'open'), hi = o.filter(r => r.severity === 'high').length;
    if (!o.length) return 'No open reports. Closed ones stay here with their reasons.';
    const oldest = o.reduce((m, r) => (r.at < m ? r.at : m), o[0].at);
    return `${plural(o.length, 'open report')}, ${hi} high severity. The oldest came in ${L.ago(oldest)}.`;
  });
  useLayoutEffect(() => { mo('stagger', L.$$('.md-row', root.current)); }, []);
  const $ = q => root.current.querySelector(q);
  /* the board is drawn afresh; rows glide from where they were */
  const refresh = msg => { flip(() => { tick.current++; flushSync(rerender); }, () => L.$$('.md-row', root.current)); live.current.textContent = msg; };
  const setTy = k => () => { u.ty = k; refresh(`Showing ${u.ty === 'all' ? 'all types' : TYPES[u.ty][2].toLowerCase()}`); const f = $(`[data-ty="${u.ty}"]`); f && f.focus(); };
  const setSt = k => () => { u.st = k; refresh(`Showing ${u.st} reports`); const f = $(`[data-st="${u.st}"]`); f && f.focus(); };
  const reset = () => { u.st = 'all'; u.ty = 'all'; refresh('Showing every report'); };

  const rows = S().reports.filter(r => byS(r) && (u.ty === 'all' || r.type === u.ty)).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || SEVN[a.severity] - SEVN[b.severity] || b.count - a.count || b.at.localeCompare(a.at));
  return (
    <div className="view-in md" ref={root}>
      <header className="mx-head"><div className="mx-head-t"><h1 className="t-h1">Moderation</h1><p className="muted" id="mdSum">{sum + ' '}<span className="sample">Sample data</span></p></div>
        <div className="seg md-seg" role="group" aria-label="Report status">{[['open', 'Open'], ['closed', 'Closed'], ['all', 'All']].map(([k, n]) => <button type="button" data-st={k} aria-pressed={u.st === k} key={k} onClick={setSt(k)}>{n}</button>)}</div></header>
      <div className="chips mx-filter" role="group" aria-label="Report type">{[['all', 'All']].concat(Object.entries(TYPES).map(([k, v]) => [k, v[2]])).map(([k, n]) => <button className="chip" type="button" data-ty={k} aria-pressed={u.ty === k} key={k} onClick={setTy(k)}>{n + ' '}<span className="mx-cn">{S().reports.filter(r => byS(r) && (k === 'all' || r.type === k)).length}</span></button>)}</div>
      <p className="sr-only" id="mdLive" aria-live="polite" ref={live}></p>
      <div className="mx-board no-anchor" id="mdBoard"><Fragment key={tick.current}>{rows.length
        ? <div className="mx-list">{rows.map(r => <Row r={r} key={r.id} />)}</div>
        : <div className="empty"><img src="assets/step-05-stamp.svg" width="96" height="96" alt="" /><p className="t-h2">{u.st === 'open' ? 'Nothing waiting.' : 'Nothing here.'}</p><p className="muted">{u.st === 'open' ? 'Every report in this view has a decision. New ones land here first.' : 'No reports match this filter.'}</p>{u.ty !== 'all' || u.st !== 'all' ? <Lq className="lq-s" data-reset="" onClick={reset}>Show every report</Lq> : null}</div>}</Fragment></div>
    </div>
  );
}

/* ---------- detail ---------- */
function context(r) {
  const c = CTX[r.id] || {};
  if (r.type === 'campaign' && r.link) {
    const k = S().campaigns.find(y => y.id === r.link), b = k && L.brand(k.brand);
    if (!k) return null;
    return (
      <div className="md-ctx-camp"><div className="row between wrap"><BrWho b={b} /><span className="t-money md-ctx-p">{L.inr(k.budget)}</span></div>
        <p className="t-label">{k.title}</p>
        <dl className="mx-meta"><div><dt>Bids</dt><dd>{k.bids}</dd></div><div className={k.status === 'live' ? '' : 'is-done'}><dt>Status</dt><dd>{{ live: 'Live', hidden: 'Hidden', removed: 'Removed' }[k.status]}</dd></div><div className="is-bad"><dt>Brand posts</dt><dd>{`${b.postsLast30} in 2 days`}</dd></div></dl>
        {k.rule ? <p className="mx-rule"><Icon n="alert" /><span>{k.rule}</span></p> : null}
        <a className="btn-q" href={`#marketplace-${k.id}`}>Inspect the brief in Marketplace <Icon n="arrow" /></a></div>
    );
  }
  if (r.type === 'message' && c.thread) {
    return (
      <>
        <ol className="md-chat" aria-label="Chat around the reported message">{c.thread.map(([k, at, t, hit], i) => <li className={`md-msg is-${k}${hit ? ' is-hit' : ''}`} key={i}><p>{t}</p><span className="t-cap">{`${k === 'b' ? 'GlowCash Deals' : 'Tanvi Shah'} · ${time(at)}${hit ? ' · reported' : ''}`}</span></li>)}</ol>
        <p className="t-small muted">Showing two messages either side. Admins see chats only when one is reported.</p>
      </>
    );
  }
  if (r.type === 'review' && r.link) {
    const v = S().reviews.find(y => y.id === r.link);
    return v ? (
      <div className="md-ctx-rev"><Stars n={v.stars} /><p className="mx-quote">{`“${v.text}”`}</p><p className="t-small muted">{`${v.from} on ${v.to} · ${L.fmtDate(v.at, { year: true })}`}</p>
        {v.order ? null : <p className="mx-rule"><Icon n="alert" /><span>No order between them. The reviewer’s account is 3 days old and has never hired.</span></p>}
        <a className="btn-q" href="#marketplace-reviews">All reviews <Icon n="arrow" /></a></div>
    ) : null;
  }
  if (r.type === 'profile') {
    const k = L.creator(c.acct[1]), al = c.alert && S().bidAlerts.find(a => a.id === c.alert);
    return (
      <div className="md-ctx-camp"><CrWho c={k} />
        <dl className="mx-meta"><div><dt>Joined</dt><dd>{L.fmtDate(k.joined, { year: true })}</dd></div><div><dt>Engagement</dt><dd className={k.er > 12 ? 'md-hot' : ''}>{`${k.er}%`}</dd></div><div><dt>Jobs</dt><dd>{k.jobs}</dd></div></dl>
        {al ? <><p className="mx-rule"><Icon n="alert" /><span>{`${al.pattern}, risk ${al.risk}/100. ${al.detail}`}</span></p><a className="btn-q" href="#marketplace-bids">See the bid pattern <Icon n="arrow" /></a></> : null}</div>
    );
  }
  if (r.type === 'content' && c.file) {
    return <><div className="md-file"><span className="md-file-i"><Icon n="file" /></span><span className="stack md-file-t"><b>{c.file[0]}</b><span className="t-small muted">{c.file[1]}</span></span></div><p className="mx-quote">{c.file[2]}</p></>;
  }
  return null;
}
function Detail({ id }) {
  const root = useRef(null);
  const rerender = useRerender();
  const r = rep(id);
  useLayoutEffect(() => { if (r) mo('stagger', L.$$('.md-card', root.current)); }, []);
  if (!r) return <div className="view-in"><div className="empty"><p className="t-h2">That report isn’t here.</p><p className="muted">It may have a different number. Every report is in the list.</p><Lq as="a" className="lq-p" href="#moderation">All reports</Lq></div></div>;

  const c = CTX[r.id] || {}, a = acctOf(r), open = r.status === 'open';
  const reporters = (c.reporters || [[r.by, r.at]]).slice(0, r.count);
  const log = S().audit.filter(e => e.target.includes(`Report ${r.id}`) || (a && a.name && e.target.includes(a.name)) || (r.link && e.target.includes(`${r.link} `))).slice().reverse();
  const ctx = context(r);
  /* after a decision the page shows the outcome; it gets the butter wash and the focus */
  const go = kind => () => act(kind, id, () => { flushSync(rerender); const o = root.current.querySelector('.md-out'); if (o) { mo('fresh', o); o.setAttribute('tabindex', '-1'); o.focus({ preventScroll: true }); } });
  return (
    <div className="view-in md md-d no-anchor" ref={root}>
      <a className="btn-q md-back" href="#moderation"><Icon n="back" />All reports</a>
      <header className="md-dh"><p className="row md-dh-e"><TypeTag r={r} /><span className="t-small muted">{`Report ${r.id} · ${when(r.at)}`}</span></p>
        <h1 className="t-h1">{r.target}</h1>
        <p className="row wrap mk-pills"><Sev s={r.severity} /><Pill cls="pill-line" icon="flag" label={plural(r.count, 'report')} /><StPill r={r} /><span className="sample">Sample data</span></p></header>
      <div className="md-grid">
        <div className="stack md-main">
          <section className="card md-card" aria-labelledby="mdw"><h2 className="t-eyebrow" id="mdw">What was reported</h2><p className="t-h3">{r.reason}</p>{r.excerpt ? <p className="mx-quote md-ex">{`“${r.excerpt}”`}</p> : null}</section>
          {ctx ? <section className="card md-card" aria-labelledby="mdc"><h2 className="t-eyebrow" id="mdc">Context</h2>{ctx}</section> : null}
          <section className="card md-card" aria-labelledby="mdr"><h2 className="t-eyebrow" id="mdr">{`Who reported it · ${r.count}`}</h2>
            <ul className="md-reps">{reporters.map(([n, at], i) => { const k = personKind(n); return <li key={i}><span className={`avatar mx-av is-${k === 's' ? 'x' : k}`} aria-hidden="true">{k === 's' ? <Icon n="shield" /> : L.initials(n)}</span><span className="md-rep-t"><b className={`md-by is-${k}`}>{n}</b><span className="t-small muted">{`${k === 'c' ? 'Creator' : k === 'b' ? 'Brand' : k === 's' ? 'Automatic check' : 'User'} · ${L.ago(at)}`}</span></span></li>; })}</ul></section>
          <section className="card md-card" aria-labelledby="mdl"><h2 className="t-eyebrow" id="mdl">In the audit log</h2>
            {log.length ? <><ol className="md-log">{log.map(e => <li key={e.id}><span className="md-log-a"><code>{e.action}</code><span className="t-small muted">{`${e.who} · ${when(e.at)}`}</span></span><span className="t-small">{e.detail}</span><span className="md-hash num" title="Entry hash">{'#' + e.hash}</span></li>)}</ol><a className="btn-q" href="#audit"><Icon n="shield" />Full audit log</a></> : <p className="muted">No admin action on this yet.</p>}</section>
        </div>
        <aside className="stack md-side" aria-label="Decision">
          <section className="card md-card"><h2 className="t-eyebrow">Account</h2>
            {a ? (a.kind === 'b' ? <BrWho b={a.rec} /> : a.kind === 'c' ? <CrWho c={a.rec} /> : <Who kind="x" name={a.name} sub="No verified account" />) : null}
            <p className="row wrap">{a && a.rec ? (a.rec.status === 'suspended' ? <Pill cls="pill-err" icon="alert" label="Suspended" /> : <Pill cls="pill-ok" icon="check" label="Active" />) : <Pill cls="pill-line" icon="" label="Unlinked account" />}{a && a.rec && a.rec.reports ? <span className="t-small muted">{`${plural(a.rec.reports, 'report')} on this account`}</span> : null}</p>
            {a && a.rec && a.rec.suspended ? <p className="t-small muted">{`Suspended ${L.fmtDate(a.rec.suspended.at)}: ${a.rec.suspended.reason}`}</p> : null}</section>
          <section className="card md-card md-decide"><h2 className="t-eyebrow">{open ? 'Decide' : 'Decision'}</h2>{open
            ? <div className="stack md-acts">
              <Lq className="lq-p mx-danger" data-act="remove" onClick={go('remove')}><Icon n="trash" />{REMOVE[r.type]}</Lq>
              {a && a.kind !== 'x' ? <Lq className="lq-s" data-act="warn" onClick={go('warn')}><Icon n="flag" />{`Warn ${a.name.split(' ')[0]}`}</Lq> : null}
              {a && a.kind !== 'x' && a.rec.status !== 'suspended' ? <Lq className="lq-s md-susp" data-act="suspend" onClick={go('suspend')}><Icon n="lock" />Suspend account</Lq> : a && a.kind === 'x' ? <p className="t-small muted">The reviewer has no verified account to warn or suspend.</p> : <p className="t-small muted">The account is already suspended.</p>}
              <button className="btn-q md-dis" type="button" data-act="dismiss" onClick={go('dismiss')}>Dismiss report</button>
              <p className="mx-logged"><Icon n="shield" /><span>Each action asks for a reason and is written to the audit log.</span></p></div>
            : <div className="md-out"><StPill r={r} /><p className="t-label">{r.action || RST[r.status][2]}</p><p className="t-small muted">{(r.by_admin ? `By ${r.by_admin}, ${when(r.closedAt)}` : 'Decided before this session') + (r.note ? ` · ${r.note}` : '')}</p></div>}</section>
        </aside>
      </div>
    </div>
  );
}

const Moderation = ({ param }) => (param ? <Detail id={param} /> : <List />);

L.register('moderation', { title: p => (p ? 'Report ' + p + ' · Moderation' : 'Moderation'), nav: 'moderation', Component: Moderation });
