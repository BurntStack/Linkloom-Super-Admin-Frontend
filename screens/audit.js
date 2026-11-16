/* Audit log (#audit, Builder A): tamper-proof, append-only, hash-chained (sealed and frozen in core.js).
   Filters (who / action / date), the log as a hash chain (each entry carries the hash of the one before), Verify integrity
   (LLD.verifyAudit, stepping along the chain), a tamper test that proves entries are frozen, CSV export, and a fraud watch summary.
   Exposes LLD.auditLabel(action) for other screens. */
(() => {
  'use strict';
  const L = window.LLD, { esc, icon, store } = L;
  const mo = (k, ...a) => { const f = L.motion && L.motion[k]; if (typeof f === 'function') { try { return f(...a); } catch (e) {} } };
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
  const label = a => LABEL[a] || human(a);
  const groupOf = a => GROUP[String(a).split('.')[0]] || 'Other';
  L.auditLabel = label;
  const ist = (s, o) => { try { return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...o }).format(L.D(s)).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase()); } catch (e) { return s; } };
  const DATES = [['all', 'All time'], ['today', 'Today'], ['7', '7 days'], ['30', '30 days']];
  const UI = () => (LLD_DATA.ui.audit = LLD_DATA.ui.audit || { who: 'all', grp: 'all', date: 'all', open: null, checked: null });
  const inRange = (at, k) => { if (k === 'all') return true; const d = -L.daysLeft(String(at).slice(0, 10)); return k === 'today' ? d <= 0 : d < +k; };

  function csv(rows) {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const out = [['id', 'time_ist', 'admin', 'action', 'target', 'detail', 'prev_hash', 'hash'].join(',')]
      .concat(rows.map(e => [e.id, ist(e.at, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }), e.who, e.action, e.target, e.detail, e.prev, e.hash].map(q).join(',')));
    const blob = new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'linkloom-audit-log-2026-11-04.csv';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function fraud(s) {
    const open = s.bidAlerts.filter(a => a.status === 'open'), top = [...open].sort((a, b) => b.risk - a.risk)[0];
    const sus = s.creators.filter(c => c.status === 'suspended').length + s.brands.filter(b => b.status === 'suspended').length;
    const high = s.reports.filter(r => r.status === 'open' && r.severity === 'high');
    const unv = s.brands.filter(b => b.verify !== 'verified' && b.open > 3);
    return [
      { ic: 'bids', t: 'Bid patterns', v: open.length, s: top ? `${top.pattern}, risk ${top.risk}` : 'None open', risk: top ? top.risk : 0, go: '#marketplace-bids' },
      { ic: 'flag', t: 'High-severity reports', v: high.length, s: high[0] ? high[0].reason : 'None open', risk: high.length ? 75 : 0, go: '#moderation' },
      { ic: 'brief', t: 'Unverified brands posting', v: unv.length, s: unv[0] ? `${unv[0].name}: ${unv[0].postsLast30} jobs in 2 days` : 'None', risk: unv.length ? 85 : 0, go: unv[0] ? '#brand-' + unv[0].id : '#accounts' },
      { ic: 'users', t: 'Suspended accounts', v: sus, s: 'Linked devices and payout UPI', risk: 0, go: '#accounts' }
    ];
  }

  function render(el) {
    let alive = true, timers = [];
    const later = (f, ms) => timers.push(setTimeout(() => alive && f(), ms));
    const draw = initial => {
      const s = store.s, ui = UI(), log = s.audit;
      const whos = [...new Set([...s.admins.map(a => a.name), ...log.map(e => e.who)])];
      const grps = [...new Set(log.map(e => groupOf(e.action)))].sort();
      const rows = log.filter(e => (ui.who === 'all' || e.who === ui.who) && (ui.grp === 'all' || groupOf(e.action) === ui.grp) && inRange(e.at, ui.date)).slice().reverse();
      const filtered = ui.who !== 'all' || ui.grp !== 'all' || ui.date !== 'all';
      const last = log[log.length - 1], chk = ui.checked;
      const fw = fraud(s);
      el.innerHTML = `<div class="view-in audit">
        <header class="page-h">
          <div class="t"><p class="t-eyebrow">Platform financials &amp; audit</p><h1 class="t-h1">Audit log</h1>
            <p class="muted audit-lede">Every admin action is written here with a reason, sealed and chained to the one before. Nothing can be edited or deleted, by anyone. <span class="sample">Sample data</span></p></div>
          <button class="lq lq-s" type="button" data-csv>${icon('download', 'ic')}Export CSV</button>
        </header>

        <div class="audit-grid">
          <div class="audit-main">
            <div class="audit-f" role="group" aria-label="Filter the log">
              <div class="field"><label for="audit-who">Who</label><select class="select" id="audit-who" data-k="who"><option value="all">All admins</option>${whos.map(w => `<option value="${esc(w)}" ${ui.who === w ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select></div>
              <div class="field"><label for="audit-grp">Action</label><select class="select" id="audit-grp" data-k="grp"><option value="all">All actions</option>${grps.map(g => `<option value="${esc(g)}" ${ui.grp === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
              <div class="field"><span class="lab" id="audit-dl">Date</span><div class="seg audit-seg" role="group" aria-labelledby="audit-dl">${DATES.map(([k, t]) => `<button type="button" data-date="${k}" aria-pressed="${ui.date === k}">${t}</button>`).join('')}</div></div>
            </div>
            <p class="audit-count" aria-live="polite"><span>Showing <b class="num">${rows.length}</b> of <span class="num">${log.length}</span> entries, newest first</span>${filtered ? `<button class="btn-q" type="button" data-clear>Clear filters</button>` : ''}</p>

            ${rows.length ? `<ol class="audit-chain" aria-label="Audit entries">${rows.map(e => { const isMe = e.who === s.me.name, open = ui.open === e.id, bad = chk && !chk.ok && chk.at === e.id; return `<li class="audit-e ${open ? 'is-open' : ''} ${bad ? 'is-bad' : ''}" data-e="${esc(e.id)}">
              <span class="audit-bead" aria-hidden="true"></span>
              <button class="audit-e-b" type="button" aria-expanded="${open}" aria-controls="audit-d-${esc(e.id)}">
                <span class="audit-when"><b class="num">${esc(ist(e.at, { day: 'numeric', month: 'short' }))}</b><span class="num">${esc(ist(e.at, { hour: 'numeric', minute: '2-digit', hour12: true }))}</span></span>
                <span class="audit-what"><span class="audit-what-h"><span class="audit-av ${isMe ? 'is-me' : ''}" aria-hidden="true">${esc(e.who[0])}</span><b>${esc(isMe ? 'You' : e.who)}</b> ${esc(label(e.action).toLowerCase())}</span>
                  <span class="audit-tgt">${esc(e.target)}</span>${e.detail ? `<span class="audit-det">${esc(e.detail)}</span>` : ''}</span>
                <span class="audit-hash"><code class="num">#${esc(e.hash)}</code><span class="audit-grp">${esc(groupOf(e.action))}</span></span>
                <span class="audit-chev" aria-hidden="true">${icon('down')}</span>
              </button>
              <div class="audit-d" id="audit-d-${esc(e.id)}" ${open ? '' : 'hidden'}>
                <dl class="audit-dl">
                  <div><dt>Entry</dt><dd class="num">${esc(e.id)}</dd></div>
                  <div><dt>Time</dt><dd class="num">${esc(ist(e.at, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }))} IST</dd></div>
                  <div><dt>Action code</dt><dd><code>${esc(e.action)}</code></dd></div>
                  <div><dt>Links to</dt><dd><code>#${esc(e.prev)}</code>${e.prev === '00000000' ? ' <span class="muted">(start of the chain)</span>' : ''}</dd></div>
                  <div><dt>Seal</dt><dd><code>#${esc(e.hash)}</code> = hash(links to, time, admin, action, target, reason)</dd></div>
                </dl>
                <p class="audit-ro">${icon('lock')}Sealed. Read-only for every role, including super admins.</p>
              </div></li>`; }).join('')}</ol>`
              : `<div class="empty audit-empty"><img src="assets/step-05-stamp.svg" width="160" height="117" alt=""><p class="t-h3">No entries match.</p><p class="muted">Try another admin, action or date range.</p><button class="lq lq-s lq-sm" type="button" data-clear>Clear filters</button></div>`}
          </div>

          <aside class="audit-side">
            <section class="ink-card dark audit-int" aria-labelledby="auditIntH">
              <p class="t-eyebrow">Integrity</p>
              <h2 class="t-h2" id="auditIntH">${!chk ? 'Sealed and chained' : chk.ok ? 'Chain intact' : 'Chain broken'}</h2>
              <p class="audit-int-s">${!chk ? `${log.length} entries. Each one carries the seal of the one before, so changing or removing any entry breaks every seal after it.` : chk.ok ? `All ${chk.count} entries check out. Verified at ${esc(chk.time)} IST.` : `Entry ${esc(chk.at)} doesn't match its seal. Tell the security team now.`}</p>
              <ol class="audit-beads" aria-hidden="true">${log.map((e, i) => `<li data-b="${i}" class="${chk && chk.ok ? 'is-ok' : ''}" title="${esc(e.id)} #${esc(e.hash)}"></li>`).join('')}</ol>
              <p class="audit-int-h">Latest seal <code class="num">#${esc(last ? last.hash : '')}</code></p>
              <div class="audit-int-a"><button class="lq lq-p lq-sm" type="button" data-verify>${icon('shield', 'ic')}Verify integrity</button><button class="btn-q" type="button" data-tamper>Try to edit an entry</button></div>
              <p class="sr-only" aria-live="polite" data-live></p>
              <div data-tres>${ui.tres ? `<p class="audit-tres ${ui.tres.ok ? 'is-ok' : 'is-bad'}" role="status">${icon(ui.tres.ok ? 'lock' : 'alert')}<span>${ui.tres.ok ? `<b>Refused.</b> Entry ${esc(ui.tres.id)} is sealed: it can't be edited, and the log can't be shortened. The test itself is now logged.` : 'Protection check failed. Tell the security team.'}</span></p>` : ''}</div>
            </section>

            <section class="card audit-fw" aria-labelledby="auditFwH">
              <div class="audit-fw-h"><h2 class="t-h3" id="auditFwH">Fraud watch</h2><span class="sample">Sample</span></div>
              <ul class="audit-fw-l">${fw.map(f => `<li><a class="audit-fw-a" href="${esc(f.go)}">
                <span class="audit-fw-ic ${f.risk >= 70 ? 'is-hi' : ''}" aria-hidden="true">${icon(f.risk >= 70 ? 'alert' : f.ic)}</span>
                <span class="audit-fw-t"><b>${esc(f.t)}</b><span>${esc(f.s)}</span></span>
                <span class="t-money audit-fw-v">${f.v}</span></a></li>`).join('')}</ul>
              <p class="audit-fw-f">Admin actions on these accounts all land in this log, with the reason given.</p>
            </section>
          </aside>
        </div>
      </div>`;
      L.liquid(el);
      if (initial) mo('stagger', L.$$('.audit-e', el).slice(0, 8));
    };

    const keepFocus = sel => { const n = el.querySelector(sel); n && n.focus(); };
    el.addEventListener('change', e => {
      const k = e.target.dataset && e.target.dataset.k; if (!k) return;
      UI()[k] = e.target.value; draw(false); keepFocus(`#audit-${k}`);
    });
    el.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      const ui = UI(), s = store.s;
      if (t.dataset.date) { ui.date = t.dataset.date; draw(false); keepFocus(`[data-date="${ui.date}"]`); return; }
      if (t.hasAttribute('data-clear')) { ui.who = ui.grp = ui.date = 'all'; draw(false); keepFocus('#audit-who'); return; }
      if (t.classList.contains('audit-e-b')) { const id = t.closest('[data-e]').dataset.e; ui.open = ui.open === id ? null : id; draw(false); keepFocus(`[data-e="${id}"] .audit-e-b`); return; }
      if (t.hasAttribute('data-csv')) {
        const rows = s.audit.filter(x => (ui.who === 'all' || x.who === ui.who) && (ui.grp === 'all' || groupOf(x.action) === ui.grp) && inRange(x.at, ui.date));
        csv(rows); L.audit('audit.export', 'Audit log', `${rows.length} rows, CSV`); draw(false); L.toast('CSV downloaded · Logged to audit', 'download'); keepFocus('[data-csv]');
        return;
      }
      if (t.hasAttribute('data-verify')) {
        t.disabled = true;
        const res = L.verifyAudit(), beads = L.$$('.audit-beads li', el), step = L.RM ? 0 : Math.max(24, Math.min(80, 600 / Math.max(1, beads.length)));
        const live = el.querySelector('[data-live]'); live.textContent = 'Checking each seal…';
        beads.forEach((b, i) => { b.classList.remove('is-ok', 'is-bad'); later(() => b.classList.add(res.ok || s.audit[i].id !== res.at ? 'is-ok' : 'is-bad'), i * step); });
        later(() => {
          let time = ''; try { time = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(L.today()).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase()); } catch (e2) {}
          UI().checked = { ...res, time }; UI().tres = null;
          draw(false);
          const h = el.querySelector('#auditIntH'); h && mo('check', h, { color: 'butter' });
          el.querySelector('[data-live]').textContent = res.ok ? `Chain intact. All ${res.count} entries check out.` : `Chain broken at ${res.at}.`;
          keepFocus('[data-verify]');
        }, beads.length * step + 160);
        return;
      }
      if (t.hasAttribute('data-tamper')) {
        const e0 = s.audit[0]; let edit = false, drop = false;
        try { e0.detail = 'edited'; } catch (err) { edit = true; }
        try { s.audit.pop(); } catch (err) { drop = true; }
        const ok = edit && drop && L.verifyAudit().ok;
        L.audit('audit.tamper_test', `Entry ${e0.id}`, ok ? 'Edit and delete both refused; chain intact' : 'Protection check failed');
        UI().checked = null; UI().tres = { ok, id: e0.id };
        draw(false);
        keepFocus('[data-tamper]');
      }
    });
    draw(true);
    let raf = 0;
    const off = store.on(why => { if (/^notif/.test(String(why))) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (el.isConnected && why !== 'audit') draw(false); }); });
    return () => { alive = false; timers.forEach(clearTimeout); off(); cancelAnimationFrame(raf); };
  }

  L.register('audit', { title: 'Audit log', nav: 'audit', render });
})();
