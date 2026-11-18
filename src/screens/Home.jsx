/* Command (#home): the admin dashboard.
   - GET /v1/admin/system/dashboard/  platform health, escrow totals, pending queues, audit chain status
   - GET /v1/admin/system/counts/     queue counts (the same numbers as the side-menu badges)
   The dashboard's exact field names are not in the guide, so every group it returns is shown as it came, with
   money fields (integer paise) formatted as rupees. Creators coral, brands violet. */
import { useEffect, useRef } from 'react';
import L, { store } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { api, label, isMoneyKey, can } from '../lib/admin.js';
import { live, countOf, refreshCounts, setEscrow } from '../lib/live.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { useLoad, useStagger, Fields, Failed, inr, fmt } from '../components/Admin.jsx';

const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const plural = (n, a, b) => `${n} ${n === 1 ? a : (b || a + 's')}`;

function greeting(now) {
  let h = 12; try { h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(now)) % 24; } catch (e) {}
  return h < 4 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 23 ? 'Good evening' : 'Up late';
}

/* the queues an admin works, and where each one lives */
const QUEUES = [
  ['verify', 'Verifications waiting', [/verification/i, /kyc/i], '#verify', 'verified', 'verify'],
  ['campaigns', 'Campaigns to review', [/campaign/i], '#marketplace-campaigns', 'brief', 'campaigns'],
  ['reports', 'Abuse reports', [/abuse|report/i], '#moderation', 'flag', 'moderation'],
  ['bids', 'Bid alerts', [/bid.?alert/i], '#marketplace-bids', 'bids', 'moderation'],
  ['reviews', 'Flagged reviews', [/review/i], '#marketplace-reviews', 'star', 'moderation'],
  ['disputes', 'Open disputes', [/dispute/i], '#orders-disputes', 'alert', 'finance']
];

/* the audit chain's state, wherever the dashboard puts it */
function chainOf(d) {
  if (!d || typeof d !== 'object') return null;
  const k = Object.keys(d).find(x => /audit|chain/i.test(x));
  if (!k) return null;
  const v = d[k];
  const ok = typeof v === 'boolean' ? v : v && typeof v === 'object' ? (v.valid ?? v.ok ?? v.intact ?? (typeof v.status === 'string' ? /ok|valid|intact|healthy/i.test(v.status) : null)) : typeof v === 'string' ? /ok|valid|intact|healthy/i.test(v) : null;
  return { ok, v };
}

export default function Home() {
  const root = useRef(null);
  const rerender = useRerender();
  const dash = useLoad(() => api.dashboard().then(d => { setEscrow(d); return d; }), []);
  useEffect(() => { refreshCounts(); return store.on(why => { if (why === 'live') rerender(); }); }, []);
  useStagger(root, '.home-obj, .adm-card, .adm-band>div', [!!dash.data]);

  const s = store.s, now = new Date(), lv = live(), counts = lv.counts || {};
  const cReady = lv.cstatus === 'ready';
  let whenStr = '';
  try {
    const tz = { timeZone: 'Asia/Kolkata' };
    whenStr = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short', ...tz }).format(now).replace(',', '') + ' · ' +
      new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, ...tz }).format(now).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase()) + ' IST';
  } catch (e) {}

  /* prefer the dashboard's pending-queue numbers, fall back to counts */
  const src = { ...(dash.data || {}), ...counts };
  const qs = QUEUES.map(([k, t, pats, href, ic, area]) => ({ k, t, href, ic, area, n: pats.reduce((n, p) => n || countOf(src, p), 0) }));
  const waiting = qs.filter(q => q.n && can(q.area));
  const total = waiting.reduce((n, q) => n + q.n, 0);
  const lede = !cReady && !dash.data ? (lv.cstatus === 'failed' && dash.err ? 'The dashboard did not load.' : 'Loading the dashboard.')
    : total ? `${plural(total, 'item')} ${total === 1 ? 'is' : 'are'} waiting for a decision.` : 'Nothing is waiting for a decision.';

  const d = dash.data && typeof dash.data === 'object' ? dash.data : null;
  const chain = chainOf(d);
  /* headline money: top-level and one level down, money-named numbers only */
  const money = [];
  if (d) for (const [k, v] of Object.entries(d)) {
    if (typeof v === 'number' && isMoneyKey(k)) money.push([label(k), v]);
    else if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v)) if ((typeof v2 === 'number' || (v2 && typeof v2 === 'object' && 'amount' in v2)) && isMoneyKey(k2)) money.push([`${label(k)} · ${label(k2)}`, v2]);
  }
  const groups = d ? Object.entries(d).filter(([k, v]) => v && typeof v === 'object' && !Array.isArray(v) && !/audit|chain/i.test(k)) : [];
  const loose = d ? Object.fromEntries(Object.entries(d).filter(([k, v]) => (v == null || typeof v !== 'object') && !(typeof v === 'number' && isMoneyKey(k)))) : {};

  return (
    <div className="view-in home adm no-anchor" ref={root}>
      <header className="home-hi">
        <p className="home-when">{whenStr}</p>
        <h1 className="home-greet">{`${greeting(now)}${s.me.name ? ', ' + first(s.me.name) : ''}.`}</h1>
        <p className="home-lede">{lede}</p>
      </header>

      <section aria-labelledby="homeQ">
        <div className="home-sec-h"><h2 className="t-h2" id="homeQ">Queues</h2><button className="btn-q" type="button" onClick={() => { refreshCounts(); dash.reload(); }}><Icon n="refund" />Refresh</button></div>
        <dl className="adm-band">{qs.map(q => (
          <div key={q.k}><a href={q.href} aria-label={`${q.t}: ${cReady || d ? q.n : 'loading'}. Open`}>
            <dt><Icon n={q.ic} className="ic" /> {q.t}</dt><dd>{cReady || d ? q.n : '—'}</dd>
            <p>{!can(q.area) ? 'Not in your role' : q.n ? 'Open the queue' : 'Clear'}</p></a></div>))}</dl>
      </section>

      {dash.err ? <Failed err={dash.err} retry={dash.reload} what="The dashboard" /> : null}

      {money.length ? <section aria-labelledby="homeM">
        <div className="home-sec-h"><h2 className="t-h2" id="homeM">Escrow and money</h2>{can('finance') ? <Lq as="a" className="lq-s lq-sm" href="#finance">Financials</Lq> : null}</div>
        <dl className="adm-band">{money.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{inr(v)}</dd></div>)}</dl>
      </section> : null}

      {chain ? <section aria-labelledby="homeA">
        <div className="home-sec-h"><h2 className="t-h2" id="homeA">Audit chain</h2>{can('audit') ? <Lq as="a" className="lq-s lq-sm" href="#audit">Audit log</Lq> : null}</div>
        <div className={`adm-chain ${chain.ok === true ? 'is-ok' : chain.ok === false ? 'is-err' : 'is-idle'}`}><Icon n={chain.ok === false ? 'alert' : 'shield'} />
          <div><b>{chain.ok === true ? 'The hash chain is intact.' : chain.ok === false ? 'The hash chain does not verify.' : 'Audit chain status'}</b>
            {chain.v && typeof chain.v === 'object' ? <Fields obj={chain.v} /> : null}</div></div>
      </section> : null}

      {d ? <section aria-labelledby="homeH">
        <div className="home-sec-h"><h2 className="t-h2" id="homeH">Platform health</h2></div>
        <div className="grid-2 adm-grid2">
          {Object.keys(loose).length ? <section className="card adm-card"><h3 className="t-h3">Overview</h3><Fields obj={loose} /></section> : null}
          {groups.map(([k, v]) => <section className="card adm-card" key={k}><h3 className="t-h3">{label(k)}</h3><Fields obj={v} /></section>)}
          {Object.entries(d).filter(([, v]) => Array.isArray(v)).map(([k, v]) => <section className="card adm-card" key={k}><h3 className="t-h3">{label(k)}</h3>
            {v.length ? <ul className="stack">{v.slice(0, 8).map((x, i) => <li key={i}>{x && typeof x === 'object' ? <Fields obj={x} /> : fmt(k, x)}</li>)}</ul> : <p className="muted">None.</p>}</section>)}
        </div>
      </section> : dash.loading ? <div className="empty"><p className="t-h3">Loading the dashboard</p><p className="muted">The Linkloom server can take up to a minute to wake up.</p></div> : null}

      {!waiting.length && (cReady || d) ? <div className="empty home-empty"><img src="assets/step-05-stamp.svg" width="160" height="117" alt="" /><p className="t-h3">All queues are clear.</p><p className="muted">New verifications, reports and disputes show up here as they come in.</p></div> : null}
    </div>
  );
}

L.register('home', { title: 'Command', nav: 'home', Component: Home });
