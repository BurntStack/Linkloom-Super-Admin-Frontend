/* The bell in the top bar: the signed-in admin's own notifications, from the website's /v1/notifications/.
   Admin-wide alerts (new verifications, reports, disputes, bid patterns) have no endpoint yet. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import L from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { fetchNotifications, readAllNotifications, sinceNow } from '../lib/live.js';
import Icon from './Icon.jsx';

function Alerts() {
  const box = useRef(null);
  const [st, setSt] = useState({ list: null, err: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let on = true;
    fetchNotifications().then(list => on && setSt({ list, err: '' }), e => on && setSt({ list: null, err: (e && e.message) || 'They did not load.' }));
    return () => { on = false; };
  }, []);
  useLayoutEffect(() => { if (st.list) mo('stagger', L.$$('.home-nt li', box.current)); }, [!!st.list]);
  const unread = st.list ? st.list.filter(n => !n.read).length : 0;
  const allRead = async () => {
    setBusy(true);
    try { await readAllNotifications(); setSt(s => ({ ...s, list: s.list.map(n => ({ ...n, read: true })) })); L.toast('All marked as read', 'check'); }
    catch (e) { L.toast('That didn\'t go through. Try again.', 'alert'); }
    setBusy(false);
  };
  if (st.err) return <div className="empty home-nt-empty"><p className="t-h2">Notifications did not load.</p><p className="muted">{st.err}</p></div>;
  if (!st.list) return <div className="empty home-nt-empty"><p className="t-h2">Loading notifications</p></div>;
  return (
    <div ref={box} style={{ display: 'contents' }}>
      {st.list.length ? <>
        <div className="home-nt-h"><span className="muted">{unread ? `${unread} unread` : 'All caught up'}</span>
          <button className="btn-q" type="button" data-allread="" disabled={!unread || busy} aria-disabled={!unread || busy ? 'true' : undefined} onClick={allRead}><Icon n="check" />Mark all read</button></div>
        <ul className="home-nt">{st.list.map(n => (
          <li className={n.read ? '' : 'is-unread'} key={n.id}>
            <a className="home-nt-i" href={n.link && n.link.startsWith('#') ? n.link : undefined} onClick={() => L.closeSheet()}>
              <span className="home-nt-ic is-plain" aria-hidden="true"><Icon n="bell" /></span>
              <span className="home-nt-t"><span className="home-nt-txt">{n.text}</span><span className="home-nt-at">{sinceNow(n.at)}{n.read ? null : <span className="sr-only">, unread</span>}</span></span>
              <span className="home-nt-dot" aria-hidden="true"></span>
            </a>
          </li>))}</ul>
      </> : <div className="empty home-nt-empty"><img src="assets/step-01-envelope.svg" width="140" height="103" alt="" /><p className="t-h2">No notifications.</p><p className="muted">Notifications for your account show up here.</p></div>}
      <p className="home-nt-foot">Admin-wide alerts (new verifications, reports, disputes) are not connected yet.</p>
    </div>
  );
}

export function openAlerts() {
  L.openSheet({ title: 'Notifications', body: <Alerts /> });
}
