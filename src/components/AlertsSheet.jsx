/* The alerts sheet opened by the bell in the top bar. */
import { useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { data, store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import Icon from './Icon.jsx';

const KIND = { verify: ['verified', 'Verification', 'plain'], report: ['flag', 'Report', 'err'], dispute: ['lock', 'Dispute', 'escrow'], bids: ['bids', 'Bid pattern', 'warn'], payment: ['coin', 'Payment', 'escrow'], audit: ['shield', 'Audit', 'plain'] };
const kindOf = k => KIND[k] || ['bell', 'Update', 'plain'];
const UI = () => (data.ui.home = data.ui.home || { nfilter: 'all', afilter: 'all' });
const groupOf = at => { const d = -L.daysLeft(at.slice(0, 10)); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : 'Earlier'; };

function Alerts({ el, close }) {
  const s = data, ui = UI();
  const settle = () => { if (ui.nfilter === 'unread' && !s.notifications.some(n => !n.read)) ui.nfilter = 'all'; };   // nothing unread: show all
  const [view, setView] = useState(() => { settle(); return { tick: 0, quiet: false, said: null }; });
  const paint = (o = {}) => { if (!o.keep) settle(); flushSync(() => setView(v => ({ tick: v.tick + 1, quiet: !!o.quiet, said: o.said || null }))); };
  useLayoutEffect(() => { if (!view.quiet) mo('stagger', L.$$('.home-nt li', el)); }, [view.tick]);
  const $ = q => el.querySelector(q);

  const all = [...s.notifications].sort((a, b) => L.D(b.at) - L.D(a.at)), unread = all.filter(n => !n.read).length;
  const list = ui.nfilter === 'unread' ? all.filter(n => !n.read) : all, groups = [];
  list.forEach(n => { const g = groupOf(n.at); let G = groups.find(x => x.g === g); if (!G) groups.push(G = { g, items: [] }); G.items.push(n); });

  const filter = f => () => { ui.nfilter = f; paint({ keep: true }); const b = $(`[data-f="${ui.nfilter}"]`); b && b.focus(); };
  const allRead = () => { store.set(st => st.notifications.forEach(n => { n.read = true; }), 'notif-read-all'); paint({ quiet: true }); L.toast('All marked as read', 'check'); const f = $('.home-nt-i'); f && f.focus(); };
  const mark = n => e => {
    const li = e.currentTarget.closest('li'), nx = li && (li.nextElementSibling || li.previousElementSibling), keep = nx && nx.dataset.li;
    store.set(() => { n.read = true; }, 'notif-read'); paint({ quiet: true, keep: true, said: 'Marked as read' });
    const back = (keep && $(`[data-li="${keep}"] .home-nt-i`)) || $(`[data-n="${n.id}"]`) || $('.home-nt-i') || $('[data-f="all"]');
    back && back.focus();
  };
  const open = n => () => { store.set(() => { n.read = true; }, 'notif-read'); close(true); if (n.go) L.go(n.go); };

  if (!all.length) return <div className="empty home-nt-empty"><img src="assets/step-01-envelope.svg" width="140" height="103" alt="" /><p className="t-h2">All quiet.</p><p className="muted">New verifications, reports, disputes and bid patterns land here.</p></div>;
  return (
    <>
      <div className="home-nt-h">
        <div className="seg home-nt-seg" role="group" aria-label="Show">
          <button type="button" data-f="all" aria-pressed={ui.nfilter === 'all'} onClick={filter('all')}>All</button>
          <button type="button" data-f="unread" aria-pressed={ui.nfilter === 'unread'} onClick={filter('unread')}>Unread{unread ? <> <span className="num">{unread}</span></> : null}</button>
        </div>
        <button className="btn-q" type="button" data-allread="" disabled={!unread} aria-disabled={unread ? undefined : 'true'} onClick={allRead}><Icon n="check" />Mark all read</button>
      </div>
      <p className="sr-only" aria-live="polite" data-ntlive="">{view.said || (unread ? `${unread} unread` : 'All caught up')}</p>
      {list.length ? groups.map(G => (
        <section className="home-nt-g" aria-label={G.g} key={G.g}><h3 className="t-eyebrow">{G.g}</h3><ul className="home-nt">{G.items.map(n => {
          const [ic, label, tone] = kindOf(n.kind);
          return (
            <li className={n.read ? '' : 'is-unread'} data-li={n.id} key={n.id}>
              <button className="home-nt-i" type="button" data-n={n.id} onClick={open(n)}>
                <span className={`home-nt-ic is-${tone}`} aria-hidden="true"><Icon n={ic} /></span>
                <span className="home-nt-t"><span className="home-nt-txt">{n.text}</span><span className="home-nt-at">{`${label} · ${L.ago(n.at)}`}{n.read ? null : <span className="sr-only">, unread</span>}</span></span>
                <span className="home-nt-dot" aria-hidden="true"></span>
              </button>
              {n.read ? null : <button className="ibtn home-nt-mark" type="button" data-mark={n.id} aria-label={`Mark as read: ${n.text}`} title="Mark as read" onClick={mark(n)}><Icon n="check" /></button>}
            </li>);
        })}</ul></section>
      )) : <div className="home-nt-none"><p className="t-h3">No unread alerts</p><p className="muted">You've seen everything. <button type="button" className="btn-q" data-f="all" onClick={filter('all')}>Show all</button></p></div>}
      <p className="home-nt-foot"><span className="sample">Sample alerts</span> · Opening an alert doesn't take any action; that happens on the desk, with a reason.</p>
    </>
  );
}

/* body as a function: core.js hands over the sheet's body element and its close() */
export function openAlerts() {
  L.openSheet({ title: 'Alerts', body: o => <Alerts el={o.el} close={o.close} /> });
}
