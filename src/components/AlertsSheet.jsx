/* The bell in the top bar, as designed (artifact screens/home.js, openAlerts): All / Unread, Mark all read,
   grouped Today / Yesterday / Earlier, a per-alert "mark as read", kind icons and tones.
   GET /v1/admin/system/notifications/ · POST .../<id>/read/ · POST .../read-all/
   Opening an alert never takes an action; that happens on the desk, with a reason. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import L, { data } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { fetchNotifications, readNotification, readAllNotifications } from '../lib/live.js';
import { errText } from './Admin.jsx';
import Icon from './Icon.jsx';

const KIND = { verify: ['verified', 'Verification', 'plain'], report: ['flag', 'Report', 'err'], dispute: ['lock', 'Dispute', 'escrow'], bids: ['bids', 'Bid pattern', 'warn'],
  payment: ['coin', 'Payment', 'escrow'], campaign: ['brief', 'Campaign', 'plain'], audit: ['shield', 'Audit', 'plain'] };
const kindOf = n => {
  const k = `${n.kind} ${n.link} ${n.text}`.toLowerCase();
  const key = /verif|kyc/.test(k) ? 'verify' : /report|abuse|flag/.test(k) ? 'report' : /dispute/.test(k) ? 'dispute' : /bid/.test(k) ? 'bids' : /pay|refund|escrow|order/.test(k) ? 'payment' : /campaign|brief/.test(k) ? 'campaign' : /audit|chain/.test(k) ? 'audit' : '';
  return KIND[key] || ['bell', 'Update', 'plain'];
};
const groupOf = at => { const t = Date.parse(at); if (!Number.isFinite(t)) return 'Earlier'; const d = Math.floor((Date.now() + 19800000) / 864e5) - Math.floor((t + 19800000) / 864e5); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : 'Earlier'; };
const ui = () => (data.ui.alerts = data.ui.alerts || { f: 'all' });

function Alerts({ close }) {
  const box = useRef(null);
  const [st, setSt] = useState({ list: null, err: '' });
  const [f, setF] = useState(ui().f);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  useEffect(() => {
    let on = true;
    fetchNotifications().then(list => on && setSt({ list: list.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)), err: '' }), e => on && setSt({ list: null, err: errText(e) }));
    return () => { on = false; };
  }, []);
  useLayoutEffect(() => { if (st.list && box.current) mo('stagger', L.$$('.home-nt li', box.current)); }, [!!st.list, f]);
  const setFilter = v => { ui().f = v; setF(v); };
  const markLocal = id => setSt(s => ({ ...s, list: s.list.map(x => (id == null || x.id === id ? { ...x, read: true } : x)) }));

  if (st.err) return <div className="empty home-nt-empty"><img src="assets/step-04-orbit.svg" width="140" height="103" alt="" /><p className="t-h2">Alerts did not load.</p><p className="muted">{st.err}</p></div>;
  if (!st.list) return <div className="empty home-nt-empty"><p className="t-h2">Loading alerts</p></div>;
  const all = st.list, unread = all.filter(n => !n.read).length;
  if (!all.length) return <div className="empty home-nt-empty"><img src="assets/step-01-envelope.svg" width="140" height="103" alt="" /><p className="t-h2">All quiet.</p><p className="muted">New verifications, reports, disputes and bid patterns land here.</p></div>;
  const list = f === 'unread' ? all.filter(n => !n.read) : all, groups = [];
  list.forEach(n => { const g = groupOf(n.at); let G = groups.find(x => x.g === g); if (!G) groups.push(G = { g, items: [] }); G.items.push(n); });

  const allRead = async () => {
    setBusy(true);
    try { await readAllNotifications(); markLocal(null); L.toast('All marked as read', 'check'); } catch (e) { L.toast(errText(e), 'alert'); }
    setBusy(false);
  };
  const mark = n => async () => {
    markLocal(n.id); setLive('Marked as read');
    try { await readNotification(n.id); } catch (e) { L.toast(errText(e), 'alert'); }
  };
  const open = n => () => {
    if (!n.read) { markLocal(n.id); readNotification(n.id).catch(() => {}); }
    if (n.link) { close(true); L.go(n.link); }
  };

  return (
    <div ref={box} style={{ display: 'contents' }}>
      <div className="home-nt-h">
        <div className="seg home-nt-seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={f === 'all'} onClick={() => setFilter('all')}>All</button>
          <button type="button" aria-pressed={f === 'unread'} onClick={() => setFilter('unread')}>Unread{unread ? <> <span className="num">{unread}</span></> : null}</button>
        </div>
        <button className="btn-q" type="button" disabled={!unread || busy} aria-disabled={!unread || busy ? 'true' : undefined} onClick={allRead}><Icon n="check" />Mark all read</button>
      </div>
      <p className="sr-only" aria-live="polite">{live || (unread ? `${unread} unread` : 'All caught up')}</p>
      {list.length ? groups.map(G => (
        <section className="home-nt-g" aria-label={G.g} key={G.g}><h3 className="t-eyebrow">{G.g}</h3>
          <ul className="home-nt">{G.items.map(n => { const [ic, lbl, tone] = kindOf(n); return (
            <li className={n.read ? '' : 'is-unread'} key={n.id}>
              <button className="home-nt-i" type="button" onClick={open(n)}>
                <span className={`home-nt-ic is-${tone}`} aria-hidden="true"><Icon n={ic} /></span>
                <span className="home-nt-t"><span className="home-nt-txt">{n.text}</span>{n.body ? <span className="home-nt-at">{n.body}</span> : null}
                  <span className="home-nt-at">{lbl} · {L.ago(n.at)}{n.read ? null : <span className="sr-only">, unread</span>}</span></span>
                <span className="home-nt-dot" aria-hidden="true"></span>
              </button>
              {n.read ? null : <button className="ibtn home-nt-mark" type="button" aria-label={`Mark as read: ${n.text}`} title="Mark as read" onClick={mark(n)}><Icon n="check" /></button>}
            </li>); })}</ul>
        </section>))
        : <div className="home-nt-none"><p className="t-h3">No unread alerts</p><p className="muted">You've seen everything. <button type="button" className="btn-q" onClick={() => setFilter('all')}>Show all</button></p></div>}
      <p className="home-nt-foot">Opening an alert doesn't take any action; that happens on the desk, with a reason.</p>
    </div>
  );
}

export function openAlerts() {
  L.openSheet({ title: 'Alerts', body: ({ close }) => <Alerts close={close} /> });
}
