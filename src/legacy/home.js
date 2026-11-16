/* Home (#home, Builder A): the command dashboard. §2 of the owner's PDF:
   - active brands vs active creators, total live orders in progress, escrow balance (ink band)
   - urgent actions: the verification queue, flagged content reports, and the dispute due soonest
   - alerts: suspicious bidding, payment complaints, disputes due; and the recent audit trail
   Also owns the alerts sheet opened by the #bell button (attached on load). Creators coral, brands violet, escrow plum. */
(() => {
  'use strict';
  const L = window.LLD, { esc, icon, store } = L;
  const mo = (k, ...a) => { const f = L.motion && L.motion[k]; if (typeof f === 'function') { try { return f(...a); } catch (e) {} } };
  const WORDS = ['Nothing', 'One thing', 'Two things', 'Three things', 'Four things', 'Five things', 'Six things', 'Seven things', 'Eight things'];
  const first = n => String(n || '').trim().split(/\s+/)[0] || '';
  const plural = (n, a, b) => `${n} ${n === 1 ? a : (b || a + 's')}`;
  const hoursSince = at => (L.today() - L.D(at)) / 36e5;
  const dueTxt = d => d < 0 ? `${-d} ${d === -1 ? 'day' : 'days'} overdue` : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d} days`;
  /* one letter in small avatars; creators coral, brands violet, admins paper (you are butter) */
  const av = (name, kind, cls = '') => `<span class="home-av is-${kind} ${cls}" aria-hidden="true">${esc((String(name || '?').trim()[0] || '?').toUpperCase())}</span>`;
  const accountOf = v => v.kind === 'brand' ? 'brand' : 'creator';

  /* ---------- verification flags, read straight from the submission ---------- */
  function vFlags(v) {
    const f = [];
    if (v.id_doc && v.id_doc.match === 'under18') f.push(`Under 18 (${L.ageFrom(v.id_doc.dob)})`);
    if (v.bank && v.bank.match === 'mismatch') f.push('Bank name mismatch');
    if (v.business && !v.business.gstin) f.push('No business details');
    if (v.person && v.person.mailVerified === false) f.push('Unverified email');
    return f;
  }
  L.vFlags = L.vFlags || vFlags;

  /* ---------- alerts: suspicious bids, payment complaints, disputes due ---------- */
  function alerts(s) {
    const out = [];
    s.bidAlerts.filter(a => a.status === 'open').forEach(a => out.push({ g: 'bids', id: a.id, ic: 'bids', tone: a.risk >= 70 ? 'err' : 'warn', title: a.pattern, text: a.detail, risk: a.risk, meta: L.ago(a.at), go: '#marketplace-bids', cta: 'Review bids' }));
    s.disputes.filter(d => d.status === 'open').forEach(d => {
      const o = s.orders.find(x => x.id === d.order) || {}, cr = L.creator(o.creator) || {}, br = L.brand(o.brand) || {}, days = L.daysLeft(d.sla);
      const pay = d.kind === 'payment';
      if (!pay && days > 2) return;
      out.push({ g: pay ? 'pay' : 'disp', id: d.id, ic: pay ? 'coin' : 'flag', tone: pay ? 'escrow' : days <= 1 ? 'warn' : 'plain',
        title: pay ? `Payment complaint from ${first(cr.name)}` : `Dispute ${d.id.toUpperCase()} · ${br.name} and ${cr.name}`,
        text: d.claim, meta: dueTxt(days), urgent: days <= 1, amt: o.amount, go: '#orders-' + d.id, cta: pay ? 'Check payout' : 'Arbitrate' });
    });
    return out;
  }
  const GROUPS = [['all', 'All'], ['bids', 'Suspicious bids'], ['pay', 'Payments'], ['disp', 'Disputes']];

  /* ---------- alerts sheet (#bell) ---------- */
  const KIND = { verify: ['verified', 'Verification', 'plain'], report: ['flag', 'Report', 'err'], dispute: ['lock', 'Dispute', 'escrow'], bids: ['bids', 'Bid pattern', 'warn'], payment: ['coin', 'Payment', 'escrow'], audit: ['shield', 'Audit', 'plain'] };
  const kindOf = k => KIND[k] || ['bell', 'Update', 'plain'];
  const UI = () => (LLD_DATA.ui.home = LLD_DATA.ui.home || { nfilter: 'all', afilter: 'all' });
  const groupOf = at => { const d = -L.daysLeft(at.slice(0, 10)); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : 'Earlier'; };
  function bellLabel() {
    const b = document.getElementById('bell'); if (!b) return;
    const n = LLD_DATA.notifications.filter(x => !x.read).length;
    b.setAttribute('aria-label', n ? `Alerts, ${n} unread` : 'Alerts');
  }
  function openAlerts() {
    const s = LLD_DATA, ui = UI();
    const paint = (body, opts = {}) => {
      const all = [...s.notifications].sort((a, b) => L.D(b.at) - L.D(a.at)), unread = all.filter(n => !n.read).length;
      if (ui.nfilter === 'unread' && !unread && !opts.keep) ui.nfilter = 'all';
      const list = ui.nfilter === 'unread' ? all.filter(n => !n.read) : all, groups = [];
      list.forEach(n => { const g = groupOf(n.at); let G = groups.find(x => x.g === g); if (!G) groups.push(G = { g, items: [] }); G.items.push(n); });
      body.innerHTML = all.length ? `<div class="home-nt-h">
          <div class="seg home-nt-seg" role="group" aria-label="Show">
            <button type="button" data-f="all" aria-pressed="${ui.nfilter === 'all'}">All</button>
            <button type="button" data-f="unread" aria-pressed="${ui.nfilter === 'unread'}">Unread${unread ? ` <span class="num">${unread}</span>` : ''}</button>
          </div>
          <button class="btn-q" type="button" data-allread ${unread ? '' : 'disabled aria-disabled="true"'}>${icon('check')}Mark all read</button>
        </div>
        <p class="sr-only" aria-live="polite" data-ntlive>${unread ? `${unread} unread` : 'All caught up'}</p>
        ${list.length ? groups.map(G => `<section class="home-nt-g" aria-label="${esc(G.g)}"><h3 class="t-eyebrow">${esc(G.g)}</h3><ul class="home-nt">${G.items.map(n => {
          const [ic, label, tone] = kindOf(n.kind);
          return `<li class="${n.read ? '' : 'is-unread'}" data-li="${esc(n.id)}">
            <button class="home-nt-i" type="button" data-n="${esc(n.id)}">
              <span class="home-nt-ic is-${tone}" aria-hidden="true">${icon(ic)}</span>
              <span class="home-nt-t"><span class="home-nt-txt">${esc(n.text)}</span><span class="home-nt-at">${esc(label)} · ${esc(L.ago(n.at))}${n.read ? '' : '<span class="sr-only">, unread</span>'}</span></span>
              <span class="home-nt-dot" aria-hidden="true"></span>
            </button>
            ${n.read ? '' : `<button class="ibtn home-nt-mark" type="button" data-mark="${esc(n.id)}" aria-label="Mark as read: ${esc(n.text)}" title="Mark as read">${icon('check')}</button>`}
          </li>`; }).join('')}</ul></section>`).join('')
          : `<div class="home-nt-none"><p class="t-h3">No unread alerts</p><p class="muted">You've seen everything. <button type="button" class="btn-q" data-f="all">Show all</button></p></div>`}
        <p class="home-nt-foot"><span class="sample">Sample alerts</span> · Opening an alert doesn't take any action; that happens on the desk, with a reason.</p>`
        : `<div class="empty home-nt-empty"><img src="assets/step-01-envelope.svg" width="140" height="103" alt=""><p class="t-h2">All quiet.</p><p class="muted">New verifications, reports, disputes and bid patterns land here.</p></div>`;
      if (!opts.quiet) mo('stagger', L.$$('.home-nt li', body));
    };
    L.openSheet({
      title: 'Alerts', body: '',
      onMount(body, close) {
        paint(body);
        body.addEventListener('click', e => {
          const t = e.target.closest('button'); if (!t) return;
          if (t.dataset.f) { ui.nfilter = t.dataset.f; paint(body, { keep: true }); const b = body.querySelector(`[data-f="${ui.nfilter}"]`); b && b.focus(); return; }
          if (t.hasAttribute('data-allread')) { store.set(st => st.notifications.forEach(n => { n.read = true; }), 'notif-read-all'); paint(body, { quiet: true }); L.toast('All marked as read', 'check'); const f = body.querySelector('.home-nt-i'); f && f.focus(); return; }
          if (t.dataset.mark) {
            const n = s.notifications.find(x => x.id === t.dataset.mark); if (!n) return;
            const li = t.closest('li'), nx = li && (li.nextElementSibling || li.previousElementSibling), keep = nx && nx.dataset.li;
            store.set(() => { n.read = true; }, 'notif-read'); paint(body, { quiet: true, keep: true });
            const lv = body.querySelector('[data-ntlive]'); if (lv) lv.textContent = 'Marked as read';
            const back = (keep && body.querySelector(`[data-li="${keep}"] .home-nt-i`)) || body.querySelector(`[data-n="${n.id}"]`) || body.querySelector('.home-nt-i') || body.querySelector('[data-f="all"]');
            back && back.focus(); return;
          }
          if (t.dataset.n) { const n = s.notifications.find(x => x.id === t.dataset.n); if (!n) return; store.set(() => { n.read = true; }, 'notif-read'); close(true); if (n.go) L.go(n.go); }
        });
      }
    });
  }
  L.openNotifications = L.openAlerts = openAlerts;
  const bell = document.getElementById('bell');
  if (bell && !bell.dataset.wired) { bell.dataset.wired = '1'; bell.addEventListener('click', openAlerts); bell.setAttribute('aria-haspopup', 'dialog'); }
  store.on(bellLabel); bellLabel();

  /* ---------- greeting by IST time ---------- */
  function greeting(now) {
    let h = 12; try { h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(now)) % 24; } catch (e) {}
    return h < 4 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 23 ? 'Good evening' : 'Up late';
  }
  const PHASE = { funded: 'Funded', in_progress: 'In progress', submitted: 'To approve', revision: 'In revision', approved: 'Approved, releasing', disputed: 'In dispute' };

  function render(el) {
    const draw = initial => {
      const s = store.s, now = L.today(), ui = UI();
      let when = '';
      try {
        const tz = { timeZone: 'Asia/Kolkata' };
        when = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short', ...tz }).format(now).replace(',', '') + ' · ' +
          new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, ...tz }).format(now).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase()) + ' IST';
      } catch (e) {}

      /* ---- the §2 numbers ---- */
      const crA = s.creators.filter(c => c.status === 'active'), crS = s.creators.filter(c => c.status === 'suspended');
      const brA = s.brands.filter(b => b.status === 'active'), brS = s.brands.filter(b => b.status === 'suspended');
      const brUnv = brA.filter(b => b.verify !== 'verified').length;
      const live = L.liveOrders(), held = L.escrowHeld(), tot = crA.length + brA.length || 1;
      const phases = Object.keys(PHASE).map(k => [k, live.filter(o => o.phase === k)]).filter(x => x[1].length);
      const pend = s.verifications.filter(v => v.status === 'pending');
      const repOpen = s.reports.filter(r => r.status === 'open').sort((a, b) => (b.severity === 'high') - (a.severity === 'high') || b.count - a.count);
      const dOpen = s.disputes.filter(d => d.status === 'open').sort((a, b) => L.D(a.sla) - L.D(b.sla));
      const al = alerts(s), alShown = ui.afilter === 'all' ? al : al.filter(a => a.g === ui.afilter);
      const urgentN = (pend.length ? 1 : 0) + (repOpen.length ? 1 : 0) + (dOpen.length ? 1 : 0);

      /* ---- urgent actions: three real objects ---- */
      const objs = [];
      if (pend.length) {
        const over = pend.filter(v => hoursSince(v.submitted) > 24).length, flagged = pend.filter(v => vFlags(v).length).length;
        const rows = [...pend].sort((a, b) => vFlags(b).length - vFlags(a).length || L.D(a.submitted) - L.D(b.submitted)).slice(0, 4);
        objs.push(`<li class="home-obj home-vq">
          <div class="home-obj-top"><span class="pill pill-info">${icon('verified')}${plural(pend.length, 'verification')} waiting</span>${over ? `<span class="home-due">${icon('clock')}${over} past the 24 h target</span>` : ''}</div>
          <ul class="home-q">${rows.map(v => { const f = vFlags(v), k = accountOf(v), h = hoursSince(v.submitted); return `<li><a class="home-q-a" href="#verify-${esc(v.id)}">
            ${av(v.name, k)}<span class="home-q-t"><b class="is-${k}">${esc(v.name)}</b><span>${k === 'brand' ? 'Brand · GSTIN, PAN, signatory' : 'Creator · ID, PAN, bank, socials'}</span></span>
            <span class="home-q-m">${f.length ? `<span class="pill pill-err">${icon('alert')}${esc(f[0])}${f.length > 1 ? ` +${f.length - 1}` : ''}</span>` : ''}<span class="home-q-age num ${h > 24 ? 'is-late' : ''}">${h < 1 ? 'just now' : h < 24 ? Math.round(h) + ' h' : Math.floor(h / 24) + ' d ' + Math.round(h % 24) + ' h'}</span></span></a></li>`; }).join('')}</ul>
          <div class="home-obj-act"><a class="lq lq-p lq-sm" href="#verify">Open the desk</a>${flagged ? `<span class="home-obj-foot">${plural(flagged, 'has', 'have')} a problem to look at</span>` : ''}</div>
        </li>`);
      }
      if (repOpen.length) {
        const rows = repOpen.slice(0, 3);
        objs.push(`<li class="home-obj home-rep">
          <div class="home-obj-top"><span class="pill pill-err">${icon('flag')}${plural(repOpen.length, 'open report')}</span><span class="home-due">${repOpen.reduce((n, r) => n + r.count, 0)} flags in total</span></div>
          <ul class="home-rl">${rows.map(r => `<li><a class="home-rl-a" href="#moderation-${esc(r.id)}">
            <span class="home-sev is-${esc(r.severity)}"><i></i><i></i><i></i><span class="sr-only">${esc(r.severity)} severity</span></span>
            <span class="home-rl-t"><span class="home-rl-k">${esc(r.type)} · ${r.count > 1 ? `${r.count} reports` : `by ${esc(r.by)}`}</span><b>${esc(r.reason)}</b>${r.excerpt ? `<q>${esc(r.excerpt)}</q>` : `<span class="home-rl-x">${esc(r.target)}</span>`}</span></a></li>`).join('')}</ul>
          <div class="home-obj-act"><a class="lq lq-p lq-sm" href="#moderation">Review reports</a></div>
        </li>`);
      }
      if (dOpen.length) {
        const d = dOpen[0], o = s.orders.find(x => x.id === d.order) || {}, cr = L.creator(o.creator) || {}, br = L.brand(o.brand) || {}, days = L.daysLeft(d.sla);
        objs.push(`<li class="home-obj home-disp ink-card dark">
          <div class="home-obj-top"><span class="pill pill-butter">${icon('clock')}${esc(dueTxt(days))}</span><span class="home-disp-id num">${esc(d.id.toUpperCase())} · opened by ${esc(d.by)}</span></div>
          <p class="home-disp-who"><span class="is-brand">${esc(br.name)}</span> <span aria-hidden="true">×</span><span class="sr-only">and</span> <span class="is-creator">${esc(cr.name)}</span></p>
          <p class="home-disp-c">“${esc(d.claim)}”</p>
          <p class="t-money home-disp-v">${L.inr(o.amount)}</p>
          <p class="home-disp-s"><span class="pill pill-escrow">${icon('lock')}Held in escrow</span><span>${esc(o.title)}</span></p>
          <div class="home-obj-act"><a class="lq lq-p lq-sm" href="#orders-${esc(d.id)}">Arbitrate</a>${dOpen.length > 1 ? `<a class="btn-q" href="#orders">+${dOpen.length - 1} more open</a>` : ''}</div>
          <p class="home-disp-f">Force release or refund, each with a reason on record.</p>
        </li>`);
      }

      /* ---- recent activity (audit log, newest first) ---- */
      const lbl = L.auditLabel || (a => a);
      const recent = [...s.audit].reverse().slice(0, 5);
      const chain = L.verifyAudit();

      el.innerHTML = `<div class="view-in home">
        <header class="home-hi">
          <p class="home-when">${esc(when)}</p>
          <h1 class="home-greet">${esc(greeting(now))}, ${esc(first(s.me.name))}.</h1>
          <p class="home-lede">${urgentN ? `${WORDS[urgentN]} ${urgentN === 1 ? 'needs' : 'need'} a decision today${al.length ? `, and ${plural(al.length, 'alert')} to read` : ''}.` : 'Nothing is waiting on you. The desks are clear.'} <span class="sample">Sample data</span></p>
        </header>

        <section class="home-band" aria-label="Platform at a glance">
          <dl class="home-nums">
            <div class="home-ac"><dt>Active creators and brands</dt>
              <dd class="home-ac-n"><span class="t-money is-creator" data-n="${crA.length}">${crA.length}</span><span class="home-ac-vs" aria-hidden="true">/</span><span class="t-money is-brand" data-n="${brA.length}">${brA.length}</span><span class="sr-only">: ${plural(crA.length, 'active creator')} and ${plural(brA.length, 'active brand')}</span></dd>
              <div class="home-ac-bar" role="img" aria-label="${Math.round(crA.length / tot * 100)}% creators, ${Math.round(brA.length / tot * 100)}% brands"><i class="is-creator" style="flex-grow:${crA.length}"></i><i class="is-brand" style="flex-grow:${brA.length}"></i></div>
              <p class="home-num-s"><span class="home-key is-creator"></span>Creators${crS.length ? ` · ${crS.length} suspended` : ''}<span class="home-key is-brand"></span>Brands${brUnv ? ` · ${brUnv} not verified` : ''}${brS.length ? ` · ${brS.length} suspended` : ''}</p></div>
            <div><dt>Live orders in progress</dt><dd class="t-money" data-n="${live.length}">${live.length}</dd>
              <p class="home-num-s home-ph">${phases.map(([k, os]) => `<span class="home-ph-i ${k === 'disputed' ? 'is-hot' : ''}"><b class="num">${os.length}</b> ${esc(PHASE[k].toLowerCase())}</span>`).join('')}</p></div>
            <div><dt>Escrow balance</dt><dd class="t-money" data-inr="${held}">${L.inr(held)}</dd>
              <p class="home-num-s"><span class="pill pill-escrow">${icon('lock')}Held for ${plural(live.length, 'order')}</span></p></div>
          </dl>
          <div class="home-comm">
            <p><b>Commission ₹0</b> · No commission under the subscription model <span class="pill pill-line home-comm-r">Rate 0%</span></p>
            <p class="home-comm-s">Gateway fees (${esc(s.rules.gatewayPct)}%) are a Linkloom cost, never charged to brands or creators. <a class="btn-q" href="#finance">Financials${icon('arrow')}</a></p>
          </div>
        </section>

        <section class="home-today" aria-labelledby="homeUrgH">
          <div class="home-sec-h"><h2 class="t-h2" id="homeUrgH">Urgent actions</h2></div>
          ${objs.length ? `<ul class="home-strip home-strip-${Math.min(objs.length, 3)}">${objs.join('')}</ul>`
            : `<div class="empty home-empty"><img src="assets/step-05-stamp.svg" width="160" height="117" alt=""><p class="t-h3">The desks are clear.</p><p class="muted">Verifications, reports and disputes show up here as they arrive.</p></div>`}
        </section>

        <div class="home-two">
          <section class="home-al" aria-labelledby="homeAlH">
            <div class="home-sec-h"><div><h2 class="t-h2" id="homeAlH">Alerts</h2><p class="muted t-small">Bid patterns the system flagged, payment complaints and disputes due within 2 days.</p></div></div>
            <div class="home-al-f chips" role="group" aria-label="Show alerts">${GROUPS.map(([k, t]) => { const n = k === 'all' ? al.length : al.filter(a => a.g === k).length; return `<button class="chip" type="button" data-af="${k}" aria-pressed="${ui.afilter === k}">${esc(t)} <span class="num home-chip-n">${n}</span></button>`; }).join('')}</div>
            ${alShown.length ? `<ul class="home-al-l" aria-live="polite">${alShown.map(a => `<li class="home-al-i">
              <span class="home-al-ic is-${a.tone}" aria-hidden="true">${icon(a.tone === 'err' ? 'alert' : a.ic)}</span>
              <div class="home-al-t"><p class="home-al-h"><b>${esc(a.title)}</b>${a.risk != null ? `<span class="home-risk ${a.risk >= 70 ? 'is-hi' : ''}" role="img" aria-label="Risk ${a.risk} of 100"><span class="home-risk-b"><i style="width:${a.risk}%"></i></span><span class="num">${a.risk}</span></span>` : ''}</p>
                <p class="home-al-s">${esc(a.text)}</p>
                <p class="home-al-m"><span class="${a.urgent ? 'is-urgent' : ''}">${icon('clock')}${esc(a.meta)}</span>${a.amt ? `<span class="pill pill-escrow">${icon('lock')}${L.inr(a.amt)}</span>` : ''}</p></div>
              <a class="btn-q home-al-go" href="${esc(a.go)}">${esc(a.cta)}${icon('arrow')}</a></li>`).join('')}</ul>`
              : `<p class="home-al-none muted">No alerts of this kind right now.</p>`}
          </section>

          <section class="home-act card" aria-labelledby="homeActH">
            <div class="home-act-h"><h2 class="t-h3" id="homeActH">Recent activity</h2><a class="btn-q" href="#audit">Audit log${icon('arrow')}</a></div>
            <ol class="home-act-l">${recent.map(e => { const isMe = e.who === s.me.name; return `<li>
              ${av(e.who, isMe ? 'me' : 'admin')}
              <div class="home-act-t"><p><b>${esc(isMe ? 'You' : first(e.who))}</b> ${esc(lbl(e.action).toLowerCase())}</p><p class="home-act-x">${esc(e.target)}</p></div>
              <span class="home-act-at num">${esc(L.ago(e.at))}</span></li>`; }).join('')}</ol>
            <p class="home-act-f ${chain.ok ? 'is-ok' : 'is-bad'}">${icon(chain.ok ? 'shield' : 'alert')}<span>${chain.ok ? `Chain intact · ${plural(chain.count, 'sealed entry', 'sealed entries')}` : `Chain broken at ${esc(chain.at)}`}</span></p>
          </section>
        </div>
      </div>`;
      L.liquid(el);

      el.querySelectorAll('[data-af]').forEach(b => b.addEventListener('click', () => {
        ui.afilter = b.dataset.af;
        const keep = b.dataset.af;
        draw(false);
        const nb = el.querySelector(`[data-af="${keep}"]`); nb && nb.focus();
        mo('stagger', L.$$('.home-al-i', el));
      }));
      if (initial) {
        el.querySelectorAll('.home-nums [data-n]').forEach(d => { const n = +d.dataset.n; if (n) mo('count', d, n, v => String(Math.round(v))); });
        const h = el.querySelector('[data-inr]'); if (h && +h.dataset.inr) mo('count', h, +h.dataset.inr, L.inr);
        mo('stagger', L.$$('.home-obj, .home-al-i, .home-act-l>li', el));
        const bar = el.querySelector('.home-ac-bar'); bar && requestAnimationFrame(() => bar.classList.add('is-in'));
      } else el.querySelectorAll('.home-ac-bar').forEach(b => b.classList.add('is-in', 'is-now'));
    };
    draw(true);
    let raf = 0;
    const off = store.on(why => { if (/^notif/.test(String(why))) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (el.isConnected) draw(false); }); });
    return () => { off(); cancelAnimationFrame(raf); };
  }

  L.register('home', { title: 'Command', nav: 'home', render });
})();
