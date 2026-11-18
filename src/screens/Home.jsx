/* Command (#home): the dashboard, from what the API can answer today.
   - creators (GET /v1/creators/), open campaigns (GET /v1/campaigns/), pending verifications (GET /v1/admin/verifications/)
   - the top of the verification queue
   Reports, disputes, escrow, alerts and the audit trail have no endpoint yet, so the screen says so.
   Creators coral, brands violet. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import L, { store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import { live, ensureLive, ensureVerifications, sinceNow } from '../lib/live.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import Count from '../components/Count.jsx';
import { NotConnectedNote } from '../components/NotConnected.jsx';

const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const plural = (n, a, b) => `${n} ${n === 1 ? a : (b || a + 's')}`;
const round = v => String(Math.round(v));
const Av = ({ name, kind }) => <span className={`home-av is-${kind}`} aria-hidden="true">{(String(name || '?').trim()[0] || '?').toUpperCase()}</span>;

/* ---------- greeting by IST time ---------- */
function greeting(now) {
  let h = 12; try { h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(now)) % 24; } catch (e) {}
  return h < 4 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 23 ? 'Good evening' : 'Up late';
}

function VerifyQueue({ pend }) {
  const rows = pend.slice(0, 4);
  return (
    <li className="home-obj home-vq">
      <div className="home-obj-top"><span className="pill pill-info"><Icon n="verified" />{`${plural(pend.length, 'verification')} waiting`}</span></div>
      <ul className="home-q">{rows.map(v => (
        <li key={v.id}><a className="home-q-a" href={`#verify-${v.id}`}>
          <Av name={v.name} kind={v.kind} /><span className="home-q-t"><b className={`is-${v.kind}`}>{v.name}</b><span>{v.kind === 'brand' ? 'Brand verification' : 'Creator KYC'}</span></span>
          <span className="home-q-m"><span className="home-q-age num">{sinceNow(v.submittedAt)}</span></span></a></li>))}</ul>
      <div className="home-obj-act"><Lq as="a" className="lq-p lq-sm" href="#verify">Open the desk</Lq></div>
    </li>
  );
}

export default function Home() {
  const root = useRef(null);
  const rerender = useRerender();
  useEffect(() => { ensureLive(); ensureVerifications(); return store.on(why => { if (why === 'live') rerender(); }); }, []);
  const lv = live();
  const pubReady = lv.status === 'ready', vReady = lv.vstatus === 'ready';
  useLayoutEffect(() => { mo('stagger', L.$$('.home-obj', root.current)); }, [vReady]);

  const s = store.s, now = new Date();
  let when = '';
  try {
    const tz = { timeZone: 'Asia/Kolkata' };
    when = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short', ...tz }).format(now).replace(',', '') + ' · ' +
      new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, ...tz }).format(now).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase()) + ' IST';
  } catch (e) {}

  const creators = pubReady ? lv.creators : [], verified = creators.filter(c => c.verified).length;
  const campaigns = pubReady ? lv.campaigns : [];
  const pend = vReady ? lv.verifications.filter(v => v.status === 'pending') : [];
  const lede = !vReady ? (lv.vstatus === 'failed' ? 'The verification queue did not load.' : 'Loading the verification queue.')
    : pend.length ? `${plural(pend.length, 'verification')} ${pend.length === 1 ? 'is' : 'are'} waiting for a decision.` : 'No verifications are waiting.';
  const num = (ready, n) => (ready ? <Count as="dd" className="t-money" value={n} fmt={round} /> : <dd className="t-money">—</dd>);

  return (
    <div className="view-in home no-anchor" ref={root}>
      <header className="home-hi">
        <p className="home-when">{when}</p>
        <h1 className="home-greet">{`${greeting(now)}${s.me.name ? ', ' + first(s.me.name) : ''}.`}</h1>
        <p className="home-lede">{lede}</p>
      </header>

      <section className="home-band" aria-label="Platform at a glance">
        <dl className="home-nums">
          <div><dt>Creators</dt>{num(pubReady, creators.length)}
            <p className="home-num-s">{pubReady ? `${verified} verified · ${creators.length - verified} not verified` : lv.status === 'failed' ? 'Did not load' : 'Loading'}</p></div>
          <div><dt>Open campaigns</dt>{num(pubReady, campaigns.length)}
            <p className="home-num-s">{pubReady ? `${campaigns.reduce((n, c) => n + c.bids, 0)} bids placed` : lv.status === 'failed' ? 'Did not load' : 'Loading'}</p></div>
          <div><dt>Verifications waiting</dt>{num(vReady, pend.length)}
            <p className="home-num-s">{vReady ? `${lv.verifications.length - pend.length} decided` : lv.vstatus === 'failed' ? 'Did not load' : 'Loading'}</p></div>
        </dl>
      </section>

      <section className="home-today" aria-labelledby="homeUrgH">
        <div className="home-sec-h"><h2 className="t-h2" id="homeUrgH">Urgent actions</h2></div>
        {vReady && pend.length ? <ul className="home-strip home-strip-1"><VerifyQueue pend={pend} /></ul>
          : vReady ? <div className="empty home-empty"><img src="assets/step-05-stamp.svg" width="160" height="117" alt="" /><p className="t-h3">No verifications are waiting.</p><p className="muted">New KYC requests show up here as creators and brands submit them.</p></div>
          : null}
      </section>

      <section aria-labelledby="homeMoreH">
        <div className="home-sec-h"><h2 className="t-h2" id="homeMoreH">Reports, disputes and escrow</h2></div>
        <NotConnectedNote what="This part of the dashboard" needs={['GET /v1/admin/dashboard/', 'GET /v1/admin/abuse-reports/', 'GET /v1/admin/disputes/', 'GET /v1/admin/audit-log/']} />
      </section>
    </div>
  );
}

L.register('home', { title: 'Command', nav: 'home', Component: Home });
