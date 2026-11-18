/* The bell in the top bar: admin notifications (GET /v1/admin/system/notifications/), with read and read-all.
   A notification that points at a record (a verification, report, dispute, ...) opens it. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import L from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { fetchNotifications, readNotification, readAllNotifications, sinceNow } from '../lib/live.js';
import { errText } from './Admin.jsx';
import Icon from './Icon.jsx';

const ICON = k => (/verif|kyc/i.test(k) ? 'verified' : /report|abuse|flag/i.test(k) ? 'flag' : /dispute|order|escrow|refund|payout/i.test(k) ? 'lock' : /campaign/i.test(k) ? 'brief' : /bid/i.test(k) ? 'bids' : 'bell');

function Alerts() {
  const box = useRef(null);
  const [st, setSt] = useState({ list: null, err: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let on = true;
    fetchNotifications().then(list => on && setSt({ list, err: '' }), e => on && setSt({ list: null, err: errText(e) }));
    return () => { on = false; };
  }, []);
  useLayoutEffect(() => { if (st.list) mo('stagger', L.$$('.home-nt li', box.current)); }, [!!st.list]);
  const unread = st.list ? st.list.filter(n => !n.read).length : 0;
  const allRead = async () => {
    setBusy(true);
    try { await readAllNotifications(); setSt(s => ({ ...s, list: s.list.map(n => ({ ...n, read: true })) })); L.toast('All marked as read', 'check'); }
    catch (e) { L.toast(errText(e), 'alert'); }
    setBusy(false);
  };
  const open = n => () => {
    if (!n.read) { readNotification(n.id).catch(() => {}); setSt(s => ({ ...s, list: s.list.map(x => (x.id === n.id ? { ...x, read: true } : x)) })); }
    if (n.link) L.closeSheet();
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
            <a className="home-nt-i" href={n.link || undefined} role={n.link ? undefined : 'button'} tabIndex={0} onClick={open(n)}>
              <span className="home-nt-ic is-plain" aria-hidden="true"><Icon n={ICON(n.kind + ' ' + n.text)} /></span>
              <span className="home-nt-t"><span className="home-nt-txt">{n.text}</span>{n.body ? <span className="home-nt-at">{n.body}</span> : null}<span className="home-nt-at">{sinceNow(n.at)}{n.read ? null : <span className="sr-only">, unread</span>}</span></span>
              <span className="home-nt-dot" aria-hidden="true"></span>
            </a>
          </li>))}</ul>
      </> : <div className="empty home-nt-empty"><img src="assets/step-01-envelope.svg" width="140" height="103" alt="" /><p className="t-h2">No notifications.</p><p className="muted">New verifications, reports, disputes and bid alerts show up here.</p></div>}
    </div>
  );
}

export function openAlerts() {
  L.openSheet({ title: 'Notifications', body: <Alerts /> });
}
