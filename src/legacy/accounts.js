/* Accounts governance (#accounts, #creator-<id>, #brand-<id>). Owner: Builder B.
   List: search, Creators / Brands, status and quick filters. Creator detail: badges, category tags, featured, reports, suspend or reactivate,
   password-reset help, sign out of devices. Brand detail: business mail, company registration, campaign posting frequency (30 days vs usual).
   Every change is logged with LLD.audit; destructive ones go through the confirm sheet in LLD.adm (verify.js). Classes are .acc-*. */
(() => {
  const L = window.LLD, esc = L.esc, S = () => window.LLD_DATA;
  const A = () => L.adm;
  const mo = (fn, ...a) => { try { const m = L.motion; return m && m[fn] ? m[fn](...a) : null; } catch (e) { return null; } };
  const ui = () => { const s = S(); s.ui = s.ui || {}; return (s.ui.accounts = s.ui.accounts || { tab: 'creator', q: '', status: 'all', f: [], sess: {} }); };

  const BADGES = [['Verified Pro', 'Verified KYC and 5+ approved jobs'], ['Top rated', 'Rated 4.7 or more by brands'], ['Rising', 'Fast-growing new creator']];
  const KYC = { verified: ['pill-ok', 'check', 'Verified'], under_review: ['pill-info', 'clock', 'In review'], action_needed: ['pill-warn', 'info', 'Action needed'], rejected: ['pill-err', 'alert', 'Rejected'], not_started: ['pill-paper', 'minus', 'Not verified'] };
  const kycPill = k => { const m = KYC[k] || KYC.not_started; return `<span class="pill ${m[0]}">${L.icon(m[1])}${m[2]}</span>`; };
  const stPill = a => a.status === 'suspended' ? `<span class="pill pill-err">${L.icon('alert')}Suspended</span>` : `<span class="pill pill-ok">${L.icon('check')}Active</span>`;
  const spike = b => b.postsLast30 >= 5 && b.postsLast30 > 2 * b.postsAvg;
  const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const phone = id => `+91 ••••• ••${String(10 + hash(id) % 90)}`;
  const av = (kind, name, cls = '') => `<span class="avatar ${kind === 'brand' ? 'v' : ''} ${cls}" aria-hidden="true">${esc(L.initials(name))}</span>`;
  const stamp = () => new Date(L.today().getTime() + S().audit.length * 1000).toISOString();

  /* sample signed-in devices per account (kept in ui so sign-outs stick for this visit) */
  function sessions(kind, a) {
    const u = ui(); u.sess = u.sess || {};
    if (!u.sess[a.id]) u.sess[a.id] = a.status === 'suspended' ? [] : kind === 'creator'
      ? [{ d: 'Linkloom app · Android', p: a.city, at: a.lastActive || a.joined }, ...(hash(a.id) % 2 ? [{ d: 'Chrome · Windows', p: a.city, at: a.joined }] : [])]
      : [{ d: 'Chrome · macOS', p: a.city, at: '2026-11-04T09:10:00+05:30' }, { d: 'Safari · iPhone', p: a.city, at: '2026-11-02T20:30:00+05:30' }];
    return u.sess[a.id];
  }

  /* ---------- list ---------- */
  const QF = {
    creator: [['pro', 'Verified Pro', c => c.badges.includes('Verified Pro')], ['feat', 'Featured', c => c.featured], ['kyc', 'KYC not done', c => c.kyc !== 'verified'], ['rep', 'Has reports', c => c.reports > 0]],
    brand: [['ver', 'Verified', b => b.verify === 'verified'], ['unv', 'Not verified', b => b.verify !== 'verified'], ['spike', 'Posting spike', spike], ['rep', 'Has reports', b => b.reports > 0]]
  };
  function list(el) {
    const s = S(), u = ui();
    const susp = [...s.creators, ...s.brands].filter(a => a.status === 'suspended').length;
    el.innerHTML = `<div class="view-in acc">
      <header class="page-h acc-head">
        <div class="t"><p class="t-eyebrow">Accounts</p><h1 class="t-h1">People and brands on Linkloom</h1>
          <p class="muted">${s.creators.length} creators and ${s.brands.length} brands${susp ? `, ${susp} suspended` : ''}. Changes here are logged. <span class="sample">Sample data</span></p></div>
        <div class="acc-search">${L.icon('search')}<label class="sr-only" for="accQ">Search accounts</label>
          <input class="input" id="accQ" type="search" autocomplete="off" spellcheck="false" placeholder="Name, @handle, city or GSTIN" value="${esc(u.q)}"></div>
      </header>
      <div class="acc-bar">
        <div class="seg acc-seg" role="group" aria-label="Account type">
          <button type="button" data-tab="creator" aria-pressed="${u.tab === 'creator'}"><i class="dot acc-dot-c"></i>Creators</button>
          <button type="button" data-tab="brand" aria-pressed="${u.tab === 'brand'}"><i class="dot acc-dot-b"></i>Brands</button>
        </div>
        <div class="chips acc-st" role="group" aria-label="Status">${[['all', 'Any status'], ['active', 'Active'], ['suspended', 'Suspended']].map(([k, t]) => `<button class="chip" type="button" data-st="${k}" aria-pressed="${u.status === k}">${t}</button>`).join('')}</div>
        <div class="chips acc-qf" role="group" aria-label="Filters" id="accQf"></div>
      </div>
      <div class="acc-count"><p id="accCount" aria-live="polite"></p><button class="btn-q" type="button" data-clear>Clear filters</button></div>
      <ul class="acc-list" id="accList"></ul>
    </div>`;
    const qf = el.querySelector('#accQf');
    const paintQf = () => { qf.innerHTML = QF[u.tab].map(([k, t]) => `<button class="chip" type="button" data-f="${k}" aria-pressed="${u.f.includes(k)}">${t}</button>`).join(''); };
    const cRow = c => `<li><a class="acc-row" href="#creator-${esc(c.id)}">
        ${av('creator', c.name)}
        <span class="acc-id"><b>${esc(c.name)}</b><span>${c.handle ? esc(c.handle) + ' · ' : ''}${esc(c.city)}</span></span>
        <span class="acc-tags">${c.badges.map(b => `<span class="acc-badge">${L.icon('verified')}${esc(b)}</span>`).join('')}${c.tags.slice(0, 2).map(t => `<span class="pill pill-line">${esc(t)}</span>`).join('')}${c.featured ? `<span class="acc-feat">${L.icon('star')}Featured</span>` : ''}</span>
        <span class="acc-n"><b class="t-money">${c.followers ? esc(L.compact(c.followers)) : '—'}</b><span>followers</span></span>
        <span class="acc-k">${kycPill(c.kyc)}${c.reports ? `<span class="acc-rep">${L.icon('flag')}${c.reports} report${c.reports > 1 ? 's' : ''}</span>` : ''}</span>
        <span class="acc-s">${stPill(c)}</span><span class="acc-go">${L.icon('chevron')}</span></a></li>`;
    const bRow = b => `<li><a class="acc-row" href="#brand-${esc(b.id)}">
        ${av('brand', b.name)}
        <span class="acc-id"><b>${esc(b.name)}</b><span>${esc(b.contact)}${b.city && b.city !== '—' ? ' · ' + esc(b.city) : ''}</span></span>
        <span class="acc-tags"><span class="acc-mail${b.mailVerified && !A().freeMail(b.email) ? '' : ' is-bad'}">${L.icon(b.mailVerified && !A().freeMail(b.email) ? 'check' : 'alert')}${esc(b.email)}</span></span>
        <span class="acc-n"><b class="t-money">${b.postsLast30}</b><span>posts in 30 days${spike(b) ? '' : ''}</span></span>
        <span class="acc-k">${kycPill(b.verify)}${spike(b) ? `<span class="acc-rep">${L.icon('chart')}Posting spike</span>` : b.reports ? `<span class="acc-rep">${L.icon('flag')}${b.reports} report${b.reports > 1 ? 's' : ''}</span>` : ''}</span>
        <span class="acc-s">${stPill(b)}</span><span class="acc-go">${L.icon('chevron')}</span></a></li>`;
    const paint = () => {
      const q = u.q.trim().toLowerCase();
      const src = u.tab === 'creator' ? s.creators : s.brands;
      const fs = QF[u.tab].filter(([k]) => u.f.includes(k));
      const rows = src.filter(a => (u.status === 'all' || a.status === u.status) && fs.every(([, , fn]) => fn(a)) &&
        (!q || [a.name, a.handle, a.city, a.contact, a.gstin, a.email].some(x => x && String(x).toLowerCase().includes(q))));
      el.querySelector('#accList').innerHTML = rows.length ? rows.map(u.tab === 'creator' ? cRow : bRow).join('')
        : `<li class="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt=""><p class="t-h3">No ${u.tab === 'creator' ? 'creators' : 'brands'} match</p><p class="muted">Try another name, or clear the filters.</p></li>`;
      el.querySelector('#accCount').innerHTML = `<b>${rows.length}</b> of ${src.length} ${u.tab === 'creator' ? 'creators' : 'brands'}`;
      const dirty = u.q || u.status !== 'all' || u.f.length;
      const cl = el.querySelector('[data-clear]'); cl.hidden = !dirty;
    };
    paintQf(); paint();
    mo('stagger', [...el.querySelectorAll('.acc-row')]);
    const flip = () => { const r = mo('flip', paint, [...el.querySelectorAll('.acc-list>li')]); if (r == null) paint(); };
    el.querySelector('#accQ').addEventListener('input', e => { u.q = e.target.value; paint(); });
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-tab],[data-st],[data-f],[data-clear]'); if (!t) return;
      if (t.dataset.tab) { u.tab = t.dataset.tab; u.f = []; el.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-pressed', String(x === t))); paintQf(); }
      else if (t.dataset.st) { u.status = t.dataset.st; el.querySelectorAll('[data-st]').forEach(x => x.setAttribute('aria-pressed', String(x === t))); }
      else if (t.dataset.f) { const k = t.dataset.f; u.f = u.f.includes(k) ? u.f.filter(x => x !== k) : [...u.f, k]; t.setAttribute('aria-pressed', String(u.f.includes(k))); }
      else { u.q = ''; u.status = 'all'; u.f = []; el.querySelector('#accQ').value = ''; el.querySelectorAll('[data-st]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.st === 'all'))); paintQf(); }
      flip();
    });
  }

  /* ---------- shared detail parts ---------- */
  const history = a => {
    const rows = S().audit.filter(e => String(e.target).includes('(' + a.id + ')')).slice().reverse();
    return `<section class="acc-sec" aria-labelledby="accHist"><h2 class="t-h3" id="accHist">Admin history</h2>
      ${rows.length ? `<ol class="acc-hist">${rows.map(e => `<li><span class="acc-hist-a">${esc(e.action)}</span><span class="acc-hist-d">${esc(e.detail || '')}</span><span class="acc-hist-w num">${esc(e.who)} · ${esc(L.fmtDate(e.at))} · <code>${esc(e.hash)}</code></span></li>`).join('')}</ol>`
        : `<p class="muted">No admin actions on this account yet.</p>`}
      <a class="btn-q" href="#audit">${L.icon('shield')}Full audit log</a></section>`;
  };
  function security(kind, a) {
    const ss = sessions(kind, a), first = String(kind === 'brand' ? a.contact : a.name).split(' ')[0];
    return `<section class="acc-sec acc-card acc-secu" aria-labelledby="accSec">
      <h2 class="t-h3" id="accSec">Status and security</h2>
      <div class="acc-status">${stPill(a)}<p>${a.status === 'suspended' ? `Suspended by ${esc(a.suspended.by || 'Linkloom team')} on ${esc(L.fmtDate(a.suspended.at))}. ${esc(a.suspended.reason || '')}` : (a.lastActive ? `Last active ${esc(L.ago(a.lastActive))}.` : `Joined ${esc(L.ago(a.joined))}.`)}</p></div>
      ${a.status === 'suspended'
        ? `<button class="lq lq-s lq-sm" type="button" data-do="reactivate">${L.icon('refund', 'ic')}Reactivate</button>`
        : `<button class="lq lq-ink lq-sm acc-susp" type="button" data-do="suspend">${L.icon('lock', 'ic')}Suspend account</button>`}
      <div class="acc-sub"><p class="t-label">Password reset help</p>
        <p class="muted">${kind === 'brand' ? `Sends a reset link to ${esc(A().mailMask(a.email))}. It expires in 30 minutes.` : `${esc(first)} signs in with Google or a mobile OTP. A reset link lets them re-verify ${esc(phone(a.id))} and sign in again.`} Nobody at Linkloom sees or sets a password.</p>
        <button class="lq lq-s lq-sm" type="button" data-do="reset"${a.status === 'suspended' ? ' disabled aria-disabled="true"' : ''}>${L.icon('send', 'ic')}Send reset link</button></div>
      <div class="acc-sub"><div class="row between"><p class="t-label">Signed in on</p><span class="t-cap muted">${ss.length} device${ss.length === 1 ? '' : 's'}</span></div>
        ${ss.length ? `<ul class="acc-sess">${ss.map((x, i) => `<li><span class="acc-sess-t"><b>${esc(x.d)}</b><span>${x.p && x.p !== '—' ? esc(x.p) + ' · ' : 'Location unknown · '}since ${esc(L.ago(x.at))}</span></span><button class="btn-q" type="button" data-do="out" data-i="${i}">Sign out</button></li>`).join('')}</ul>
          <button class="lq lq-s lq-sm" type="button" data-do="outall">${L.icon('logout', 'ic')}Sign out of every device</button>` : `<p class="muted">Not signed in anywhere.</p>`}</div>
    </section>`;
  }
  function wireSecurity(el, kind, a) {
    const target = `${a.name} (${a.id})`, cfm = A().confirm;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-do]'); if (!b || b.disabled) return;
      const d = b.dataset.do;
      if (d === 'suspend') cfm({
        title: `Suspend ${a.name}`, cta: 'Suspend account', danger: true,
        lead: kind === 'brand' ? `Campaigns are hidden, no new hires can start, and money in escrow stays held until each order is settled.` : `${esc(a.name.split(' ')[0])} cannot bid or be hired. Live orders and money in escrow are not touched; settle them in Orders.`,
        reasons: kind === 'brand' ? ['Scam or pay-to-join campaigns', 'Off-platform payment requests', 'Fake business details', 'Abuse or harassment'] : ['Bid ring or linked accounts', 'Scam or off-platform payment', 'Fake reviews or followers', 'Abuse or harassment', 'Under 18'],
        extra: `<label class="check"><input type="checkbox" data-outall checked><span>Also sign out of every device</span></label>`,
        onConfirm: ({ reason, note, body }) => {
          const out = body.querySelector('[data-outall]').checked, why = reason === 'Other' ? note : reason + (note ? ': ' + note : '');
          L.store.set(st => { const x = (kind === 'brand' ? st.brands : st.creators).find(y => y.id === a.id); x.status = 'suspended'; x.suspended = { at: stamp(), by: st.me.name, reason: why }; if (kind === 'creator') x.featured = false; }, 'account');
          if (out) ui().sess[a.id] = [];
          L.audit('account.suspend', target, why + (out ? ' · signed out everywhere' : ''));
          L.route();
        }
      });
      else if (d === 'reactivate') cfm({
        title: `Reactivate ${a.name}`, cta: 'Reactivate',
        lead: `${a.suspended ? `Suspended by ${esc(a.suspended.by || 'Linkloom team')} on ${esc(L.fmtDate(a.suspended.at))}: “${esc(a.suspended.reason || 'no reason recorded')}”. ` : ''}Once reactivated they can sign in, bid and be hired again. Badges and featured status do not come back on their own.`,
        reasons: ['Appeal accepted', 'Suspended by mistake', 'Issue resolved'],
        onConfirm: ({ reason, note }) => {
          const was = a.suspended && (a.suspended.by || 'Linkloom team');
          L.store.set(st => { const x = (kind === 'brand' ? st.brands : st.creators).find(y => y.id === a.id); x.status = 'active'; delete x.suspended; }, 'account');
          L.audit('account.reactivate', target, (reason === 'Other' ? note : reason + (note ? ': ' + note : '')) + (was ? ` · was suspended by ${was}` : ''));
          L.route();
        }
      });
      else if (d === 'reset') cfm({
        title: 'Send a reset link', cta: 'Send link',
        lead: kind === 'brand' ? `To ${esc(A().mailMask(a.email))}. Check it is really ${esc(a.contact)} before you send.` : `By SMS to ${esc(phone(a.id))}. Check it is really ${esc(a.name)} before you send.`,
        reasonLabel: 'How you confirmed it is them',
        reasons: kind === 'brand' ? ['Mail from the registered address', 'Called the registered number', 'Matched last invoice amount'] : ['OTP to the registered mobile', 'Matched last payout amount', 'Video call with ID'],
        placeholder: 'Support ticket number or a short note',
        onConfirm: ({ reason, note }) => { L.audit('account.password_reset', target, 'Reset link sent · ' + (reason === 'Other' ? note : reason) + (note && reason !== 'Other' ? ' · ' + note : '')); L.route(); }
      });
      else if (d === 'out' || d === 'outall') {
        const ss = sessions(kind, a), one = d === 'out' ? ss[+b.dataset.i] : null;
        cfm({
          title: one ? `Sign out ${one.d}` : 'Sign out of every device', cta: 'Sign out', danger: true,
          lead: `${one ? 'That device' : `All ${ss.length} devices`} must sign in again. Nothing else changes.`,
          reasons: ['Account may be compromised', 'Lost or shared device', 'They asked for it'],
          onConfirm: ({ reason, note }) => {
            const u = ui(); u.sess[a.id] = one ? ss.filter(x => x !== one) : [];
            L.audit('account.sessions_invalidate', target, (one ? one.d : 'All devices') + ' · ' + (reason === 'Other' ? note : reason));
            L.route();
          }
        });
      }
    });
  }
  const missing = (kind, back) => `<div class="view-in"><div class="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt=""><p class="t-h2">No ${kind} with that link.</p><p class="muted">Search the accounts list instead.</p><button class="lq lq-p" type="button" data-go="#accounts">Accounts</button></div></div>`;

  /* ---------- creator detail ---------- */
  function creatorView(el, id) {
    const s = S(), c = L.creator(id); if (!c) { el.innerHTML = missing('creator'); return; }
    ui().tab = 'creator';
    const orders = s.orders.filter(o => o.creator === c.id), live = orders.filter(o => L.liveOrders().includes(o));
    const reps = s.reports.filter(r => String(r.target).includes(c.name));
    const v = s.verifications.find(x => x.account === c.id);
    const susp = c.status === 'suspended';
    el.innerHTML = `<div class="view-in acc acc-d">
      <a class="btn-q acc-back" href="#accounts">${L.icon('back')}Accounts</a>
      <header class="acc-mast">
        ${av('creator', c.name, 'acc-av')}
        <div class="acc-mast-t"><p class="acc-kind acc-kind--c"><i class="dot"></i>Creator · ${esc(c.city)} · joined ${esc(L.fmtDate(c.joined, { year: true }))}</p>
          <h1 class="t-h1">${esc(c.name)}</h1>
          <p class="acc-mast-m">${c.handle ? `<span class="acc-handle">${esc(c.handle)}</span>` : '<span class="muted">No handle yet</span>'}${kycPill(c.kyc)}${v && v.status === 'pending' ? `<a class="btn-q" href="#verify-${esc(v.id)}">Open KYC request</a>` : ''}</p></div>
        <div class="acc-mast-s">${stPill(c)}</div>
      </header>
      <dl class="acc-band">
        <div><dt>Followers</dt><dd class="t-money">${c.followers ? esc(L.compact(c.followers)) : '—'}</dd><p>Instagram and YouTube</p></div>
        <div><dt>Engagement</dt><dd class="t-money">${c.er != null ? c.er.toFixed(1) + '%' : '—'}</dd><p>${c.er > 12 ? 'Unusually high, check for bought likes' : 'average per post'}</p></div>
        <div><dt>Approved jobs</dt><dd class="t-money">${c.jobs}</dd><p>${c.rating ? `rated ${c.rating.toFixed(1)} by brands` : 'no ratings yet'}</p></div>
        <div><dt>Paid out</dt><dd class="t-money">${L.inr(c.earned)}</dd><p>${live.length ? `${live.length} live order${live.length > 1 ? 's' : ''} in escrow` : 'nothing in escrow now'}</p></div>
      </dl>
      <p class="acc-sample"><span class="sample">Sample figures</span></p>
      <div class="acc-grid">
        <div class="acc-col">
          <section class="acc-sec" aria-labelledby="accBdg"><h2 class="t-h2" id="accBdg">Badges</h2>
            <p class="muted">Badges show on the creator’s public profile and in brand search.</p>
            <ul class="acc-badges">${BADGES.map(([b, d]) => { const on = c.badges.includes(b), need = b === 'Verified Pro' && c.kyc !== 'verified' && !on;
              return `<li><button class="acc-bd" type="button" data-badge="${esc(b)}" aria-pressed="${on}"${need || susp ? ' disabled' : ''}>
                <span class="acc-bd-i">${L.icon('verified')}</span><span class="acc-bd-t"><b>${esc(b)}</b><span>${need ? 'Needs verified KYC first' : esc(d)}</span></span>
                <span class="acc-sw" aria-hidden="true"><i></i></span></button></li>`; }).join('')}</ul>
          </section>
          <section class="acc-sec" aria-labelledby="accTag"><div class="row between"><h2 class="t-h2" id="accTag">Category tags</h2><button class="lq lq-s lq-sm" type="button" data-tags>${L.icon('edit', 'ic')}Edit tags</button></div>
            <div class="chips acc-tagl">${c.tags.length ? c.tags.map(t => `<span class="pill pill-line">${esc(t)}</span>`).join('') : '<p class="muted">No tags yet. Tags decide which brand searches they show up in.</p>'}</div>
          </section>
          <section class="acc-sec" aria-labelledby="accFeat"><h2 class="t-h2" id="accFeat">Featured</h2>
            <button class="acc-bd acc-bd--wide" type="button" data-feature aria-pressed="${c.featured}"${susp ? ' disabled' : ''}>
              <span class="acc-bd-i acc-bd-i--star">${L.icon('star')}</span><span class="acc-bd-t"><b>${c.featured ? 'Featured on Discover' : 'Not featured'}</b><span>${susp ? 'Suspended accounts cannot be featured' : 'Shown in the top row of brand search. Order is set in Marketplace.'}</span></span>
              <span class="acc-sw" aria-hidden="true"><i></i></span></button>
            <a class="btn-q" href="#marketplace-featured">Featured order${L.icon('arrow')}</a>
          </section>
          <section class="acc-sec" aria-labelledby="accRep"><h2 class="t-h2" id="accRep">Reports</h2>
            ${reps.length ? `<ul class="acc-reps">${reps.map(r => `<li><a href="#moderation-${esc(r.id)}"><span class="acc-reps-t"><b>${esc(r.reason)}</b><span>${esc(r.target)} · by ${esc(r.by)} · ${esc(L.ago(r.at))}</span></span>
              <span class="pill ${r.status === 'open' ? 'pill-warn' : 'pill-paper'}">${r.status === 'open' ? L.icon('flag') + 'Open' : r.status === 'actioned' ? L.icon('check') + esc(r.action || 'Actioned') : 'Dismissed'}</span></a></li>`).join('')}</ul>`
              : `<p class="muted">No reports against ${esc(c.name.split(' ')[0])}.</p>`}
          </section>
        </div>
        <div class="acc-col acc-col--side">
          ${security('creator', c)}
          <section class="acc-sec acc-card" aria-labelledby="accOrd"><h2 class="t-h3" id="accOrd">Orders</h2>
            ${orders.length ? `<ul class="acc-ord">${orders.slice(0, 5).map(o => `<li><a href="#orders-${esc(o.id)}"><span><b>${esc(o.title)}</b><span>${esc((L.brand(o.brand) || {}).name || '')}</span></span><span class="num">${L.inr(o.amount)}</span></a></li>`).join('')}</ul>` : '<p class="muted">No orders yet.</p>'}
          </section>
          ${history(c)}
        </div>
      </div>
    </div>`;
    L.liquid(el);
    mo('stagger', [...el.querySelectorAll('.acc-sec')]);
    wireSecurity(el, 'creator', c);
    const target = `${c.name} (${c.id})`;
    el.addEventListener('click', e => {
      const bd = e.target.closest('[data-badge]'), ft = e.target.closest('[data-feature]'), tg = e.target.closest('[data-tags]');
      if (bd && !bd.disabled) {
        const b = bd.dataset.badge, on = !c.badges.includes(b);
        L.store.set(() => { c.badges = on ? [...c.badges, b] : c.badges.filter(x => x !== b); }, 'badge');
        bd.setAttribute('aria-pressed', String(on));
        L.audit(on ? 'creator.badge_add' : 'creator.badge_remove', target, b);
        L.toast('Logged to audit', 'check'); refreshHist();
      } else if (ft && !ft.disabled) {
        const on = !c.featured;
        L.store.set(() => { c.featured = on; }, 'featured');
        ft.setAttribute('aria-pressed', String(on)); ft.querySelector('.acc-bd-t b').textContent = on ? 'Featured on Discover' : 'Not featured';
        L.audit(on ? 'creator.feature' : 'creator.unfeature', target, on ? 'Added to featured creators' : 'Removed from featured creators');
        L.toast('Logged to audit', 'check'); refreshHist();
      } else if (tg) editTags(c, target);
    });
    const refreshHist = () => { const h = el.querySelector('[aria-labelledby="accHist"]'); if (h) { h.outerHTML = history(c); } };
  }
  function editTags(c, target) {
    const cats = S().categories, MAX = 4;
    let pick = [...c.tags];
    L.openSheet({
      title: `Tags for ${c.name}`,
      body: `<div class="adm-form"><p class="adm-lead">Pick up to ${MAX}. Brands filter search by these, so keep them to what ${esc(c.name.split(' ')[0])} actually makes.</p>
        <div class="chips acc-tagpick" role="group" aria-label="Categories">${cats.map(t => `<button class="chip" type="button" data-t="${esc(t)}" aria-pressed="${pick.includes(t)}">${esc(t)}</button>`).join('')}</div>
        <p class="help" aria-live="polite" data-n></p>${A().LOGLINE}
        <div class="adm-btns"><button class="lq lq-p" type="button" data-save>Save tags</button><button class="lq lq-s" type="button" data-cancel>Cancel</button></div></div>`,
      onMount(b, close) {
        const n = b.querySelector('[data-n]');
        const paint = () => { n.textContent = `${pick.length} of ${MAX} chosen`; b.querySelectorAll('[data-t]').forEach(x => { const on = pick.includes(x.dataset.t); x.setAttribute('aria-pressed', String(on)); x.disabled = !on && pick.length >= MAX; }); };
        paint();
        b.addEventListener('click', e => {
          const t = e.target.closest('[data-t]');
          if (t) { const v = t.dataset.t; pick = pick.includes(v) ? pick.filter(x => x !== v) : [...pick, v]; paint(); }
          else if (e.target.closest('[data-cancel]')) close();
          else if (e.target.closest('[data-save]')) {
            const before = c.tags.join(', ') || 'none';
            L.store.set(() => { c.tags = [...pick]; }, 'tags');
            L.audit('creator.tags_edit', target, `${before} → ${pick.join(', ') || 'none'}`);
            close(); L.toast('Logged to audit', 'check'); L.route();
          }
        });
      }
    });
  }

  /* ---------- brand detail ---------- */
  /* posting days over the last 30 days: new accounts post from their join day; others spread deterministically */
  function postDays(b) {
    const today = L.today(), days = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(today.getTime() - i * 864e5); days.push({ d, n: 0 }); }
    const joinIdx = Math.max(0, days.findIndex(x => L.fmtDate(x.d.toISOString()) === L.fmtDate(b.joined)));
    const camp = S().campaigns.filter(k => k.brand === b.id);
    const span = Math.max(1, Math.min(29 - joinIdx, 30)) ; // days from join to yesterday
    const n = b.postsLast30;
    if (joinIdx > 0 && 30 - joinIdx <= 4) { const last = Math.max(1, 29 - joinIdx); for (let i = 0; i < n; i++) days[joinIdx + Math.min(last - 1, Math.floor(i * last / n))].n++; }
    else { const h = hash(b.id); for (let i = 0; i < n; i++) days[(joinIdx + Math.floor((i + .5) * span / n) + h % 3) % 30].n++; }
    camp.forEach(k => { const i = days.findIndex(x => L.fmtDate(x.d.toISOString()) === L.fmtDate(k.posted)); if (i >= 0 && !days[i].n) days[i].n = 1; });
    return days;
  }
  function chart(b) {
    const days = postDays(b), max = Math.max(3, ...days.map(x => x.n));
    const W = 300, H = 96, bw = 8, gap = 2, top = 8;
    const y = v => H - (v / max) * (H - top);
    const bars = days.map((x, i) => x.n ? `<rect class="acc-ch-b" x="${i * (bw + gap)}" y="${y(x.n)}" width="${bw}" height="${H - y(x.n)}" rx="2" data-i="${i}"/>` : `<rect class="acc-ch-z" x="${i * (bw + gap)}" y="${H - 1}" width="${bw}" height="1"/>`).join('');
    const hits = days.map((x, i) => `<rect class="acc-ch-h" x="${i * (bw + gap)}" y="0" width="${bw + gap}" height="${H}" data-i="${i}"/>`).join('');
    const avgDay = b.postsAvg / 30;
    const peak = days.reduce((m, x) => x.n > m.n ? x : m, days[0]);
    const recent = days.slice(-3).reduce((n, x) => n + x.n, 0);
    const pct = b.postsAvg ? Math.round((b.postsLast30 / b.postsAvg - 1) * 100) : null;
    return { days, html: `
      <div class="acc-cmp">
        <div><span>Last 30 days</span><b class="t-money">${b.postsLast30}</b><i style="--w:${Math.min(100, b.postsLast30 / Math.max(b.postsLast30, b.postsAvg, 1) * 100)}%"></i></div>
        <div><span>Usual month</span><b class="t-money">${b.postsAvg ? b.postsAvg.toFixed(1) : 'None'}</b><i class="is-avg" style="--w:${b.postsAvg ? b.postsAvg / Math.max(b.postsLast30, b.postsAvg, 1) * 100 : 0}%"></i></div>
        <p class="${spike(b) ? 'acc-cmp-bad' : ''}">${spike(b) ? L.icon('alert') : ''}${b.postsAvg ? (pct > 0 ? `${pct}% above their usual pace` : pct < 0 ? `${-pct}% below their usual pace` : 'On their usual pace') : `New account: no usual pace yet`}${spike(b) && peak.n ? `. ${b.postsLast30} posted in ${days.filter(x => x.n).length} days` : ''}.</p>
      </div>
      <figure class="acc-ch">
        <figcaption class="sr-only">Campaigns posted per day, last 30 days</figcaption>
        <div class="acc-ch-w"><svg viewBox="0 0 ${W - gap} ${H}" preserveAspectRatio="none" aria-hidden="true">
          ${[max].map(v => `<line class="acc-ch-g" x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}
          ${bars}${avgDay ? `<line class="acc-ch-avg" x1="0" x2="${W}" y1="${y(avgDay)}" y2="${y(avgDay)}"/>` : ''}${hits}</svg>
          <span class="acc-ch-ymax num" style="top:${y(max) / H * 100}%">${max}</span>
          <div class="acc-tip" role="status" hidden></div></div>
        <div class="acc-ch-x num"><span>${esc(L.fmtDate(days[0].d.toISOString()))}</span><span>${esc(L.fmtDate(days[15].d.toISOString()))}</span><span>Today</span></div>
        <table class="sr-only"><caption>Campaigns posted per day</caption><tr><th scope="col">Day</th><th scope="col">Posts</th></tr>${days.filter(x => x.n).map(x => `<tr><td>${esc(L.fmtDate(x.d.toISOString()))}</td><td>${x.n}</td></tr>`).join('')}</table>
      </figure>
      <p class="t-cap muted">Bars: campaigns posted each day.${avgDay ? ' Dashed line: their usual daily pace.' : ''} Last 3 days: ${recent}.</p>` };
  }
  function brandView(el, id) {
    const s = S(), b = L.brand(id); if (!b) { el.innerHTML = missing('brand'); return; }
    ui().tab = 'brand';
    const camps = s.campaigns.filter(k => k.brand === b.id), v = s.verifications.find(x => x.account === b.id);
    const reps = s.reports.filter(r => String(r.target).includes(b.name));
    const free = A().freeMail(b.email), st = A().gstState(b.gstin);
    const ch = chart(b);
    el.innerHTML = `<div class="view-in acc acc-d">
      <a class="btn-q acc-back" href="#accounts">${L.icon('back')}Accounts</a>
      <header class="acc-mast">
        ${av('brand', b.name, 'acc-av')}
        <div class="acc-mast-t"><p class="acc-kind acc-kind--b"><i class="dot"></i>Brand${b.city && b.city !== '—' ? ' · ' + esc(b.city) : ''} · joined ${esc(L.fmtDate(b.joined, { year: true }))}</p>
          <h1 class="t-h1">${esc(b.name)}</h1>
          <p class="acc-mast-m"><span>${esc(b.contact)}</span>${kycPill(b.verify)}${v && v.status === 'pending' ? `<a class="btn-q" href="#verify-${esc(v.id)}">Open verification request</a>` : ''}</p></div>
        <div class="acc-mast-s">${stPill(b)}</div>
      </header>
      <dl class="acc-band">
        <div><dt>Posted in 30 days</dt><dd class="t-money">${b.postsLast30}</dd><p>${spike(b) ? 'well above normal' : 'campaigns'}</p></div>
        <div><dt>Open now</dt><dd class="t-money">${b.open}</dd><p>campaigns taking bids</p></div>
        <div><dt>Paid via escrow</dt><dd class="t-money">${L.inr(b.spent)}</dd><p>all time</p></div>
        <div><dt>Reports</dt><dd class="t-money">${b.reports}</dd><p>${reps.filter(r => r.status === 'open').length} open in moderation</p></div>
      </dl>
      <p class="acc-sample"><span class="sample">Sample figures</span></p>
      <div class="acc-grid">
        <div class="acc-col">
          <section class="acc-sec" aria-labelledby="accPost"><h2 class="t-h2" id="accPost">Campaign posting</h2>${ch.html}</section>
          <section class="acc-sec" aria-labelledby="accCo"><h2 class="t-h2" id="accCo">Company</h2>
            <dl class="acc-kv">
              <div><dt>Legal name</dt><dd>${b.legal ? esc(b.legal) : '<span class="muted">Not provided</span>'}</dd></div>
              <div><dt>GSTIN</dt><dd>${b.gstin ? `<span class="acc-mono">${esc(b.gstin)}</span>` : '<span class="muted">Not provided</span>'}${b.gstin ? (b.regVerified ? `<span class="acc-m is-ok">${L.icon('check')}Verified on the GST portal${st ? ' · ' + esc(st) : ''}</span>` : `<span class="acc-m is-warn">${L.icon('info')}Not checked yet</span>`) : `<span class="acc-m is-bad">${L.icon('alert')}No company registration</span>`}</dd></div>
              <div><dt>Company PAN</dt><dd>${b.gstin ? `<span class="acc-mono">${esc(A().mask(b.gstin.slice(2, 12)))}</span><span class="acc-m is-ok">${L.icon('check')}Read from the GSTIN</span>` : '<span class="muted">—</span>'}</dd></div>
              <div><dt>Business mail</dt><dd>${esc(b.email)}${free ? `<span class="acc-m is-bad">${L.icon('alert')}Free mailbox, not a company domain</span>` : b.mailVerified ? `<span class="acc-m is-ok">${L.icon('check')}Verified by link</span>` : `<span class="acc-m is-bad">${L.icon('alert')}Not verified</span>`}</dd></div>
            </dl>
          </section>
          <section class="acc-sec" aria-labelledby="accCamp"><h2 class="t-h2" id="accCamp">Campaigns</h2>
            ${camps.length ? `<ul class="acc-reps">${camps.map(k => `<li><a href="#marketplace-campaigns"><span class="acc-reps-t"><b>${esc(k.title)}</b><span>${k.platform === 'youtube' ? 'YouTube' : 'Instagram'} · ${L.inr(k.budget)} · ${k.bids} bids · ${esc(L.ago(k.posted))}</span></span>
              ${k.flags ? `<span class="pill pill-err">${L.icon('alert')}${k.flags} flag${k.flags > 1 ? 's' : ''}</span>` : `<span class="pill pill-paper">${esc(k.status === 'live' ? 'Live' : k.status)}</span>`}</a></li>`).join('')}</ul>` : `<p class="muted">No campaigns posted yet.</p>`}
          </section>
        </div>
        <div class="acc-col acc-col--side">${security('brand', b)}${history(b)}</div>
      </div>
    </div>`;
    L.liquid(el);
    mo('stagger', [...el.querySelectorAll('.acc-sec')]);
    wireSecurity(el, 'brand', b);
    /* chart hover / focus tooltip */
    const w = el.querySelector('.acc-ch-w'), tip = el.querySelector('.acc-tip');
    if (w) {
      const show = i => { const x = ch.days[i]; tip.innerHTML = `<b>${x.n} posted</b><span>${esc(L.fmtDate(x.d.toISOString()))}</span>`; tip.hidden = false; tip.style.left = ((+i + .5) / 30 * 100) + '%';
        w.querySelectorAll('.acc-ch-b').forEach(r => r.classList.toggle('is-on', r.dataset.i === String(i))); };
      const hide = () => { tip.hidden = true; w.querySelectorAll('.acc-ch-b.is-on').forEach(r => r.classList.remove('is-on')); };
      w.addEventListener('pointermove', e => { const r = e.target.closest('.acc-ch-h'); if (r) show(+r.dataset.i); });
      w.addEventListener('pointerleave', hide);
    }
  }

  L.register('accounts', { title: 'Accounts', nav: 'accounts', render: el => list(el) });
  L.register('creator', { title: id => (L.creator(id) || {}).name || 'Creator', nav: 'accounts',
    crumb: id => `<a href="#accounts">Accounts</a>${L.creator(id) ? ' / ' + esc(L.creator(id).name) : ''}`, render: (el, id) => creatorView(el, id) });
  L.register('brand', { title: id => (L.brand(id) || {}).name || 'Brand', nav: 'accounts',
    crumb: id => `<a href="#accounts">Accounts</a>${L.brand(id) ? ' / ' + esc(L.brand(id).name) : ''}`, render: (el, id) => brandView(el, id) });
})();
