/* Command (#home): the admin dashboard, as designed (artifact screens/home.js).
   - the ink band: active creators vs brands, live orders by phase, escrow balance, commission line
       GET /v1/admin/system/dashboard/  (fallback for phases and escrow: GET /v1/admin/finance/orders/pipeline/)
   - urgent actions: verification queue, open reports, the dispute due soonest
       GET /v1/admin/verifications/?status=pending · /moderation/abuse-reports/?status=open · /finance/disputes/?status=open
   - alerts: suspicious bidding, payment complaints, disputes due within 2 days   GET /v1/admin/moderation/bid-alerts/?status=open
   - recent activity: GET /v1/admin/system/audit-log/?limit=5, chain state from /audit-log/verify/
   Each part loads on its own; a part the admin's role cannot read is left out. Creators coral, brands violet, escrow plum. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import L, { store, data } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import { api, can, pick, num, arr } from '../lib/admin.js';
import { refreshCounts, setEscrow } from '../lib/live.js';
import { toDashboard, toVerification, vFlags, toReport, toDispute, toBidAlert, toAudit, auditLabel, LIVE_PHASES, phaseOf } from '../lib/model.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import Count from '../components/Count.jsx';
import { useLoad } from '../components/Admin.jsx';

const WORDS = ['Nothing', 'One thing', 'Two things', 'Three things', 'Four things', 'Five things', 'Six things', 'Seven things', 'Eight things'];
const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const plural = (n, a, b) => `${n} ${n === 1 ? a : (b || a + 's')}`;
const hoursSince = at => { const t = Date.parse(at); return Number.isFinite(t) ? (Date.now() - t) / 36e5 : 0; };
const dueTxt = d => (d == null || !Number.isFinite(d) ? 'No due date' : d < 0 ? `${-d} ${d === -1 ? 'day' : 'days'} overdue` : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d} days`);
const daysTo = s => (s ? L.daysLeft(String(s).length > 10 ? String(s).slice(0, 10) : s) : null);
const ageFrom = dob => { const t = new Date(), b = new Date(dob); if (!Number.isFinite(b.getTime())) return ''; let a = t.getFullYear() - b.getFullYear(); const m = t.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--; return a; };
const HAv = ({ name, kind, cls = '' }) => <span className={`home-av is-${kind} ${cls}`} aria-hidden="true">{(String(name || '?').trim()[0] || '?').toUpperCase()}</span>;
const PHASE = { funded: 'Funded', in_progress: 'In progress', submitted: 'To approve', revision: 'In revision', approved: 'Approved, releasing', disputed: 'In dispute' };
const GROUPS = [['all', 'All'], ['bids', 'Suspicious bids'], ['pay', 'Payments'], ['disp', 'Disputes']];
const ui = () => (data.ui.home = data.ui.home || { afilter: 'all' });
const rows = p => p.then(r => r.rows, () => null);
const ok = p => p.then(x => x, () => null);

function greeting(now) {
  let h = 12; try { h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(now)) % 24; } catch (e) {}
  return h < 4 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 23 ? 'Good evening' : 'Up late';
}

/* everything the screen reads, in one go; parts the role cannot see come back null */
async function loadAll() {
  const [dash, pipe, ver, rep, dis, bids, aud, chain, rules, tix] = await Promise.all([
    ok(api.dashboard()), can('finance') ? ok(api.pipeline()) : null,
    can('verify') ? rows(api.verifications({ status: 'pending' })) : null,
    can('moderation') ? rows(api.reports({ status: 'open' })) : null,
    can('finance') ? rows(api.disputes({ status: 'open' })) : null,
    can('moderation') ? rows(api.bidAlerts({ status: 'open' })) : null,
    can('audit') ? ok(api.auditLog({})) : null,
    can('audit') ? ok(api.verifyAudit()) : null,
    can('finance') ? ok(api.rules()) : null,
    can('support') ? rows(api.supportTickets({ status: 'open' })) : null
  ]);
  if (dash) setEscrow(dash);
  const d = toDashboard(dash);
  /* phases and escrow from the pipeline when the dashboard does not carry them */
  if (pipe && !Object.keys(d.phases).length) {
    const list = Array.isArray(pipe) ? pipe : arr(pick(pipe.stages, pipe.phases, pipe.pipeline)).length ? arr(pick(pipe.stages, pipe.phases, pipe.pipeline)) : Object.entries(pipe).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => ({ stage: k, ...v }));
    list.forEach(s => { const k = phaseOf(pick(s.stage, s.phase, s.status, s.key)); const n = num(pick(s.count, s.orders, s.n)); if (n != null) d.phases[k] = (d.phases[k] || 0) + n; if (d.escrowHeld == null && LIVE_PHASES.includes(k)) d._held = (d._held || 0) + (num(pick(s.amount && typeof s.amount === 'object' ? s.amount.amount : s.amount, s.total, s.value)) || 0); });
    if (d.escrowHeld == null && d._held != null) d.escrowHeld = d._held;
  }
  if (d.liveOrders == null && Object.keys(d.phases).length) d.liveOrders = LIVE_PHASES.reduce((n, k) => n + (d.phases[k] || 0), 0);
  const r = rules && typeof rules === 'object' ? rules : {};
  return {
    d, gatewayPct: pick(d.gatewayPct, num(pick(r.gatewayPct, r.gatewayPercent, r.gateway_pct))), commissionPct: pick(d.commissionPct, num(pick(r.commissionPct, r.commissionPercent))),
    pend: ver && ver.map(toVerification), reps: rep && rep.map(toReport), disp: dis && dis.map(toDispute), bids: bids && bids.map(toBidAlert),
    audit: aud ? aud.rows.map(toAudit) : null, chain,
    tickets: tix && tix.map(t => ({ id: String(t.id), subject: t.subject || 'Support request', who: (t.user && (t.user.name || t.user.displayName || t.user.email)) || '', role: String((t.user && t.user.role) || t.role || '').toLowerCase(), priority: String(t.priority || 'normal').toLowerCase(), at: t.waitingSince || t.updatedAt || t.createdAt }))
  };
}
const chainOk = c => (c == null ? null : typeof c === 'boolean' ? c : c.valid ?? c.ok ?? c.intact ?? (typeof c.status === 'string' ? /ok|valid|intact/i.test(c.status) : null));
const chainCount = c => (c && typeof c === 'object' ? num(pick(c.count, c.entries, c.checked, c.total)) : null);

/* alerts: suspicious bids, payment complaints, disputes due within 2 days */
function alertsOf(x) {
  const out = [];
  (x.bids || []).filter(a => a.status === 'open').forEach(a => out.push({ g: 'bids', id: a.id, ic: 'bids', tone: a.risk >= 70 ? 'err' : 'warn', title: a.pattern, text: a.detail, risk: a.risk, meta: L.ago(a.at), go: '#marketplace-bids', cta: 'Review bids' }));
  (x.disp || []).filter(d => d.status === 'open').forEach(d => {
    const o = d.orderRec || {}, days = daysTo(d.sla), pay = /pay/.test(d.kind);
    if (!pay && (days == null || days > 2)) return;
    out.push({ g: pay ? 'pay' : 'disp', id: d.id, ic: pay ? 'coin' : 'flag', tone: pay ? 'escrow' : days <= 1 ? 'warn' : 'plain',
      title: pay ? `Payment complaint${o.creatorName ? ' from ' + first(o.creatorName) : ''}` : `Dispute ${(d.ref || d.id.slice(0, 8)).toUpperCase()}${o.brandName && o.creatorName ? ` · ${o.brandName} and ${o.creatorName}` : ''}`,
      text: d.claim, meta: dueTxt(days), urgent: days != null && days <= 1, amt: o.amount, go: '#dispute-' + d.id, cta: pay ? 'Check payout' : 'Arbitrate' });
  });
  return out;
}

export default function Home() {
  const root = useRef(null);
  const rerender = useRerender();
  const r = useLoad(loadAll, []);
  useEffect(() => { refreshCounts(); }, []);
  const x = r.data, s = store.s, u = ui(), now = new Date();
  const first_ = useRef(true);
  useLayoutEffect(() => {
    if (!x || !root.current) return;
    if (first_.current) { first_.current = false; mo('stagger', L.$$('.home-obj, .home-al-i, .home-act-l>li', root.current)); const bar = root.current.querySelector('.home-ac-bar'); bar && requestAnimationFrame(() => bar.classList.add('is-in')); }
    else root.current.querySelectorAll('.home-ac-bar').forEach(b => b.classList.add('is-in', 'is-now'));
  }, [x]);

  let whenStr = '';
  try {
    const tz = { timeZone: 'Asia/Kolkata' };
    whenStr = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short', ...tz }).format(now).replace(',', '') + ' · ' +
      new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, ...tz }).format(now).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase()) + ' IST';
  } catch (e) {}

  const head = lede => (
    <header className="home-hi">
      <p className="home-when">{whenStr}</p>
      <h1 className="home-greet">{`${greeting(now)}${s.me.name ? ', ' + first(s.me.name) : ''}.`}</h1>
      <p className="home-lede">{lede}</p>
    </header>
  );
  if (!x) return <div className="view-in home" ref={root}>{head(r.err ? 'The dashboard did not load.' : 'Loading the dashboard. The Linkloom server can take up to a minute to wake up.')}</div>;

  const d = x.d;
  const crA = d.creatorsActive, brA = d.brandsActive, crS = d.creatorsSuspended, brS = d.brandsSuspended, brUnv = d.brandsUnverified;
  const tot = (crA || 0) + (brA || 0) || 1;
  const live = d.liveOrders, held = d.escrowHeld;
  const phases = Object.keys(PHASE).map(k => [k, d.phases[k] || 0]).filter(p => p[1]);
  const pend = (x.pend || []).filter(v => v.status === 'pending');
  const repOpen = (x.reps || []).filter(rp => rp.status === 'open').sort((a, b) => (b.severity === 'high') - (a.severity === 'high') || b.count - a.count);
  const dOpen = (x.disp || []).filter(dp => dp.status === 'open').sort((a, b) => (Date.parse(a.sla) || Infinity) - (Date.parse(b.sla) || Infinity));
  const al = alertsOf(x), alShown = u.afilter === 'all' ? al : al.filter(a => a.g === u.afilter);
  const tix = (x.tickets || []).sort((a, b) => (b.priority === 'urgent') - (a.priority === 'urgent') || (b.priority === 'high') - (a.priority === 'high') || (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
  const urgentN = (pend.length ? 1 : 0) + (repOpen.length ? 1 : 0) + (dOpen.length ? 1 : 0) + (tix.length ? 1 : 0);
  const cOk = chainOk(x.chain), cN = chainCount(x.chain);
  const gw = x.gatewayPct, cm = x.commissionPct == null ? 0 : x.commissionPct;

  /* ---- urgent actions: three real objects ---- */
  const objs = [];
  if (pend.length) {
    const over = pend.filter(v => hoursSince(v.submitted) > 24).length, flagged = pend.filter(v => vFlags(v, ageFrom).length).length;
    const top = [...pend].sort((a, b) => vFlags(b, ageFrom).length - vFlags(a, ageFrom).length || (Date.parse(a.submitted) || 0) - (Date.parse(b.submitted) || 0)).slice(0, 4);
    objs.push(<li className="home-obj home-vq" key="vq">
      <div className="home-obj-top"><span className="pill pill-info"><Icon n="verified" />{plural(pend.length, 'verification')} waiting</span>{over ? <span className="home-due"><Icon n="clock" />{over} past the 24 h target</span> : null}</div>
      <ul className="home-q">{top.map(v => { const f = vFlags(v, ageFrom), k = v.kind, h = hoursSince(v.submitted); return <li key={v.id}><a className="home-q-a" href={`#verify-${v.id}`}>
        <HAv name={v.name} kind={k} /><span className="home-q-t"><b className={`is-${k}`}>{v.name}</b><span>{k === 'brand' ? 'Brand · GSTIN, PAN, signatory' : 'Creator · ID, PAN, bank, socials'}</span></span>
        <span className="home-q-m">{f.length ? <span className="pill pill-err"><Icon n="alert" />{f[0]}{f.length > 1 ? ` +${f.length - 1}` : ''}</span> : null}<span className={`home-q-age num ${h > 24 ? 'is-late' : ''}`}>{!v.submitted ? '' : h < 1 ? 'just now' : h < 24 ? Math.round(h) + ' h' : Math.floor(h / 24) + ' d ' + Math.round(h % 24) + ' h'}</span></span></a></li>; })}</ul>
      <div className="home-obj-act"><Lq as="a" className="lq-p lq-sm" href="#verify">Open the desk</Lq>{flagged ? <span className="home-obj-foot">{plural(flagged, 'has', 'have')} a problem to look at</span> : null}</div>
    </li>);
  }
  if (repOpen.length) {
    objs.push(<li className="home-obj home-rep" key="rep">
      <div className="home-obj-top"><span className="pill pill-err"><Icon n="flag" />{plural(repOpen.length, 'open report')}</span><span className="home-due">{repOpen.reduce((n, rp) => n + rp.count, 0)} flags in total</span></div>
      <ul className="home-rl">{repOpen.slice(0, 3).map(rp => <li key={rp.id}><a className="home-rl-a" href={`#report-${rp.id}`}>
        <span className={`home-sev is-${rp.severity}`}><i></i><i></i><i></i><span className="sr-only">{rp.severity} severity</span></span>
        <span className="home-rl-t"><span className="home-rl-k">{rp.type} · {rp.count > 1 ? `${rp.count} reports` : `by ${rp.by}`}</span><b>{rp.reason}</b>{rp.excerpt ? <q>{rp.excerpt}</q> : <span className="home-rl-x">{rp.target}</span>}</span></a></li>)}</ul>
      <div className="home-obj-act"><Lq as="a" className="lq-p lq-sm" href="#moderation">Review reports</Lq></div>
    </li>);
  }
  if (dOpen.length) {
    const dp = dOpen[0], o = dp.orderRec || {}, days = daysTo(dp.sla);
    objs.push(<li className="home-obj home-disp ink-card dark" key="disp">
      <div className="home-obj-top"><span className="pill pill-butter"><Icon n="clock" />{dueTxt(days)}</span><span className="home-disp-id num">{(dp.ref || dp.id.slice(0, 8)).toUpperCase()} · opened by {dp.by}</span></div>
      {o.brandName || o.creatorName ? <p className="home-disp-who"><span className="is-brand">{o.brandName}</span> <span aria-hidden="true">×</span><span className="sr-only">and</span> <span className="is-creator">{o.creatorName}</span></p> : null}
      <p className="home-disp-c">{`“${dp.claim}”`}</p>
      {o.amount ? <p className="t-money home-disp-v">{L.inr(o.amount)}</p> : null}
      <p className="home-disp-s"><span className="pill pill-escrow"><Icon n="lock" />Held in escrow</span><span>{o.title}</span></p>
      <div className="home-obj-act"><Lq as="a" className="lq-p lq-sm" href={`#dispute-${dp.id}`}>Arbitrate</Lq>{dOpen.length > 1 ? <a className="btn-q" href="#orders-disputes">+{dOpen.length - 1} more open</a> : null}</div>
      <p className="home-disp-f">Force release or refund, each with a reason on record.</p>
    </li>);
  }

  if (tix.length) {
    objs.push(<li className="home-obj home-rep" key="sup">
      <div className="home-obj-top"><span className="pill pill-info"><Icon n="chat" />{plural(tix.length, 'open ticket')}</span>{tix.some(t => t.priority === 'urgent' || t.priority === 'high') ? <span className="home-due"><Icon n="alert" />{tix.filter(t => t.priority === 'urgent' || t.priority === 'high').length} high priority</span> : null}</div>
      <ul className="home-rl">{tix.slice(0, 3).map(t => <li key={t.id}><a className="home-rl-a" href={`#ticket-${t.id}`}>
        <span className={`home-sev is-${t.priority === 'urgent' || t.priority === 'high' ? 'high' : t.priority === 'low' ? 'low' : 'medium'}`}><i></i><i></i><i></i><span className="sr-only">{t.priority} priority</span></span>
        <span className="home-rl-t"><span className="home-rl-k">{[t.role, t.who].filter(Boolean).join(' · ')}{t.at ? ' · ' + L.ago(t.at) : ''}</span><b>{t.subject}</b></span></a></li>)}</ul>
      <div className="home-obj-act"><Lq as="a" className="lq-p lq-sm" href="#support">Open support</Lq></div>
    </li>);
  }

  const n = v => (v == null ? '—' : v);
  return (
    <div className="view-in home" ref={root}>
      {head(<>{urgentN ? `${WORDS[urgentN]} ${urgentN === 1 ? 'needs' : 'need'} a decision today${al.length ? `, and ${plural(al.length, 'alert')} to read` : ''}.` : 'Nothing is waiting on you. The desks are clear.'}{' '}
        <button className="btn-q" type="button" onClick={() => { refreshCounts(); r.reload(); }}><Icon n="refund" />Refresh</button></>)}

      <section className="home-band" aria-label="Platform at a glance">
        <dl className="home-nums">
          <div className="home-ac"><dt>Active creators and brands</dt>
            <dd className="home-ac-n"><Count className="t-money is-creator" value={crA} fmt={v => (v == null ? '—' : String(Math.round(v)))} /><span className="home-ac-vs" aria-hidden="true">/</span><Count className="t-money is-brand" value={brA} fmt={v => (v == null ? '—' : String(Math.round(v)))} />
              <span className="sr-only">{`: ${plural(crA || 0, 'active creator')} and ${plural(brA || 0, 'active brand')}`}</span></dd>
            <div className="home-ac-bar" role="img" aria-label={`${Math.round((crA || 0) / tot * 100)}% creators, ${Math.round((brA || 0) / tot * 100)}% brands`}><i className="is-creator" style={{ flexGrow: crA || 0 }}></i><i className="is-brand" style={{ flexGrow: brA || 0 }}></i></div>
            <p className="home-num-s"><span className="home-key is-creator"></span>Creators{crS ? ` · ${crS} suspended` : ''}<span className="home-key is-brand"></span>Brands{brUnv ? ` · ${brUnv} not verified` : ''}{brS ? ` · ${brS} suspended` : ''}</p></div>
          <div><dt>Live orders in progress</dt><dd><Count className="t-money" value={live} fmt={v => (v == null ? '—' : String(Math.round(v)))} /></dd>
            <p className="home-num-s home-ph">{phases.map(([k, c]) => <span className={`home-ph-i ${k === 'disputed' ? 'is-hot' : ''}`} key={k}><b className="num">{c}</b> {PHASE[k].toLowerCase()}</span>)}</p></div>
          <div><dt>Escrow balance</dt><dd><Count className="t-money" value={held} fmt={v => (v == null ? '—' : L.inr(v))} /></dd>
            <p className="home-num-s"><span className="pill pill-escrow"><Icon n="lock" />Held for {plural(n(live) === '—' ? 0 : live, 'order')}</span></p></div>
        </dl>
        <div className="home-comm">
          <p><b>Commission {L.inr(0)}</b> · No commission under the subscription model <span className="pill pill-line home-comm-r">Rate {cm}%</span></p>
          <p className="home-comm-s">Gateway fees{gw != null ? ` (${gw}%)` : ''} are a Linkloom cost, never charged to brands or creators. {can('finance') ? <a className="btn-q" href="#finance">Financials<Icon n="arrow" /></a> : null}</p>
        </div>
      </section>

      <section className="home-today" aria-labelledby="homeUrgH">
        <div className="home-sec-h"><h2 className="t-h2" id="homeUrgH">Urgent actions</h2></div>
        {objs.length ? <ul className={`home-strip home-strip-${Math.min(objs.length, 3)}`}>{objs}</ul>
          : <div className="empty home-empty"><img src="assets/step-05-stamp.svg" width="160" height="117" alt="" /><p className="t-h3">The desks are clear.</p><p className="muted">Verifications, reports and disputes show up here as they arrive.</p></div>}
      </section>

      <div className="home-two">
        <section className="home-al" aria-labelledby="homeAlH">
          <div className="home-sec-h"><div><h2 className="t-h2" id="homeAlH">Alerts</h2><p className="muted t-small">Bid patterns the system flagged, payment complaints and disputes due within 2 days.</p></div></div>
          <div className="home-al-f chips" role="group" aria-label="Show alerts">{GROUPS.map(([k, t]) => { const c = k === 'all' ? al.length : al.filter(a => a.g === k).length; return <button className="chip" type="button" key={k} aria-pressed={u.afilter === k} onClick={() => { u.afilter = k; rerender(); requestAnimationFrame(() => mo('stagger', L.$$('.home-al-i', root.current))); }}>{t} <span className="num home-chip-n">{c}</span></button>; })}</div>
          {alShown.length ? <ul className="home-al-l" aria-live="polite">{alShown.map(a => <li className="home-al-i" key={a.g + a.id}>
            <span className={`home-al-ic is-${a.tone}`} aria-hidden="true"><Icon n={a.tone === 'err' ? 'alert' : a.ic} /></span>
            <div className="home-al-t"><p className="home-al-h"><b>{a.title}</b>{a.risk != null ? <span className={`home-risk ${a.risk >= 70 ? 'is-hi' : ''}`} role="img" aria-label={`Risk ${a.risk} of 100`}><span className="home-risk-b"><i style={{ width: a.risk + '%' }}></i></span><span className="num">{a.risk}</span></span> : null}</p>
              <p className="home-al-s">{a.text}</p>
              <p className="home-al-m"><span className={a.urgent ? 'is-urgent' : ''}><Icon n="clock" />{a.meta}</span>{a.amt ? <span className="pill pill-escrow"><Icon n="lock" />{L.inr(a.amt)}</span> : null}</p></div>
            <a className="btn-q home-al-go" href={a.go}>{a.cta}<Icon n="arrow" /></a></li>)}</ul>
            : <p className="home-al-none muted">No alerts of this kind right now.</p>}
        </section>

        {x.audit ? <section className="home-act card" aria-labelledby="homeActH">
          <div className="home-act-h"><h2 className="t-h3" id="homeActH">Recent activity</h2><a className="btn-q" href="#audit">Audit log<Icon n="arrow" /></a></div>
          {x.audit.length ? <ol className="home-act-l">{x.audit.slice(0, 5).map((e, i) => { const isMe = e.who === s.me.name || (s.me.email && e.who === s.me.email); return <li key={e.id || i}>
            <HAv name={e.who} kind={isMe ? 'me' : 'admin'} />
            <div className="home-act-t"><p><b>{isMe ? 'You' : first(e.who)}</b> {auditLabel(e.action).toLowerCase()}</p><p className="home-act-x">{e.target}</p></div>
            <span className="home-act-at num">{L.ago(e.at)}</span></li>; })}</ol> : <p className="muted">No admin actions yet.</p>}
          {cOk != null ? <p className={`home-act-f ${cOk ? 'is-ok' : 'is-bad'}`}><Icon n={cOk ? 'shield' : 'alert'} /><span>{cOk ? `Chain intact${cN != null ? ` · ${plural(cN, 'sealed entry', 'sealed entries')}` : ''}` : `Chain broken${x.chain && x.chain.brokenAt ? ` at ${x.chain.brokenAt}` : ''}`}</span></p> : null}
        </section> : null}
      </div>
    </div>
  );
}

L.register('home', { title: 'Command', nav: 'home', Component: Home });
