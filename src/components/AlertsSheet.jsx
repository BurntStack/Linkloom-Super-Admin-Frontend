/* The bell in the top bar: admin-wide alerts from GET /v1/admin/system/notifications/ (new verifications, reports,
   disputes, bid patterns). Opening one marks it read (POST .../{id}/read/) and goes to its desk; "Mark all read" sends
   POST .../read-all/. Opening an alert takes no action by itself; that happens on the desk, with a reason. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import L, { data, store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { ensure, reload, state, act, why } from '../lib/admin.js';
import Icon from './Icon.jsx';

const IC = { verify: 'verified', report: 'flag', dispute: 'alert', bids: 'bids', info: 'bell' };
const ui = () => (data.ui.alerts = data.ui.alerts || { nfilter: 'all' });

function Alerts() {
  const box = useRef(null);
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ensure(['notifications']); reload(['notifications']); return store.on(w => { if (w === 'live') bump(n => n + 1); }); }, []);
  const st = state('notifications'), list = data.notifications, u = ui();
  useLayoutEffect(() => { if (st.loaded) mo('stagger', L.$$('.home-nt li', box.current)); }, [st.loaded]);
  if (!st.loaded && st.status === 'failed') return <div className="empty home-nt-empty"><p className="t-h2">Alerts did not load.</p><p className="muted">{st.error}</p></div>;
  if (!st.loaded && st.status === 'forbidden') return <div className="empty home-nt-empty"><p className="t-h2">No alerts for your role.</p></div>;
  if (!st.loaded) return <div className="empty home-nt-empty"><p className="t-h2">Loading alerts</p></div>;
  const unread = list.filter(n => !n.read).length;
  if (u.nfilter === 'unread' && !unread) u.nfilter = 'all';
  const shown = u.nfilter === 'unread' ? list.filter(n => !n.read) : list;
  const allRead = async () => {
    setBusy(true);
    try { await act.readAllNotifications(); await reload(['notifications', 'counts']); L.toast('All marked as read', 'check'); }
    catch (e) { L.toast(why(e), 'alert'); }
    setBusy(false);
  };
  const open = n => e => {
    if (!n.read) act.readNotification(n.id).then(() => reload(['notifications', 'counts'])).catch(() => {});
    if (!n.go) { e.preventDefault(); return; }
    L.closeSheet(true);
  };
  const setF = k => () => { u.nfilter = k; bump(x => x + 1); };
  return (
    <div ref={box} style={{ display: 'contents' }}>
      {list.length ? <>
        <div className="home-nt-h">
          <div className="seg" role="group" aria-label="Show">{[['all', 'All'], ['unread', 'Unread']].map(([k, t]) => <button type="button" key={k} aria-pressed={u.nfilter === k} onClick={setF(k)}>{t}{k === 'unread' && unread ? ` ${unread}` : ''}</button>)}</div>
          <button className="btn-q" type="button" data-allread="" disabled={!unread || busy} aria-disabled={!unread || busy ? 'true' : undefined} onClick={allRead}><Icon n="check" />Mark all read</button></div>
        <ul className="home-nt">{shown.map(n => (
          <li className={n.read ? '' : 'is-unread'} key={n.id}>
            <a className="home-nt-i" href={n.go || '#'} onClick={open(n)}>
              <span className={`home-nt-ic ${n.kind === 'info' ? 'is-plain' : 'is-' + n.kind}`} aria-hidden="true"><Icon n={IC[n.kind] || 'bell'} /></span>
              <span className="home-nt-t"><span className="home-nt-txt">{n.text}</span><span className="home-nt-at">{L.ago(n.at)}{n.read ? null : <span className="sr-only">, unread</span>}</span></span>
              <span className="home-nt-dot" aria-hidden="true"></span>
            </a>
          </li>))}</ul>
      </> : <div className="empty home-nt-empty"><img src="assets/step-01-envelope.svg" width="140" height="103" alt="" /><p className="t-h2">No alerts.</p><p className="muted">New verifications, reports, disputes and bid patterns show up here.</p></div>}
      <p className="home-nt-foot">Opening an alert doesn't take any action; that happens on the desk, with a reason.</p>
    </div>
  );
}

export function openAlerts() {
  L.openSheet({ title: 'Alerts', body: <Alerts /> });
}
