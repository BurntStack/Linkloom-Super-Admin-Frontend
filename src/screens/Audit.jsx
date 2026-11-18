/* Audit log (#audit): the server's append-only, hash-chained log (GET /v1/admin/system/audit-log/).
   Filters (who / action / date), the log as a hash chain (each entry carries the hash of the one before), Verify integrity
   (GET .../audit-log/verify/, which checks the SHA-256 chain on the server), CSV export (GET .../audit-log/export/),
   and a fraud watch summary. Entries are written by the server for every admin action; nothing is written here. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import L, { data, store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import Select from '../components/Select.jsx';
import needs from '../components/Needs.jsx';
import { reload, verifyAuditChain, downloadCsv, why } from '../lib/admin.js';

const LABEL = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.password_change': 'Changed password',
  'session.invalidate': 'Ended a session', 'session.invalidate_all': 'Ended all other sessions', 'mfa.reset': 'Reset MFA', 'mfa.untrust': 'Removed a trusted device',
  'account.suspend': 'Suspended an account', 'account.reactivate': 'Reactivated an account', 'account.password_reset': 'Sent a password reset',
  'verification.approve': 'Approved verification', 'verification.reject': 'Rejected verification', 'verification.request_info': 'Asked for more info',
  'report.dismiss': 'Dismissed a report', 'report.remove': 'Removed content', 'report.warn': 'Warned an account',
  'payouts.export': 'Exported payouts', 'audit.export': 'Exported the audit log', 'audit.verify': 'Verified the chain', 'audit.tamper_test': 'Ran a tamper test'
};
const GROUP = { auth: 'Sign-in', session: 'Sessions', mfa: 'Sessions', account: 'Accounts', verification: 'Verification', report: 'Moderation', review: 'Marketplace', campaign: 'Marketplace', marketplace: 'Marketplace', bids: 'Marketplace', order: 'Orders and escrow', dispute: 'Orders and escrow', escrow: 'Orders and escrow', payouts: 'Financials', finance: 'Financials', audit: 'Audit log' };
const human = a => { const t = String(a || '').split('.').pop().replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
export const auditLabel = a => LABEL[a] || human(a);
const groupOf = a => GROUP[String(a).split('.')[0]] || 'Other';
const ist = (s, o) => { try { return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...o }).format(L.D(s)).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase()); } catch (e) { return s; } };
const DATES = [['all', 'All time'], ['today', 'Today'], ['7', '7 days'], ['30', '30 days']];
const UI = () => (data.ui.audit = data.ui.audit || { who: 'all', grp: 'all', date: 'all', open: null, checked: null });
const inRange = (at, k) => { if (k === 'all') return true; const d = -L.daysLeft(String(at).slice(0, 10)); return k === 'today' ? d <= 0 : d < +k; };

function fraud(s) {
  const open = s.bidAlerts.filter(a => a.status === 'open'), top = [...open].sort((a, b) => b.risk - a.risk)[0];
  const sus = s.creators.filter(c => c.status === 'suspended').length + s.brands.filter(b => b.status === 'suspended').length;
  const high = s.reports.filter(r => r.status === 'open' && r.severity === 'high');
  const unv = s.brands.filter(b => b.verify !== 'verified' && b.open > 3);
  return [
    { ic: 'bids', t: 'Bid patterns', v: open.length, s: top ? `${top.pattern}, risk ${top.risk}` : 'None open', risk: top ? top.risk : 0, go: '#marketplace-bids' },
    { ic: 'flag', t: 'High-severity reports', v: high.length, s: high[0] ? high[0].reason : 'None open', risk: high.length ? 75 : 0, go: '#moderation' },
    { ic: 'brief', t: 'Unverified brands posting', v: unv.length, s: unv[0] ? `${unv[0].name}: ${unv[0].open} open campaigns` : 'None', risk: unv.length ? 85 : 0, go: unv[0] ? '#brand-' + unv[0].id : '#accounts' },
    { ic: 'users', t: 'Suspended accounts', v: sus, s: sus ? 'Creators and brands' : 'None', risk: 0, go: '#accounts' }
  ];
}

function Entry({ e, isMe, open, bad, onToggle }) {
  return (
    <li className={`audit-e ${open ? 'is-open' : ''} ${bad ? 'is-bad' : ''}`} data-e={e.id}>
      <span className="audit-bead" aria-hidden="true"></span>
      <button className="audit-e-b" type="button" aria-expanded={open} aria-controls={`audit-d-${e.id}`} onClick={onToggle}>
        <span className="audit-when"><b className="num">{ist(e.at, { day: 'numeric', month: 'short' })}</b><span className="num">{ist(e.at, { hour: 'numeric', minute: '2-digit', hour12: true })}</span></span>
        <span className="audit-what"><span className="audit-what-h"><span className={`audit-av ${isMe ? 'is-me' : ''}`} aria-hidden="true">{L.initials(e.who)}</span><b>{isMe ? 'You' : e.who}</b>{' ' + auditLabel(e.action).toLowerCase()}</span>
          <span className="audit-tgt">{e.target}</span>{e.detail ? <span className="audit-det">{e.detail}</span> : null}</span>
        <span className="audit-hash">{e.hash ? <code className="num">{'#' + e.hash}</code> : null}<span className="audit-grp">{groupOf(e.action)}</span></span>
        <span className="audit-chev" aria-hidden="true"><Icon n="down" /></span>
      </button>
      <div className="audit-d" id={`audit-d-${e.id}`} hidden={!open}>
        <dl className="audit-dl">
          <div><dt>Entry</dt><dd className="num">{e.id}</dd></div>
          <div><dt>Time</dt><dd className="num">{ist(e.at, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) + ' IST'}</dd></div>
          <div><dt>Action code</dt><dd><code>{e.action}</code></dd></div>
          {e.prev ? <div><dt>Links to</dt><dd><code>{'#' + e.prev}</code>{/^0+$/.test(e.prev) ? <> <span className="muted">(start of the chain)</span></> : null}</dd></div> : null}
          {e.hash ? <div><dt>Seal</dt><dd><code>{'#' + e.hash}</code> = SHA-256 of the entry and the seal before it</dd></div> : null}
        </dl>
        <p className="audit-ro"><Icon n="lock" />Sealed. Read-only for every role, including super admins.</p>
      </div>
    </li>
  );
}

export default function Audit() {
  const root = useRef(null);
  const rerender = useRerender();
  const life = useRef({ alive: true, timers: [] }).current;
  const draw = () => flushSync(rerender);            // like the original draw(): the DOM is up to date when it returns
  const later = (f, ms) => life.timers.push(setTimeout(() => life.alive && f(), ms));
  const $ = q => root.current.querySelector(q);
  const keepFocus = sel => { const n = $(sel); n && n.focus(); };

  useLayoutEffect(() => { mo('stagger', L.$$('.audit-e', root.current).slice(0, 8)); }, []);
  useEffect(() => {
    life.alive = true;
    let raf = 0;
    const off = store.on(why => { if (/^notif/.test(String(why))) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (life.alive && why !== 'audit') rerender(); }); });
    return () => { life.alive = false; life.timers.forEach(clearTimeout); off(); cancelAnimationFrame(raf); };
  }, []);

  const s = store.s, ui = UI(), log = s.audit;
  const whos = [...new Set(log.map(e => e.who))];
  const grps = [...new Set(log.map(e => groupOf(e.action)))].sort();
  const match = e => (ui.who === 'all' || e.who === ui.who) && (ui.grp === 'all' || groupOf(e.action) === ui.grp) && inRange(e.at, ui.date);
  const rows = log.filter(match).slice().reverse();
  const filtered = ui.who !== 'all' || ui.grp !== 'all' || ui.date !== 'all';
  const last = log[log.length - 1], chk = ui.checked;
  const fw = fraud(s);

  const setFilter = k => e => { ui[k] = e.target.value; draw(); keepFocus(`#audit-${k}`); };
  const setDate = k => () => { ui.date = k; draw(); keepFocus(`[data-date="${ui.date}"]`); };
  const clear = () => { ui.who = ui.grp = ui.date = 'all'; draw(); keepFocus('#audit-who'); };
  const toggle = id => () => { ui.open = ui.open === id ? null : id; draw(); keepFocus(`[data-e="${id}"] .audit-e-b`); };
  /* the server builds the CSV and logs the export itself */
  const exportCsv = () => {
    const days = ui.date === 'all' ? null : ui.date === 'today' ? 1 : +ui.date;
    const from = days ? new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) : null;
    downloadCsv('/v1/admin/system/audit-log/export/', `linkloom-audit-log-${new Date().toISOString().slice(0, 10)}.csv`, { from })
      .then(() => { L.toast('CSV downloaded · logged to audit', 'download'); reload(['audit']); }, err => L.toast(why(err), 'alert'));
    keepFocus('[data-csv]');
  };
  /* the server checks the chain; the beads then light up one by one */
  const verify = async e => {
    const btn = e.currentTarget; btn.disabled = true;
    const live = root.current.querySelector('[data-live]');
    live.textContent = 'Checking each seal…';
    let res;
    try {
      const d = (await verifyAuditChain()) || {};
      const ok = d.ok !== false && d.valid !== false && d.intact !== false && !/broken|fail/i.test(String(d.status || ''));
      res = { ok, count: Number(d.count ?? d.entries ?? d.checked ?? log.length) || log.length, at: String(d.brokenAt ?? d.firstBadEntry ?? '') };
    } catch (err) { if (!life.alive) return; btn.disabled = false; live.textContent = ''; L.toast(why(err), 'alert'); return; }
    if (!life.alive) return;
    const beads = L.$$('.audit-beads li', root.current), step = L.RM ? 0 : Math.max(24, Math.min(80, 600 / Math.max(1, beads.length)));
    beads.forEach((b, i) => { b.classList.remove('is-ok', 'is-bad'); later(() => b.classList.add(res.ok || (s.audit[i] && s.audit[i].id !== res.at) ? 'is-ok' : 'is-bad'), i * step); });
    later(() => {
      let time = ''; try { time = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(new Date()).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase()); } catch (e2) {}
      UI().checked = { ...res, time }; UI().tres = null;
      draw();
      const btn = $('[data-verify]'); if (btn) btn.disabled = false;
      const h = $('#auditIntH'); h && mo('check', h, { color: 'butter' });
      $('[data-live]').textContent = res.ok ? `Chain intact. All ${res.count} entries check out.` : `Chain broken${res.at ? ' at ' + res.at : ''}.`;
      keepFocus('[data-verify]');
    }, beads.length * step + 160);
  };
  return (
    <div className="view-in audit no-anchor" ref={root}>
      <header className="page-h">
        <div className="t"><p className="t-eyebrow">Platform financials &amp; audit</p><h1 className="t-h1">Audit log</h1>
          <p className="muted audit-lede">Every admin action is written here with a reason, sealed and chained to the one before. Nothing can be edited or deleted, by anyone.</p></div>
        <Lq className="lq-s" data-csv="" onClick={exportCsv}><Icon n="download" className="ic" />Export CSV</Lq>
      </header>

      <div className="audit-grid">
        <div className="audit-main">
          <div className="audit-f" role="group" aria-label="Filter the log">
            <div className="field"><label htmlFor="audit-who">Who</label><Select id="audit-who" data-k="who" value={ui.who} onChange={setFilter('who')}><option value="all">All admins</option>{whos.map(w => <option key={w} value={w}>{w}</option>)}</Select></div>
            <div className="field"><label htmlFor="audit-grp">Action</label><Select id="audit-grp" data-k="grp" value={ui.grp} onChange={setFilter('grp')}><option value="all">All actions</option>{grps.map(g => <option key={g} value={g}>{g}</option>)}</Select></div>
            <div className="field"><span className="lab" id="audit-dl">Date</span><div className="seg audit-seg" role="group" aria-labelledby="audit-dl">{DATES.map(([k, t]) => <button key={k} type="button" data-date={k} aria-pressed={ui.date === k} onClick={setDate(k)}>{t}</button>)}</div></div>
          </div>
          <p className="audit-count" aria-live="polite"><span>Showing <b className="num">{rows.length}</b> of <span className="num">{log.length}</span> entries, newest first</span>{filtered ? <button className="btn-q" type="button" data-clear="" onClick={clear}>Clear filters</button> : null}</p>

          {rows.length
            ? <ol className="audit-chain" aria-label="Audit entries">{rows.map(e => <Entry key={e.id} e={e} isMe={e.who === s.me.name} open={ui.open === e.id} bad={!!(chk && !chk.ok && chk.at === e.id)} onToggle={toggle(e.id)} />)}</ol>
            : <div className="empty audit-empty"><img src="assets/step-05-stamp.svg" width="160" height="117" alt="" /><p className="t-h3">No entries match.</p><p className="muted">Try another admin, action or date range.</p><Lq className="lq-s lq-sm" data-clear="" onClick={clear}>Clear filters</Lq></div>}
        </div>

        <aside className="audit-side">
          <section className="ink-card dark audit-int" aria-labelledby="auditIntH">
            <p className="t-eyebrow">Integrity</p>
            <h2 className="t-h2" id="auditIntH" key={chk ? (chk.ok ? 'ok' : 'bad') + chk.time : 'none'}>{!chk ? 'Sealed and chained' : chk.ok ? 'Chain intact' : 'Chain broken'}</h2>
            <p className="audit-int-s">{!chk ? `${log.length} entries loaded. Each one carries the seal of the one before, so changing or removing any entry breaks every seal after it.` : chk.ok ? `All ${chk.count} entries check out on the server. Verified at ${chk.time} IST.` : `${chk.at ? 'Entry ' + chk.at : 'An entry'} doesn't match its seal. Tell the security team now.`}</p>
            <ol className="audit-beads" aria-hidden="true" key={'b' + log.length + (chk ? chk.time + chk.ok : '')}>{log.map((e, i) => <li key={e.id} data-b={i} className={chk && chk.ok ? 'is-ok' : ''} title={`${e.id} #${e.hash}`}></li>)}</ol>
            {last && last.hash ? <p className="audit-int-h">Latest seal <code className="num">{'#' + last.hash}</code></p> : null}
            <div className="audit-int-a"><Lq className="lq-p lq-sm" data-verify="" onClick={verify}><Icon n="shield" className="ic" />Verify integrity</Lq></div>
            <p className="sr-only" aria-live="polite" data-live=""></p>
          </section>

          <section className="card audit-fw" aria-labelledby="auditFwH">
            <div className="audit-fw-h"><h2 className="t-h3" id="auditFwH">Fraud watch</h2></div>
            <ul className="audit-fw-l">{fw.map(f => <li key={f.t}><a className="audit-fw-a" href={f.go}>
              <span className={`audit-fw-ic ${f.risk >= 70 ? 'is-hi' : ''}`} aria-hidden="true"><Icon n={f.risk >= 70 ? 'alert' : f.ic} /></span>
              <span className="audit-fw-t"><b>{f.t}</b><span>{f.s}</span></span>
              <span className="t-money audit-fw-v">{f.v}</span></a></li>)}</ul>
            <p className="audit-fw-f">Admin actions on these accounts all land in this log, with the reason given.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

L.register('audit', { title: 'Audit log', nav: 'audit', Component: needs(['audit'], Audit, ['bidAlerts', 'creators', 'brands', 'reports']) });
