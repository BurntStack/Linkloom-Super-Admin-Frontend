/* Moderation (#moderation, #moderation-<reportId>). Reported profiles, messages, content, reviews and campaigns.
   Data: GET /v1/admin/moderation/abuse-reports/ and .../{id}/. Actions: POST .../{id}/remove/, warn/, suspend-account/, dismiss/ {reason}.
   Each takes a reason (reasonSheet in lib/mx.jsx); the server writes it to the audit log. */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { data } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { ui, mo, flip, time, when, plural, Who, CrWho, BrWho, Pill, Sev, Stars, reasonSheet } from '../lib/mx.jsx';
import needs from '../components/Needs.jsx';
import { act as api, reload, fetchReport } from '../lib/admin.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';

const S = () => data;

const TYPES = { profile: ['Profile', 'user', 'Profiles'], message: ['Message', 'chat', 'Messages'], content: ['Content', 'file', 'Content'], review: ['Review', 'star', 'Reviews'], campaign: ['Campaign', 'brief', 'Campaigns'] };
const RST = { open: ['pill-warn', 'clock', 'Open'], actioned: ['pill-ok', 'check', 'Actioned'], dismissed: ['pill-paper', '', 'Dismissed'] };
const SEVN = { high: 0, medium: 1, low: 2 };
const REMOVE = { campaign: 'Remove campaign', message: 'Remove message', content: 'Remove file', review: 'Delete review', profile: 'Hide profile' };
const DONE = { campaign: 'Campaign removed', message: 'Message removed', content: 'File removed', review: 'Review deleted', profile: 'Profile hidden' };
const rep = id => S().reports.find(r => r.id === id) || null;
/* the account a report is about: the loaded account record when there is one */
const acctOf = r => {
  const c = r.acct; if (!c) return null;
  if (c.kind === 'b' && c.id) { const b = L.brand(c.id); return { kind: 'b', id: b.id, name: b.stub ? c.name : b.name, rec: b }; }
  if (c.kind === 'c' && c.id) { const k = L.creator(c.id); return { kind: 'c', id: k.id, name: k.stub ? c.name : k.name, rec: k }; }
  return { kind: 'x', id: null, name: c.name, rec: null };
};
const personKind = n => (S().creators.some(c => c.name === n) ? 'c' : S().brands.some(b => b.name === n) ? 'b' : /^System/.test(n) ? 's' : 'x');
const TypeTag = ({ r }) => { const t = TYPES[r.type] || TYPES.content; return <span className="md-type"><Icon n={t[1]} />{t[0]}</span>; };
const StPill = ({ r }) => { const m = RST[r.status] || RST.open; return <Pill cls={m[0]} icon={m[1]} label={m[2]} />; };

const ReportMini = ({ r }) => <div className="mx-mini"><p className="row md-mini-h"><TypeTag r={r} /><span className="t-small muted">{`${r.id} · ${plural(r.count, 'report')}`}</span></p><p className="t-label">{r.target}</p>{r.excerpt ? <p className="mx-quote">{`“${r.excerpt}”`}</p> : <p className="t-small muted">{r.reason}</p>}</div>;

function act(kind, id, done) {
  const r = rep(id), a = acctOf(r), tgt = `Report ${r.id} · ${a ? a.name : r.target}`;
  const mini = <ReportMini r={r} />;
  /* the API call, then the reports (and whatever the action touched) are fetched again */
  const send = (verb, reason, also = []) => api.report(r.id, verb, reason).then(() => reload(['reports', 'counts', ...also])).then(done);
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
    onYes(reason) { return send('remove', reason, r.type === 'campaign' ? ['campaigns'] : r.type === 'review' ? ['reviews'] : []); }
  });
  if (kind === 'warn') reasonSheet({
    title: `Warn ${a.name}?`, mini, yes: 'Send warning', action: 'report.warn', target: tgt,
    bullets: [`${a.name} gets a plain note in their Linkloom inbox naming the rule. Nothing is taken down.`, 'The warning shows on the account for other admins. A second one usually means suspension.'],
    reasons: [r.reason, 'First offence', 'Breaks the community rules'], preset: true,
    onYes(reason) { return send('warn', reason); }
  });
  if (kind === 'suspend') reasonSheet({
    title: `Suspend ${a.name}?`, mini, danger: true, yes: 'Suspend account', action: 'account.suspend', target: `${a.name}${a.id ? ' (' + a.id + ')' : ''}`,
    bullets: ['They are signed out on every device and can’t post, bid, message or withdraw.', a.kind === 'b' ? `Its ${a.rec.open || ''} open campaigns are hidden, and creators who bid are told why.` : 'Their open bids are withdrawn. Money in escrow stays put until each order is decided.', `Report ${r.id} is closed as actioned. You can reactivate the account from Accounts.`],
    reasons: [r.reason, 'Repeat offence', 'Scam or fraud'], preset: true,
    onYes(reason) { return send('suspend-account', reason, a.kind === 'b' ? ['brands', 'campaigns'] : ['creators']); }
  });
  if (kind === 'dismiss') reasonSheet({
    title: 'Dismiss this report?', mini, yes: 'Dismiss report', action: 'report.dismiss', target: tgt,
    bullets: ['Nothing changes for the account. The report closes.', 'The person who reported it is thanked and told no rule was broken.'],
    reasons: ['No rule broken', 'Already handled', 'Duplicate report'],
    onYes(reason) { return send('dismiss', reason); }
  });
}

/* ---------- list ---------- */
function Row({ r }) {
  const first = (r.reporters[0] || [r.by])[0], more = r.count - 1;
  return (
    <article className={`mx-slip md-row is-${r.status} sev-${r.severity}`} data-id={r.id} aria-labelledby={`mdt-${r.id}`}>
      <div className="mx-stub md-stub"><p className="mx-stub-l">Reports</p><p className="mx-price t-money num">{r.count}</p><p className="mx-stub-d">{L.ago(r.at) || '—'}</p></div>
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
    const oldest = o.reduce((m, r) => (r.at && r.at < m ? r.at : m), o[0].at || '');
    return `${plural(o.length, 'open report')}, ${hi} high severity.${oldest ? ` The oldest came in ${L.ago(oldest)}.` : ''}`;
  });
  useLayoutEffect(() => { mo('stagger', L.$$('.md-row', root.current)); }, []);
  const $ = q => root.current.querySelector(q);
  /* the board is drawn afresh; rows glide from where they were */
  const refresh = msg => { flip(() => { tick.current++; flushSync(rerender); }, () => L.$$('.md-row', root.current)); live.current.textContent = msg; };
  const setTy = k => () => { u.ty = k; refresh(`Showing ${u.ty === 'all' ? 'all types' : TYPES[u.ty][2].toLowerCase()}`); const f = $(`[data-ty="${u.ty}"]`); f && f.focus(); };
  const setSt = k => () => { u.st = k; refresh(`Showing ${u.st} reports`); const f = $(`[data-st="${u.st}"]`); f && f.focus(); };
  const reset = () => { u.st = 'all'; u.ty = 'all'; refresh('Showing every report'); };

  const rows = S().reports.filter(r => byS(r) && (u.ty === 'all' || r.type === u.ty)).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || SEVN[a.severity] - SEVN[b.severity] || b.count - a.count || String(b.at).localeCompare(String(a.at)));
  return (
    <div className="view-in md" ref={root}>
      <header className="mx-head"><div className="mx-head-t"><h1 className="t-h1">Moderation</h1><p className="muted" id="mdSum">{sum}</p></div>
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
  if (r.type === 'campaign' && r.link) {
    const k = S().campaigns.find(y => y.id === r.link), b = k && L.brand(k.brand);
    if (!k) return <a className="btn-q" href={`#marketplace-${r.link}`}>Inspect the campaign in Marketplace <Icon n="arrow" /></a>;
    return (
      <div className="md-ctx-camp"><div className="row between wrap"><BrWho b={b} /><span className="t-money md-ctx-p">{L.inr(k.budget)}</span></div>
        <p className="t-label">{k.title}</p>
        <dl className="mx-meta"><div><dt>Bids</dt><dd>{k.bids}</dd></div><div className={k.status === 'live' ? '' : 'is-done'}><dt>Status</dt><dd>{{ live: 'Live', hidden: 'Hidden', removed: 'Removed', pending: 'Waiting for approval', rejected: 'Rejected' }[k.status] || k.status}</dd></div><div><dt>Brand posts</dt><dd>{`${b.postsLast30} in 30 days`}</dd></div></dl>
        {k.rule ? <p className="mx-rule"><Icon n="alert" /><span>{k.rule}</span></p> : null}
        <a className="btn-q" href={`#marketplace-${k.id}`}>Inspect the brief in Marketplace <Icon n="arrow" /></a></div>
    );
  }
  if (r.type === 'message' && r.thread.length) {
    return (
      <>
        <ol className="md-chat" aria-label="Chat around the reported message">{r.thread.map(([k, at, t, hit, n], i) => <li className={`md-msg is-${k}${hit ? ' is-hit' : ''}`} key={i}><p>{t}</p><span className="t-cap">{`${n || (k === 'b' ? 'Brand' : 'Creator')}${at ? ' · ' + time(at) : ''}${hit ? ' · reported' : ''}`}</span></li>)}</ol>
        <p className="t-small muted">Admins see chats only when one is reported.</p>
      </>
    );
  }
  if (r.type === 'review' && r.link) {
    const v = S().reviews.find(y => y.id === r.link);
    return v ? (
      <div className="md-ctx-rev"><Stars n={v.stars} /><p className="mx-quote">{`“${v.text}”`}</p><p className="t-small muted">{`${v.from} on ${v.to} · ${L.fmtDate(v.at, { year: true })}`}</p>
        {v.order ? null : <p className="mx-rule"><Icon n="alert" /><span>No order between them. Reviews need a completed order.</span></p>}
        <a className="btn-q" href="#marketplace-reviews">All reviews <Icon n="arrow" /></a></div>
    ) : null;
  }
  if (r.type === 'profile' && r.acct && r.acct.kind === 'c' && r.acct.id) {
    const k = L.creator(r.acct.id);
    return (
      <div className="md-ctx-camp"><CrWho c={k} />
        <dl className="mx-meta"><div><dt>Joined</dt><dd>{L.fmtDate(k.joined, { year: true })}</dd></div><div><dt>Engagement</dt><dd className={k.er > 12 ? 'md-hot' : ''}>{k.er != null ? `${k.er}%` : '—'}</dd></div><div><dt>Jobs</dt><dd>{k.jobs}</dd></div></dl></div>
    );
  }
  if (r.type === 'content' && r.file) {
    return <><div className="md-file"><span className="md-file-i"><Icon n="file" /></span><span className="stack md-file-t"><b>{r.file[0] || 'File'}</b><span className="t-small muted">{r.file[1]}</span></span></div>{r.file[2] ? <p className="mx-quote">{r.file[2]}</p> : null}</>;
  }
  return null;
}
function Detail({ id }) {
  const root = useRef(null);
  const rerender = useRerender();
  const r = rep(id);
  useEffect(() => { fetchReport(id).catch(() => {}); }, [id]);
  useLayoutEffect(() => { if (r) mo('stagger', L.$$('.md-card', root.current)); }, []);
  if (!r) return <div className="view-in"><div className="empty"><p className="t-h2">That report isn’t here.</p><p className="muted">It may have a different number. Every report is in the list.</p><Lq as="a" className="lq-p" href="#moderation">All reports</Lq></div></div>;

  const a = acctOf(r), open = r.status === 'open';
  const reporters = (r.reporters.length ? r.reporters : [[r.by, r.at]]).slice(0, Math.max(1, r.count));
  const log = S().audit.filter(e => e.target.includes(r.id) || (a && a.name && e.target.includes(a.name)) || (r.link && e.target.includes(r.link))).slice().reverse();
  const ctx = context(r);
  /* after a decision the page shows the outcome; it gets the butter wash and the focus */
  const go = kind => () => act(kind, id, () => { flushSync(rerender); const o = root.current.querySelector('.md-out'); if (o) { mo('fresh', o); o.setAttribute('tabindex', '-1'); o.focus({ preventScroll: true }); } });
  return (
    <div className="view-in md md-d no-anchor" ref={root}>
      <a className="btn-q md-back" href="#moderation"><Icon n="back" />All reports</a>
      <header className="md-dh"><p className="row md-dh-e"><TypeTag r={r} /><span className="t-small muted">{r.at ? `Reported ${when(r.at)}` : 'Report'}</span></p>
        <h1 className="t-h1">{r.target}</h1>
        <p className="row wrap mk-pills"><Sev s={r.severity} /><Pill cls="pill-line" icon="flag" label={plural(r.count, 'report')} /><StPill r={r} /></p></header>
      <div className="md-grid">
        <div className="stack md-main">
          <section className="card md-card" aria-labelledby="mdw"><h2 className="t-eyebrow" id="mdw">What was reported</h2><p className="t-h3">{r.reason}</p>{r.excerpt ? <p className="mx-quote md-ex">{`“${r.excerpt}”`}</p> : null}</section>
          {ctx ? <section className="card md-card" aria-labelledby="mdc"><h2 className="t-eyebrow" id="mdc">Context</h2>{ctx}</section> : null}
          <section className="card md-card" aria-labelledby="mdr"><h2 className="t-eyebrow" id="mdr">{`Who reported it · ${r.count}`}</h2>
            <ul className="md-reps">{reporters.map(([n, at], i) => { const k = personKind(n); return <li key={i}><span className={`avatar mx-av is-${k === 's' ? 'x' : k}`} aria-hidden="true">{k === 's' ? <Icon n="shield" /> : L.initials(n)}</span><span className="md-rep-t"><b className={`md-by is-${k}`}>{n}</b><span className="t-small muted">{(k === 'c' ? 'Creator' : k === 'b' ? 'Brand' : k === 's' ? 'Automatic check' : 'User') + (at ? ` · ${L.ago(at)}` : '')}</span></span></li>; })}</ul></section>
          <section className="card md-card" aria-labelledby="mdl"><h2 className="t-eyebrow" id="mdl">In the audit log</h2>
            {log.length ? <><ol className="md-log">{log.map(e => <li key={e.id}><span className="md-log-a"><code>{e.action}</code><span className="t-small muted">{`${e.who} · ${when(e.at)}`}</span></span><span className="t-small">{e.detail}</span>{e.hash ? <span className="md-hash num" title="Entry hash">{'#' + e.hash}</span> : null}</li>)}</ol><a className="btn-q" href="#audit"><Icon n="shield" />Full audit log</a></> : <p className="muted">No admin action on this yet.</p>}</section>
        </div>
        <aside className="stack md-side" aria-label="Decision">
          <section className="card md-card"><h2 className="t-eyebrow">Account</h2>
            {a ? (a.kind === 'b' ? <BrWho b={a.rec} /> : a.kind === 'c' ? <CrWho c={a.rec} /> : <Who kind="x" name={a.name} sub="No verified account" />) : null}
            <p className="row wrap">{a && a.rec ? (a.rec.status === 'suspended' ? <Pill cls="pill-err" icon="alert" label="Suspended" /> : <Pill cls="pill-ok" icon="check" label="Active" />) : <Pill cls="pill-line" icon="" label="Unlinked account" />}{a && a.rec && a.rec.reports ? <span className="t-small muted">{`${plural(a.rec.reports, 'report')} on this account`}</span> : null}</p>
            {a && a.rec && a.rec.suspended ? <p className="t-small muted">{`Suspended ${L.fmtDate(a.rec.suspended.at)}${a.rec.suspended.reason ? ': ' + a.rec.suspended.reason : ''}`}</p> : null}</section>
          <section className="card md-card md-decide"><h2 className="t-eyebrow">{open ? 'Decide' : 'Decision'}</h2>{open
            ? <div className="stack md-acts">
              <Lq className="lq-p mx-danger" data-act="remove" onClick={go('remove')}><Icon n="trash" />{REMOVE[r.type]}</Lq>
              {a && a.kind !== 'x' ? <Lq className="lq-s" data-act="warn" onClick={go('warn')}><Icon n="flag" />{`Warn ${a.name.split(' ')[0]}`}</Lq> : null}
              {a && a.kind !== 'x' && a.rec && a.rec.status !== 'suspended' ? <Lq className="lq-s md-susp" data-act="suspend" onClick={go('suspend')}><Icon n="lock" />Suspend account</Lq> : a && a.kind === 'x' ? <p className="t-small muted">The reviewer has no verified account to warn or suspend.</p> : <p className="t-small muted">The account is already suspended.</p>}
              <button className="btn-q md-dis" type="button" data-act="dismiss" onClick={go('dismiss')}>Dismiss report</button>
              <p className="mx-logged"><Icon n="shield" /><span>Each action asks for a reason and is written to the audit log.</span></p></div>
            : <div className="md-out"><StPill r={r} /><p className="t-label">{r.action || RST[r.status][2]}</p><p className="t-small muted">{(r.by_admin ? `By ${r.by_admin}${r.closedAt ? ', ' + when(r.closedAt) : ''}` : 'Decided') + (r.note ? ` · ${r.note}` : '')}</p></div>}</section>
        </aside>
      </div>
    </div>
  );
}

const Moderation = ({ param }) => (param ? <Detail id={param} /> : <List />);

L.register('moderation', { title: p => (p ? 'Report · Moderation' : 'Moderation'), nav: 'moderation', Component: needs(['reports'], Moderation, ['creators', 'brands', 'campaigns', 'reviews', 'audit', 'counts']) });
