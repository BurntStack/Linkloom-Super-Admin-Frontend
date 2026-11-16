/* Command (#home): the dashboard.
   - active brands vs active creators, total live orders in progress, escrow balance (ink band)
   - urgent actions: the verification queue, flagged content reports, and the dispute due soonest
   - alerts: suspicious bidding, payment complaints, disputes due; and the recent audit trail
   Creators coral, brands violet, escrow plum. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import L, { data, store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import Count from '../components/Count.jsx';
import { auditLabel } from './Audit.jsx';

const WORDS = ['Nothing', 'One thing', 'Two things', 'Three things', 'Four things', 'Five things', 'Six things', 'Seven things', 'Eight things'];
const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const plural = (n, a, b) => `${n} ${n === 1 ? a : (b || a + 's')}`;
const hoursSince = at => (L.today() - L.D(at)) / 36e5;
const dueTxt = d => d < 0 ? `${-d} ${d === -1 ? 'day' : 'days'} overdue` : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d} days`;
/* one letter in small avatars; creators coral, brands violet, admins paper (you are butter) */
const Av = ({ name, kind, cls = '' }) => <span className={`home-av is-${kind} ${cls}`} aria-hidden="true">{(String(name || '?').trim()[0] || '?').toUpperCase()}</span>;
const accountOf = v => v.kind === 'brand' ? 'brand' : 'creator';
const UI = () => (data.ui.home = data.ui.home || { nfilter: 'all', afilter: 'all' });

/* ---------- verification flags, read straight from the submission ---------- */
export function vFlags(v) {
  const f = [];
  if (v.id_doc && v.id_doc.match === 'under18') f.push(`Under 18 (${L.ageFrom(v.id_doc.dob)})`);
  if (v.bank && v.bank.match === 'mismatch') f.push('Bank name mismatch');
  if (v.business && !v.business.gstin) f.push('No business details');
  if (v.person && v.person.mailVerified === false) f.push('Unverified email');
  return f;
}

/* ---------- alerts: suspicious bids, payment complaints, disputes due ---------- */
function alerts(s) {
  const out = [];
  s.bidAlerts.filter(a => a.status === 'open').forEach(a => out.push({ g: 'bids', id: a.id, ic: 'bids', tone: a.risk >= 70 ? 'err' : 'warn', title: a.pattern, text: a.detail, risk: a.risk, meta: L.ago(a.at), go: '#marketplace-bids', cta: 'Review bids' }));
  s.disputes.filter(d => d.status === 'open').forEach(d => {
    const o = s.orders.find(x => x.id === d.order) || {}, cr = L.creator(o.creator) || {}, br = L.brand(o.brand) || {}, days = L.daysLeft(d.sla);
    const pay = d.kind === 'payment';
    if (!pay && days > 2) return;
    out.push({ g: pay ? 'pay' : 'disp', id: d.id, ic: pay ? 'coin' : 'flag', tone: pay ? 'escrow' : days <= 1 ? 'warn' : 'plain',
      title: pay ? `Payment complaint from ${first(cr.name)}` : `Dispute ${d.id.toUpperCase()} · ${br.name} and ${cr.name}`,
      text: d.claim, meta: dueTxt(days), urgent: days <= 1, amt: o.amount, go: '#orders-' + d.id, cta: pay ? 'Check payout' : 'Arbitrate' });
  });
  return out;
}
const GROUPS = [['all', 'All'], ['bids', 'Suspicious bids'], ['pay', 'Payments'], ['disp', 'Disputes']];

/* ---------- greeting by IST time ---------- */
function greeting(now) {
  let h = 12; try { h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(now)) % 24; } catch (e) {}
  return h < 4 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 23 ? 'Good evening' : 'Up late';
}
const PHASE = { funded: 'Funded', in_progress: 'In progress', submitted: 'To approve', revision: 'In revision', approved: 'Approved, releasing', disputed: 'In dispute' };
const round = v => String(Math.round(v));

/* ---------- urgent actions: three real objects ---------- */
function VerifyQueue({ pend }) {
  const over = pend.filter(v => hoursSince(v.submitted) > 24).length, flagged = pend.filter(v => vFlags(v).length).length;
  const rows = [...pend].sort((a, b) => vFlags(b).length - vFlags(a).length || L.D(a.submitted) - L.D(b.submitted)).slice(0, 4);
  return (
    <li className="home-obj home-vq">
      <div className="home-obj-top"><span className="pill pill-info"><Icon n="verified" />{`${plural(pend.length, 'verification')} waiting`}</span>{over ? <span className="home-due"><Icon n="clock" />{`${over} past the 24 h target`}</span> : null}</div>
      <ul className="home-q">{rows.map(v => { const f = vFlags(v), k = accountOf(v), h = hoursSince(v.submitted); return (
        <li key={v.id}><a className="home-q-a" href={`#verify-${v.id}`}>
          <Av name={v.name} kind={k} /><span className="home-q-t"><b className={`is-${k}`}>{v.name}</b><span>{k === 'brand' ? 'Brand · GSTIN, PAN, signatory' : 'Creator · ID, PAN, bank, socials'}</span></span>
          <span className="home-q-m">{f.length ? <span className="pill pill-err"><Icon n="alert" />{f[0] + (f.length > 1 ? ` +${f.length - 1}` : '')}</span> : null}<span className={`home-q-age num ${h > 24 ? 'is-late' : ''}`}>{h < 1 ? 'just now' : h < 24 ? Math.round(h) + ' h' : Math.floor(h / 24) + ' d ' + Math.round(h % 24) + ' h'}</span></span></a></li>); })}</ul>
      <div className="home-obj-act"><Lq as="a" className="lq-p lq-sm" href="#verify">Open the desk</Lq>{flagged ? <span className="home-obj-foot">{`${plural(flagged, 'has', 'have')} a problem to look at`}</span> : null}</div>
    </li>
  );
}
function Reports({ repOpen }) {
  const rows = repOpen.slice(0, 3);
  return (
    <li className="home-obj home-rep">
      <div className="home-obj-top"><span className="pill pill-err"><Icon n="flag" />{plural(repOpen.length, 'open report')}</span><span className="home-due">{`${repOpen.reduce((n, r) => n + r.count, 0)} flags in total`}</span></div>
      <ul className="home-rl">{rows.map(r => (
        <li key={r.id}><a className="home-rl-a" href={`#moderation-${r.id}`}>
          <span className={`home-sev is-${r.severity}`}><i></i><i></i><i></i><span className="sr-only">{`${r.severity} severity`}</span></span>
          <span className="home-rl-t"><span className="home-rl-k">{`${r.type} · ${r.count > 1 ? `${r.count} reports` : `by ${r.by}`}`}</span><b>{r.reason}</b>{r.excerpt ? <q>{r.excerpt}</q> : <span className="home-rl-x">{r.target}</span>}</span></a></li>))}</ul>
      <div className="home-obj-act"><Lq as="a" className="lq-p lq-sm" href="#moderation">Review reports</Lq></div>
    </li>
  );
}
function Dispute({ dOpen, s }) {
  const d = dOpen[0], o = s.orders.find(x => x.id === d.order) || {}, cr = L.creator(o.creator) || {}, br = L.brand(o.brand) || {}, days = L.daysLeft(d.sla);
  return (
    <li className="home-obj home-disp ink-card dark">
      <div className="home-obj-top"><span className="pill pill-butter"><Icon n="clock" />{dueTxt(days)}</span><span className="home-disp-id num">{`${d.id.toUpperCase()} · opened by ${d.by}`}</span></div>
      <p className="home-disp-who"><span className="is-brand">{br.name}</span>{' '}<span aria-hidden="true">×</span><span className="sr-only">and</span>{' '}<span className="is-creator">{cr.name}</span></p>
      <p className="home-disp-c">{`“${d.claim}”`}</p>
      <p className="t-money home-disp-v">{L.inr(o.amount)}</p>
      <p className="home-disp-s"><span className="pill pill-escrow"><Icon n="lock" />Held in escrow</span><span>{o.title}</span></p>
      <div className="home-obj-act"><Lq as="a" className="lq-p lq-sm" href={`#orders-${d.id}`}>Arbitrate</Lq>{dOpen.length > 1 ? <a className="btn-q" href="#orders">{`+${dOpen.length - 1} more open`}</a> : null}</div>
      <p className="home-disp-f">Force release or refund, each with a reason on record.</p>
    </li>
  );
}

export default function Home() {
  const root = useRef(null), draws = useRef(0);
  const rerender = useRerender();
  const initial = draws.current === 0;
  draws.current++;

  useLayoutEffect(() => {
    mo('stagger', L.$$('.home-obj, .home-al-i, .home-act-l>li', root.current));
    const bar = root.current.querySelector('.home-ac-bar'); bar && requestAnimationFrame(() => bar.classList.add('is-in'));
  }, []);
  useEffect(() => {
    let raf = 0, alive = true;
    const off = store.on(why => { if (/^notif/.test(String(why))) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (alive) rerender(); }); });
    return () => { alive = false; off(); cancelAnimationFrame(raf); };
  }, []);

  const s = store.s, now = L.today(), ui = UI();
  let when = '';
  try {
    const tz = { timeZone: 'Asia/Kolkata' };
    when = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short', ...tz }).format(now).replace(',', '') + ' · ' +
      new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, ...tz }).format(now).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase()) + ' IST';
  } catch (e) {}

  /* ---- the numbers ---- */
  const crA = s.creators.filter(c => c.status === 'active'), crS = s.creators.filter(c => c.status === 'suspended');
  const brA = s.brands.filter(b => b.status === 'active'), brS = s.brands.filter(b => b.status === 'suspended');
  const brUnv = brA.filter(b => b.verify !== 'verified').length;
  const live = L.liveOrders(), held = L.escrowHeld(), tot = crA.length + brA.length || 1;
  const phases = Object.keys(PHASE).map(k => [k, live.filter(o => o.phase === k)]).filter(x => x[1].length);
  const pend = s.verifications.filter(v => v.status === 'pending');
  const repOpen = s.reports.filter(r => r.status === 'open').sort((a, b) => (b.severity === 'high') - (a.severity === 'high') || b.count - a.count);
  const dOpen = s.disputes.filter(d => d.status === 'open').sort((a, b) => L.D(a.sla) - L.D(b.sla));
  const al = alerts(s), alShown = ui.afilter === 'all' ? al : al.filter(a => a.g === ui.afilter);
  const urgentN = (pend.length ? 1 : 0) + (repOpen.length ? 1 : 0) + (dOpen.length ? 1 : 0);
  const objs = (pend.length ? 1 : 0) + (repOpen.length ? 1 : 0) + (dOpen.length ? 1 : 0);

  /* ---- recent activity (audit log, newest first) ---- */
  const recent = [...s.audit].reverse().slice(0, 5);
  const chain = L.verifyAudit();

  const setFilter = k => () => {
    ui.afilter = k;
    flushSync(rerender);
    const nb = root.current.querySelector(`[data-af="${k}"]`); nb && nb.focus();
    mo('stagger', L.$$('.home-al-i', root.current));
  };

  return (
    <div className="view-in home no-anchor" ref={root}>
      <header className="home-hi">
        <p className="home-when">{when}</p>
        <h1 className="home-greet">{`${greeting(now)}, ${first(s.me.name)}.`}</h1>
        <p className="home-lede">{(urgentN ? `${WORDS[urgentN]} ${urgentN === 1 ? 'needs' : 'need'} a decision today${al.length ? `, and ${plural(al.length, 'alert')} to read` : ''}.` : 'Nothing is waiting on you. The desks are clear.') + ' '}<span className="sample">Sample data</span></p>
      </header>

      <section className="home-band" aria-label="Platform at a glance">
        <dl className="home-nums">
          <div className="home-ac"><dt>Active creators and brands</dt>
            <dd className="home-ac-n"><Count className="t-money is-creator" data-n={crA.length} value={crA.length} fmt={round} /><span className="home-ac-vs" aria-hidden="true">/</span><Count className="t-money is-brand" data-n={brA.length} value={brA.length} fmt={round} /><span className="sr-only">{`: ${plural(crA.length, 'active creator')} and ${plural(brA.length, 'active brand')}`}</span></dd>
            <div className={'home-ac-bar' + (initial ? '' : ' is-in is-now')} role="img" aria-label={`${Math.round(crA.length / tot * 100)}% creators, ${Math.round(brA.length / tot * 100)}% brands`}><i className="is-creator" style={{ flexGrow: crA.length }}></i><i className="is-brand" style={{ flexGrow: brA.length }}></i></div>
            <p className="home-num-s"><span className="home-key is-creator"></span>{'Creators' + (crS.length ? ` · ${crS.length} suspended` : '')}<span className="home-key is-brand"></span>{'Brands' + (brUnv ? ` · ${brUnv} not verified` : '') + (brS.length ? ` · ${brS.length} suspended` : '')}</p></div>
          <div><dt>Live orders in progress</dt><Count as="dd" className="t-money" data-n={live.length} value={live.length} fmt={round} />
            <p className="home-num-s home-ph">{phases.map(([k, os]) => <span className={`home-ph-i ${k === 'disputed' ? 'is-hot' : ''}`} key={k}><b className="num">{os.length}</b>{' ' + PHASE[k].toLowerCase()}</span>)}</p></div>
          <div><dt>Escrow balance</dt><Count as="dd" className="t-money" data-inr={held} value={held} fmt={L.inr} />
            <p className="home-num-s"><span className="pill pill-escrow"><Icon n="lock" />{`Held for ${plural(live.length, 'order')}`}</span></p></div>
        </dl>
        <div className="home-comm">
          <p><b>Commission ₹0</b> · No commission under the subscription model <span className="pill pill-line home-comm-r">Rate 0%</span></p>
          <p className="home-comm-s">{`Gateway fees (${s.rules.gatewayPct}%) are a Linkloom cost, never charged to brands or creators. `}<a className="btn-q" href="#finance">Financials<Icon n="arrow" /></a></p>
        </div>
      </section>

      <section className="home-today" aria-labelledby="homeUrgH">
        <div className="home-sec-h"><h2 className="t-h2" id="homeUrgH">Urgent actions</h2></div>
        {objs
          ? <ul className={`home-strip home-strip-${Math.min(objs, 3)}`}>{pend.length ? <VerifyQueue pend={pend} /> : null}{repOpen.length ? <Reports repOpen={repOpen} /> : null}{dOpen.length ? <Dispute dOpen={dOpen} s={s} /> : null}</ul>
          : <div className="empty home-empty"><img src="assets/step-05-stamp.svg" width="160" height="117" alt="" /><p className="t-h3">The desks are clear.</p><p className="muted">Verifications, reports and disputes show up here as they arrive.</p></div>}
      </section>

      <div className="home-two">
        <section className="home-al" aria-labelledby="homeAlH">
          <div className="home-sec-h"><div><h2 className="t-h2" id="homeAlH">Alerts</h2><p className="muted t-small">Bid patterns the system flagged, payment complaints and disputes due within 2 days.</p></div></div>
          <div className="home-al-f chips" role="group" aria-label="Show alerts">{GROUPS.map(([k, t]) => { const n = k === 'all' ? al.length : al.filter(a => a.g === k).length; return <button className="chip" type="button" data-af={k} aria-pressed={ui.afilter === k} key={k} onClick={setFilter(k)}>{t + ' '}<span className="num home-chip-n">{n}</span></button>; })}</div>
          {alShown.length
            ? <ul className="home-al-l" aria-live="polite">{alShown.map(a => (
              <li className="home-al-i" key={a.id}>
                <span className={`home-al-ic is-${a.tone}`} aria-hidden="true"><Icon n={a.tone === 'err' ? 'alert' : a.ic} /></span>
                <div className="home-al-t"><p className="home-al-h"><b>{a.title}</b>{a.risk != null ? <span className={`home-risk ${a.risk >= 70 ? 'is-hi' : ''}`} role="img" aria-label={`Risk ${a.risk} of 100`}><span className="home-risk-b"><i style={{ width: a.risk + '%' }}></i></span><span className="num">{a.risk}</span></span> : null}</p>
                  <p className="home-al-s">{a.text}</p>
                  <p className="home-al-m"><span className={a.urgent ? 'is-urgent' : ''}><Icon n="clock" />{a.meta}</span>{a.amt ? <span className="pill pill-escrow"><Icon n="lock" />{L.inr(a.amt)}</span> : null}</p></div>
                <a className="btn-q home-al-go" href={a.go}>{a.cta}<Icon n="arrow" /></a></li>))}</ul>
            : <p className="home-al-none muted">No alerts of this kind right now.</p>}
        </section>

        <section className="home-act card" aria-labelledby="homeActH">
          <div className="home-act-h"><h2 className="t-h3" id="homeActH">Recent activity</h2><a className="btn-q" href="#audit">Audit log<Icon n="arrow" /></a></div>
          <ol className="home-act-l">{recent.map(e => { const isMe = e.who === s.me.name; return (
            <li key={e.id}>
              <Av name={e.who} kind={isMe ? 'me' : 'admin'} />
              <div className="home-act-t"><p><b>{isMe ? 'You' : first(e.who)}</b>{' ' + auditLabel(e.action).toLowerCase()}</p><p className="home-act-x">{e.target}</p></div>
              <span className="home-act-at num">{L.ago(e.at)}</span></li>); })}</ol>
          <p className={`home-act-f ${chain.ok ? 'is-ok' : 'is-bad'}`}><Icon n={chain.ok ? 'shield' : 'alert'} /><span>{chain.ok ? `Chain intact · ${plural(chain.count, 'sealed entry', 'sealed entries')}` : `Chain broken at ${chain.at}`}</span></p>
        </section>
      </div>
    </div>
  );
}

L.vFlags = L.vFlags || vFlags;
L.register('home', { title: 'Command', nav: 'home', Component: Home });
