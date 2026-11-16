/* Orders & escrow (#orders, #orders-disputes, #orders-<orderId>, #orders-<disputeId>). Builder D.
   Mirrors the brand Campaigns list and board (ticket rows, stage rail with a money lane) and the creator Earnings slip.
   Lifecycle: invited → accepted → funded → in_progress → submitted → revision → approved → released, or disputed / refunded.
   Money: integer paise. Commission is LLD_DATA.rules.commissionPct (0%): ₹0 on every order, read only.
   The gateway fee (rules.gatewayPct, 2%) is a Linkloom cost, never charged to brands or creators.
   Colour is meaning: coral = creator, violet = brand, plum = escrow, butter = Linkloom (you). Status colours only for status.
   Every arbitration action opens a confirm sheet, needs a reason, calls LLD.audit() and toasts "Logged to audit". */
(() => {
  const L = window.LLD, esc = L.esc, ic = L.icon, M = () => L.motion;
  const S = () => window.LLD_DATA;
  const A = window.LLD_A = window.LLD_A || {};
  const TODAY = '2026-11-04';

  const STAGES = [
    { k: 'invited', n: 'Invited', d: 'Brand invited, creator to answer' }, { k: 'accepted', n: 'Accepted', d: 'Brand to pay into escrow' },
    { k: 'funded', n: 'Paid in', d: 'In escrow, creator starting' }, { k: 'in_progress', n: 'In progress', d: 'Creator making the content' },
    { k: 'submitted', n: 'Delivered', d: 'Brand to review' }, { k: 'revision', n: 'Revision', d: 'Creator reworking' },
    { k: 'approved', n: 'Approved', d: 'Release due within 24 h' }, { k: 'released', n: 'Released', d: 'Paid to the creator' }
  ];
  const BRANCH = [{ k: 'disputed', n: 'Disputed', d: 'Held until you arbitrate' }, { k: 'refunded', n: 'Refunded', d: 'Returned to the brand' }];
  const ALL = [...STAGES, ...BRANCH];
  const NAME = k => (ALL.find(x => x.k === k) || { n: k }).n;
  const HELD = ['funded', 'in_progress', 'submitted', 'revision', 'approved', 'disputed'];
  const pay = o => o.phase === 'released' ? 'released' : o.phase === 'refunded' ? 'refunded' : HELD.includes(o.phase) ? 'held' : 'none';
  const who = o => ({ invited: 'creator', accepted: 'brand', funded: 'creator', in_progress: 'creator', submitted: 'brand', revision: 'creator', approved: 'you', disputed: 'dispute' })[o.phase] || 'done';
  const WHO = { creator: 'Creator’s move', brand: 'Brand’s move', you: 'Linkloom releases', dispute: 'Needs arbitration', done: 'Closed' };
  const whoPill = o => ({ creator: 'pill-coral', brand: 'pill-violet', you: 'pill-butter', dispute: 'pill-err', done: 'pill-ok' })[who(o)];
  const lockIc = () => ic('lock');
  const payPill = o => ({
    none: `<span class="pill pill-line">${o.phase === 'accepted' ? 'Not paid in yet' : 'Nothing paid'}</span>`,
    held: `<span class="pill pill-escrow">${lockIc()}In escrow</span>`,
    released: `<span class="pill pill-ok">${ic('check')}Released</span>`,
    refunded: `<span class="pill pill-info">${ic('refund')}Refunded</span>`
  })[pay(o)];
  /* where a disputed or refunded order stopped on the rail */
  const stopAt = o => o.stoppedAt || (o.phase === 'refunded' ? 'in_progress' : 'submitted');
  const ix = o => { const i = STAGES.findIndex(x => x.k === o.phase); return i >= 0 ? i : STAGES.findIndex(x => x.k === stopAt(o)); };

  /* money per order: commission at the platform rate (0%), gateway at its rate, paid by Linkloom */
  A.orderMoney = o => {
    const r = S().rules, commission = Math.round(o.amount * r.commissionPct / 100), gateway = Math.round(o.amount * r.gatewayPct / 100);
    return { price: o.amount, commission, gateway, creatorGets: o.amount - commission, linkloom: commission - gateway };
  };
  const order = id => S().orders.find(o => o.id === id);
  const dispute = id => S().disputes.find(d => d.id === id);
  const disputeOf = o => S().disputes.find(d => d.order === o.id && d.status === 'open') || S().disputes.find(d => d.order === o.id);
  const first = n => String(n || '').split(' ')[0];
  const cav = (c, cls = '') => `<span class="avatar or-av ${cls}" aria-hidden="true">${esc(L.initials(c ? c.name : '?'))}</span>`;
  const bav = (b, cls = '') => `<span class="avatar v or-av ${cls}" aria-hidden="true">${esc(L.initials(b ? b.name : '?'))}</span>`;
  const pair = o => { const b = L.brand(o.brand), c = L.creator(o.creator); return `<span class="or-pair">${bav(b)}${cav(c)}</span>`; };
  const time = s => L.D(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase());
  const sla = d => {
    if (d.status !== 'open') return { t: 'Resolved', cls: 'is-ok' };
    const n = L.daysLeft(d.sla);
    return n < 0 ? { t: `${-n} day${n === -1 ? '' : 's'} overdue`, cls: 'is-late' } : n === 0 ? { t: 'Due today', cls: 'is-late' } : n === 1 ? { t: 'Due tomorrow', cls: 'is-soon' } : { t: `Due ${L.fmtDate(d.sla)} · ${n} days`, cls: '' };
  };
  const dueTxt = o => {
    if (o.phase === 'released') return 'Released ' + L.fmtDate(o.released || TODAY);
    if (o.phase === 'refunded') return 'Refunded ' + L.fmtDate(o.refunded || TODAY);
    if (!o.due) return 'No due date';
    const n = L.daysLeft(o.due);
    return n < 0 ? `${-n} day${n === -1 ? '' : 's'} past due` : n === 0 ? 'Due today' : `Due ${L.fmtDate(o.due)} · ${n} day${n === 1 ? '' : 's'}`;
  };
  const kindTag = d => d.kind === 'payment' ? `<span class="pill pill-info">${ic('wallet')}Payment complaint</span>` : `<span class="pill pill-err">${ic('alert')}Dispute</span>`;
  const byChip = d => { const o = order(d.order), p = d.by === 'creator' ? L.creator(o.creator) : L.brand(o.brand); return `<span class="or-by is-${d.by}"><i aria-hidden="true"></i>Opened by ${esc(p ? p.name : d.by)} <span class="muted">(${d.by})</span></span>`; };

  /* ---------- shared confirm sheet: summary, consequences, required reason, logged ---------- */
  A.confirmAction = ({ title, action, target, yes, mini, bullets, danger, onYes, min = 12 }) => {
    const id = 'orR' + Date.now().toString(36);
    L.openSheet({
      title, body: `<form class="or-cf" novalidate>
        ${mini || ''}
        ${bullets && bullets.length ? `<ul class="or-cf-b">${bullets.map(b => `<li>${ic('arrow')}<span>${esc(b)}</span></li>`).join('')}</ul>` : ''}
        <div class="field"><label for="${id}">Reason <span class="muted">(required)</span></label>
          <textarea class="textarea" id="${id}" name="reason" maxlength="400" aria-describedby="${id}h ${id}e" placeholder="What you checked and why this is fair to both sides"></textarea>
          <p class="help or-cf-h" id="${id}h"><span>At least ${min} characters. Both sides see this reason.</span><span class="num" data-cnt>0 / 400</span></p>
          <p class="err or-cf-e" id="${id}e" aria-live="polite" hidden>${ic('alert')}<span>Add a reason of at least ${min} characters.</span></p></div>
        <p class="or-cf-log">${ic('shield')}<span>This is logged to the audit log as <code>${esc(action)}</code> on <b>${esc(target)}</b>, with your name and the time. Entries can’t be edited or deleted.</span></p>
        <div class="or-cf-a"><button class="lq ${danger ? 'lq-ink' : 'lq-p'}" type="submit">${esc(yes)}</button><button class="lq lq-s" type="button" data-cancel>Cancel</button></div>
      </form>`,
      onMount(b, close) {
        const f = L.$('form', b), ta = L.$('textarea', b), cnt = L.$('[data-cnt]', b), er = L.$('.or-cf-e', b), fld = ta.closest('.field');
        ta.addEventListener('input', () => { cnt.textContent = ta.value.length + ' / 400'; if (ta.value.trim().length >= min) { er.hidden = true; fld.classList.remove('is-err'); ta.removeAttribute('aria-invalid'); } });
        L.$('[data-cancel]', b).addEventListener('click', () => close());
        f.addEventListener('submit', e => {
          e.preventDefault();
          const r = ta.value.trim();
          if (r.length < min) { er.hidden = false; fld.classList.add('is-err'); ta.setAttribute('aria-invalid', 'true'); ta.focus(); M().shake && M().shake(ta); return; }
          close();
          const entry = onYes(r);
          L.toast('Logged to audit', 'check');
          return entry;
        });
      }
    });
  };

  /* ---------- the arbitration actions (dispute or order) ---------- */
  const tgt = (o, d) => `Order ${o.id}${d ? ' · ' + (d.kind === 'payment' ? 'complaint ' : 'dispute ') + d.id : ''}`;
  function forceRelease(o, d, after) {
    const c = L.creator(o.creator), b = L.brand(o.brand), m = A.orderMoney(o);
    A.confirmAction({
      title: 'Force release to creator', action: 'escrow.force_release', target: tgt(o, d), yes: `Release ${L.inr(m.creatorGets)} to ${first(c.name)}`, danger: true,
      mini: miniFlow(o, 'release'),
      bullets: [`${L.inr(m.creatorGets)} leaves escrow for ${c.name}’s payout method today.`, `${b.name} is told the work was accepted on review and can’t be refunded later.`, d ? `${d.kind === 'payment' ? 'The complaint' : 'The dispute'} is marked resolved.` : 'The order closes as released.'],
      onYes(reason) {
        const e = L.audit('escrow.force_release', tgt(o, d), `${L.inr(m.creatorGets)} to ${c.name}. ${reason}`);
        L.store.set(s => {
          const x = s.orders.find(q => q.id === o.id); x.stoppedAt = x.stoppedAt || (x.phase === 'disputed' ? 'submitted' : x.phase); x.phase = 'released'; x.released = TODAY; x.forced = 'release';
          const po = s.finance.payouts.find(p => p.order === o.id);
          if (po) { po.status = 'processing'; po.at = TODAY; } else s.finance.payouts.unshift({ id: 'po' + (s.finance.payouts.length + 1), creator: o.creator, amount: m.creatorGets, order: o.id, at: TODAY, method: 'Payout method on file', utr: null, status: 'processing' });
          if (d) { const y = s.disputes.find(q => q.id === d.id); Object.assign(y, { status: 'resolved', outcome: `Released to ${c.name}`, reason, by_admin: s.me.name, resolvedAt: e.at, audit: e.id, hash: e.hash }); }
        }, 'force-release');
        after && after('release'); return e;
      }
    });
  }
  function refundBrand(o, d, after) {
    const c = L.creator(o.creator), b = L.brand(o.brand), m = A.orderMoney(o);
    A.confirmAction({
      title: 'Refund the brand', action: 'escrow.refund', target: tgt(o, d), yes: `Refund ${L.inr(m.price)} to ${b.name}`, danger: true,
      mini: miniFlow(o, 'refund'),
      bullets: [`${L.inr(m.price)} goes back to ${b.name}’s original payment method, usually in 5 to 7 working days.`, `${c.name} gets nothing for this order and is told why.`, 'The gateway fee Linkloom paid is not recovered.'],
      onYes(reason) {
        const e = L.audit('escrow.refund', tgt(o, d), `${L.inr(m.price)} to ${b.name}. ${reason}`);
        L.store.set(s => {
          const x = s.orders.find(q => q.id === o.id); x.stoppedAt = x.phase === 'disputed' ? (x.stoppedAt || 'submitted') : x.phase; x.phase = 'refunded'; x.refunded = TODAY; x.forced = 'refund';
          const po = s.finance.payouts.find(p => p.order === o.id && p.status !== 'paid'); if (po) po.status = 'cancelled';
          if (d) { const y = s.disputes.find(q => q.id === d.id); Object.assign(y, { status: 'resolved', outcome: `Refunded to ${b.name}`, reason, by_admin: s.me.name, resolvedAt: e.at, audit: e.id, hash: e.hash }); }
        }, 'refund');
        after && after('refund'); return e;
      }
    });
  }
  function markResolved(o, d, after) {
    A.confirmAction({
      title: 'Mark resolved, no money moves', action: 'dispute.resolve', target: tgt(o, d), yes: 'Mark resolved',
      mini: `<div class="or-mini"><p><b>${esc(o.title)}</b><span class="muted">${esc(L.inr(o.amount))} stays where it is: ${esc(pay(o) === 'held' ? 'in escrow' : pay(o))}</span></p></div>`,
      bullets: ['Use this when the two sides agreed, or the order runs on as normal.', 'Escrow is untouched. The order keeps its current stage.'],
      onYes(reason) {
        const e = L.audit('dispute.resolve', tgt(o, d), reason);
        L.store.set(s => { const y = s.disputes.find(q => q.id === d.id); Object.assign(y, { status: 'resolved', outcome: 'Resolved without moving money', reason, by_admin: s.me.name, resolvedAt: e.at, audit: e.id, hash: e.hash });
          const x = s.orders.find(q => q.id === o.id); if (x.phase === 'disputed') x.phase = x.stoppedAt || 'submitted'; }, 'resolve');
        after && after('resolve'); return e;
      }
    });
  }
  function miniFlow(o, way) {
    const c = L.creator(o.creator), b = L.brand(o.brand);
    const to = way === 'release' ? `<span class="or-flow-p is-creator">${cav(c)}<b>${esc(c.name)}</b></span>` : `<span class="or-flow-p is-brand">${bav(b)}<b>${esc(b.name)}</b></span>`;
    return `<div class="or-flow" aria-label="${esc(`${L.inr(o.amount)} from escrow to ${way === 'release' ? c.name : b.name}`)}">
      <span class="or-flow-p is-escrow"><span class="or-coin" aria-hidden="true">${lockIc()}</span><b>Escrow</b></span>
      <span class="or-flow-l" aria-hidden="true"><b class="t-money">${L.inr(o.amount)}</b><i></i></span>${to}</div>`;
  }

  /* ---------- pipeline ---------- */
  function pipeline(orders, f) {
    const by = k => orders.filter(o => o.phase === k), v = rows => rows.reduce((n, o) => n + o.amount, 0);
    const max = Math.max(1, ...ALL.map(st => v(by(st.k))));
    const cell = (st, i) => { const r = by(st.k), val = v(r), held = HELD.includes(st.k);
      return `<li class="or-pc${r.length ? '' : ' is-zero'}${held ? ' is-held' : ''} is-${st.k}">
        <button type="button" class="or-pc-b" data-ph="${st.k}" aria-pressed="${f === st.k}" aria-label="${esc(`${st.n}: ${r.length} order${r.length === 1 ? '' : 's'}, ${L.inr(val)}. ${st.d}. Filter the list`)}">
          <span class="or-pc-n">${i != null ? '0' + (i + 1) : (st.k === 'disputed' ? ic('alert') : ic('refund'))}</span>
          <span class="or-pc-t">${esc(st.n)}</span>
          <span class="or-pc-c t-money">${r.length}</span>
          <span class="or-pc-v">${val ? L.inr(val) : '—'}</span>
          <span class="or-pc-bar" aria-hidden="true"><i style="width:${val ? Math.max(4, val / max * 100) : 0}%"></i></span>
        </button></li>`; };
    const heldV = v(orders.filter(o => HELD.includes(o.phase) && o.phase !== 'disputed')), dispV = v(by('disputed'));
    return `<section class="or-pipe card" aria-labelledby="orPipeH">
      <div class="or-pipe-top"><h2 class="or-sec-h" id="orPipeH">Lifecycle</h2><p class="help">Orders and value in each phase. Pick a phase to filter the list.</p></div>
      <div class="or-pipe-w">
        <ol class="or-pipe-main">${STAGES.map(cell).join('')}</ol>
        <ol class="or-pipe-br" aria-label="Off the main path">${BRANCH.map(st => cell(st, null)).join('')}</ol>
      </div>
      <div class="or-pipe-hold" aria-hidden="true"><span class="or-pipe-band"></span><span class="or-pipe-hl">${lockIc()}Held in escrow · ${L.inr(heldV)}${dispV ? ` <span>+ ${L.inr(dispV)} disputed</span>` : ''}</span></div>
    </section>`;
  }

  function mini(o) {
    const cur = ix(o), off = o.phase === 'disputed' || o.phase === 'refunded';
    return `<ol class="or-mini-r" aria-hidden="true">${STAGES.map((st, i) => `<li class="${i < cur || (o.phase === 'released') ? 'is-done' : i === cur ? (off ? 'is-' + o.phase : 'is-now') : off ? 'is-off' : ''}"></li>`).join('')}</ol>`;
  }
  function row(o) {
    const b = L.brand(o.brand), c = L.creator(o.creator), d = disputeOf(o), late = o.due && !['released', 'refunded'].includes(o.phase) && L.daysLeft(o.due) < 0;
    return `<li class="or-tk" data-who="${who(o)}" data-id="${esc(o.id)}">
      <div class="or-tk-a">${pair(o)}
        <div class="or-tk-tx"><p class="or-tk-p"><span class="or-b">${esc(b.name)}</span><span aria-hidden="true">→</span><span class="or-c">${esc(c.name)}</span></p>
          <h3 class="or-tk-t"><a class="or-tk-link" href="#orders-${esc(o.id)}">${esc(o.title)}</a></h3>
          <p class="or-tk-id num">${esc(o.id.toUpperCase())}${d && d.status === 'open' ? ` · <span class="or-tk-d">${ic('alert')}${d.kind === 'payment' ? 'Complaint' : 'Dispute'} ${esc(d.id)}</span>` : ''}</p></div></div>
      <div class="or-tk-r">${mini(o)}<p class="or-tk-s"><span class="pill ${whoPill(o)}">${esc(NAME(o.phase))}</span><span>${esc(WHO[who(o)])}</span></p></div>
      <div class="or-tk-m"><p class="t-money or-tk-amt">${L.inr(o.amount)}</p>${payPill(o)}<p class="or-tk-due${late ? ' is-late' : ''}">${ic('clock')}<span>${esc(dueTxt(o))}</span></p></div>
    </li>`;
  }
  function dcard(d) {
    const o = order(d.order), b = L.brand(o.brand), c = L.creator(o.creator), t = sla(d);
    return `<li class="or-dc${d.status === 'open' ? '' : ' is-closed'}" data-by="${d.by}">
      <div class="or-dc-h">${kindTag(d)}<span class="or-sla ${t.cls}">${ic(d.status === 'open' ? 'clock' : 'check')}${esc(t.t)}</span></div>
      <h3 class="or-dc-t"><a class="or-tk-link" href="#orders-${esc(d.id)}">${esc(o.title)}</a></h3>
      <p class="or-tk-p"><span class="or-b">${esc(b.name)}</span><span aria-hidden="true">→</span><span class="or-c">${esc(c.name)}</span><span class="muted">· ${esc(o.id.toUpperCase())}</span></p>
      <blockquote class="or-dc-q">${esc(d.claim)}</blockquote>
      <div class="or-dc-f">${byChip(d)}<span class="or-dc-amt"><span class="t-money">${L.inr(o.amount)}</span>${d.status === 'open' ? payPill(o) : `<span class="pill pill-paper">${esc(d.outcome || 'Resolved')}</span>`}</span></div>
    </li>`;
  }

  /* ---------- #orders list ---------- */
  function renderList(el, tab) {
    const s = S(), ui = s.ui.ord || (s.ui.ord = { q: '', ph: 'all', esc: 'all' });
    const t = tab === 'disputes' ? 'disputes' : 'orders';
    const orders = s.orders, open = s.disputes.filter(d => d.status === 'open');
    const heldNow = L.escrowHeld();
    const ds = [...s.disputes].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || a.sla.localeCompare(b.sla));
    el.innerHTML = `<div class="view-in or">
      <header class="or-head">
        <div class="or-head-t"><h1 class="t-h1">Orders &amp; escrow</h1>
          <p class="muted">Every hire on Linkloom, from invitation to payout. ${open.length} open dispute${open.length === 1 ? '' : 's'} or complaint${open.length === 1 ? '' : 's'}. <span class="sample">Sample data</span></p></div>
        <div class="or-held"><span class="or-coin" aria-hidden="true">${lockIc()}</span>
          <p><span class="or-held-l">Held in escrow, platform-wide</span><b class="t-money" data-held>${L.inr(heldNow)}</b><span class="or-held-s">${L.liveOrders().length} live orders · commission ${s.rules.commissionPct}%</span></p></div>
      </header>
      <div class="seg or-seg" role="group" aria-label="Show">
        <button type="button" data-tab="orders" aria-pressed="${t === 'orders'}">Orders<span class="or-seg-n">${orders.length}</span></button>
        <button type="button" data-tab="disputes" aria-pressed="${t === 'disputes'}">Disputes &amp; complaints<span class="or-seg-n">${open.length}</span></button>
      </div>
      ${t === 'orders' ? `${pipeline(orders, ui.ph)}
      <section class="or-sec" aria-labelledby="orListH">
        <div class="or-filt">
          <h2 class="sr-only" id="orListH">Orders</h2>
          <div class="field or-q"><label class="sr-only" for="orQ">Search orders</label><span class="or-q-i" aria-hidden="true">${ic('search')}</span>
            <input class="input" id="orQ" type="search" placeholder="Search title, brand, creator or order ID" value="${esc(ui.q)}" autocomplete="off"></div>
          <div class="field or-es"><label class="sr-only" for="orEs">Escrow state</label>
            <select class="select" id="orEs">${[['all', 'Any escrow state'], ['held', 'In escrow'], ['released', 'Released'], ['refunded', 'Refunded'], ['none', 'Not paid in']].map(([k, n]) => `<option value="${k}"${ui.esc === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
          <button class="btn-q or-clear" type="button" data-clear>${ic('close')}Clear filters</button>
        </div>
        <p class="or-count help" aria-live="polite" data-count></p>
        <ol class="or-list">${[...orders].sort((a, b) => ['dispute', 'you', 'brand', 'creator', 'done'].indexOf(who(a)) - ['dispute', 'you', 'brand', 'creator', 'done'].indexOf(who(b)) || (a.due || '9').localeCompare(b.due || '9')).map(row).join('')}</ol>
        <div class="empty or-none" hidden><img src="assets/step-03-lock.svg" width="160" height="120" alt=""><p class="t-h2">No orders match</p><p class="muted">Try another phase or clear the filters.</p><button class="lq lq-s lq-sm" type="button" data-clear>Clear filters</button></div>
      </section>` : `
      <section class="or-sec" aria-labelledby="orDisH">
        <div class="or-sec-top"><h2 class="or-sec-h" id="orDisH">Open first, by SLA</h2><p class="help">Disputes freeze escrow. Payment complaints are about money that should have moved.</p></div>
        ${ds.length ? `<ol class="or-dlist">${ds.map(dcard).join('')}</ol>` : `<div class="empty"><img src="assets/step-05-stamp.svg" width="160" height="120" alt=""><p class="t-h2">No disputes</p><p class="muted">When a brand or creator raises one, it lands here with its SLA.</p></div>`}
      </section>`}
    </div>`;
    L.liquid(el);
    M().count(L.$('[data-held]', el), heldNow, L.inr);
    L.$$('.or-seg button', el).forEach(b => b.addEventListener('click', () => { if (b.dataset.tab !== t) L.go(b.dataset.tab === 'disputes' ? '#orders-disputes' : '#orders'); }));
    L.$$('.or-tk,.or-dc', el).forEach(r => r.addEventListener('click', e => { if (e.target.closest('a,button')) return; const a = L.$('.or-tk-link', r); a && a.click(); }));
    if (t === 'disputes') { M().stagger(L.$$('.or-dc', el)); return; }
    const rows = L.$$('.or-tk', el), cnt = L.$('[data-count]', el), none = L.$('.or-none', el), q = L.$('#orQ', el), es = L.$('#orEs', el);
    const match = o => {
      const b = L.brand(o.brand), c = L.creator(o.creator), qq = ui.q.trim().toLowerCase();
      return (ui.ph === 'all' || o.phase === ui.ph) && (ui.esc === 'all' || pay(o) === ui.esc) && (!qq || [o.title, b.name, c.name, o.id].join(' ').toLowerCase().includes(qq));
    };
    const apply = () => {
      let n = 0; rows.forEach(r => { const on = match(order(r.dataset.id)); r.hidden = !on; n += on; });
      none.hidden = n > 0;
      const any = ui.ph !== 'all' || ui.esc !== 'all' || ui.q.trim();
      cnt.textContent = `${n} of ${orders.length} order${orders.length === 1 ? '' : 's'}${ui.ph !== 'all' ? ' · ' + NAME(ui.ph) : ''}`;
      L.$$('[data-clear]', el).forEach(b => { if (b.classList.contains('or-clear')) b.hidden = !any; });
      L.$$('[data-ph]', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ph === ui.ph)));
    };
    apply();
    L.$$('[data-ph]', el).forEach(b => b.addEventListener('click', () => { ui.ph = ui.ph === b.dataset.ph ? 'all' : b.dataset.ph; M().flip(apply, rows); }));
    q.addEventListener('input', () => { ui.q = q.value; apply(); });
    es.addEventListener('change', () => { ui.esc = es.value; M().flip(apply, rows); });
    L.$$('[data-clear]', el).forEach(b => b.addEventListener('click', () => { ui.q = ''; ui.ph = 'all'; ui.esc = 'all'; q.value = ''; es.value = 'all'; es.dispatchEvent(new Event('change')); q.focus(); }));
    M().stagger(rows.filter(r => !r.hidden));
  }

  /* ---------- stage rail and money lane ---------- */
  function rail(o) {
    const cur = ix(o), end = o.phase === 'disputed' || o.phase === 'refunded';
    const dates = { funded: o.funded, released: o.released };
    const ahead = { accepted: 'Creator accepts', funded: 'Brand pays in', in_progress: 'Creator starts', submitted: o.due ? 'Due ' + L.fmtDate(o.due) : 'Delivery', revision: 'Only if asked', approved: 'Brand approves', released: 'Within 24 h' };
    const list = end ? STAGES.slice(0, cur + 1) : STAGES;
    const nodes = list.map((st, i) => {
      const done = i < cur || o.phase === 'released' || (end && i === cur), now = !end && i === cur && o.phase !== 'released';
      const cls = now ? 'is-now' : done ? 'is-done' : 'is-next';
      let sub = dates[st.k] && (done || now) ? L.fmtDate(dates[st.k]) : now ? 'Now' : done ? 'Done' : ahead[st.k] || '';
      if (st.k === 'released' && o.forced === 'release') sub = 'By admin · ' + L.fmtDate(o.released);
      if (st.k === 'revision' && !now && !(o.phase === 'revision')) { sub = done ? 'Not needed' : 'Only if asked'; }
      return `<li class="or-node ${cls}${st.k === 'revision' && o.phase !== 'revision' ? ' is-skip' : ''}"${now ? ' aria-current="step"' : ''}>
        <span class="or-nh"><span class="or-n" aria-hidden="true">0${i + 1}</span><span class="or-nt">${esc(st.n)}<span class="sr-only">, ${now ? 'current stage' : done ? 'done' : 'not yet'}</span></span></span>
        <span class="or-rl" aria-hidden="true"><i></i></span><span class="or-nd">${esc(sub)}</span></li>`;
    });
    if (end) {
      const d = disputeOf(o);
      nodes.push(`<li class="or-node is-end is-${o.phase}" aria-current="step"><span class="or-nh"><span class="or-n" aria-hidden="true">—</span><span class="or-nt">${esc(NAME(o.phase))}<span class="sr-only">, where it is now</span></span></span>
        <span class="or-rl" aria-hidden="true"><i>${ic(o.phase === 'refunded' ? 'refund' : 'alert')}</i></span><span class="or-nd">${o.phase === 'refunded' ? (o.forced === 'refund' ? 'By admin · ' : '') + L.fmtDate(o.refunded) : d ? 'Opened ' + L.fmtDate(d.opened) : 'Frozen'}</span></li>`);
    }
    return { html: nodes.join(''), n: nodes.length };
  }
  function money(o) {
    const st = pay(o), c = L.creator(o.creator), b = L.brand(o.brand);
    return `<div class="or-money" data-pay="${st}">
      <div class="or-mn${st === 'none' ? (o.phase === 'accepted' ? ' is-now' : '') : ' is-done'}"><span class="or-mdot" aria-hidden="true"></span><b>Paid in</b><span>${o.funded ? 'By ' + esc(b.name) + ' · ' + L.fmtDate(o.funded) : 'Not yet'}</span></div>
      <div class="or-mn or-mn-hold${st === 'held' ? ' is-now' : st === 'none' ? '' : ' is-done'}"><span class="or-mdot" aria-hidden="true"></span><b>Held in escrow</b><span>${st === 'held' ? (o.phase === 'disputed' ? 'Frozen by the dispute' : 'Since ' + L.fmtDate(o.funded)) : st === 'none' ? 'While the work happens' : 'Until ' + (st === 'released' ? 'release' : 'the refund')}</span><span class="or-band" aria-hidden="true"></span></div>
      <div class="or-mn or-mn-out${st === 'released' || st === 'refunded' ? ' is-now' : ''}"><span class="or-mdot" aria-hidden="true"></span><b>${st === 'refunded' ? 'Refunded to ' + esc(b.name) : 'Released to ' + esc(first(c.name))}</b><span>${st === 'released' ? L.fmtDate(o.released) : st === 'refunded' ? L.fmtDate(o.refunded) : 'On approval'}</span></div>
    </div>`;
  }
  function slip(o) {
    const m = A.orderMoney(o), r = S().rules, st = pay(o), c = L.creator(o.creator);
    return `<article class="or-slip" aria-label="Order money">
      <header class="or-slip-h"><span>Order money · ${esc(o.id.toUpperCase())}</span>${payPill(o)}</header>
      <p class="or-slip-big"><span class="t-money" data-amt>${L.inr(m.price)}</span><span>${st === 'held' ? 'in escrow now' : st === 'released' ? 'paid to ' + esc(first(c.name)) : st === 'refunded' ? 'returned to the brand' : 'agreed price'}</span></p>
      <dl class="or-slip-rows">
        <div><dt>Brand pays</dt><dd>${L.inr(m.price)}</dd></div>
        <div class="is-com"><dt>Commission <span class="or-rate">${ic('lock')}${r.commissionPct}%</span></dt><dd>${L.inr(m.commission)}</dd></div>
        <div><dt>Creator receives</dt><dd>${L.inr(m.creatorGets)}</dd></div>
        <div class="is-gw"><dt>Gateway fee <span class="or-rate">${r.gatewayPct}%</span></dt><dd>${L.inr(m.gateway)}</dd></div>
        <div class="is-net"><dt>Linkloom on this order</dt><dd>${L.inr(m.linkloom)}</dd></div>
      </dl>
      <p class="or-slip-n">${ic('info')}<span>No commission under the subscription model. The gateway fee is Linkloom’s cost, never charged to the brand or the creator. Taxes as per confirmed rules.</span></p>
      <p class="or-slip-f">Rate set in platform rules · read only. Editing rates is a future setting.</p>
    </article>`;
  }
  function timeline(o) {
    const d = S().disputes.filter(x => x.order === o.id), ev = [];
    if (o.funded) ev.push([o.funded, `${L.inr(o.amount)} paid into escrow by ${L.brand(o.brand).name}`]);
    d.forEach(x => ev.push([x.opened, `${x.kind === 'payment' ? 'Complaint' : 'Dispute'} ${x.id} opened by the ${x.by}`]));
    S().audit.filter(a => a.target.startsWith('Order ' + o.id + ' ') || a.target === 'Order ' + o.id).forEach(a => ev.push([a.at, `${a.who}: ${a.action}`, a.hash]));
    if (o.released && !o.forced) ev.push([o.released, `${L.inr(o.amount)} released to ${L.creator(o.creator).name}`]);
    if (o.refunded && !o.forced) ev.push([o.refunded, `${L.inr(o.amount)} refunded to ${L.brand(o.brand).name}`]);
    ev.sort((a, b) => L.D(b[0]) - L.D(a[0]));
    return ev.length ? `<ol class="or-log">${ev.map(e => `<li><span>${esc(e[1])}${e[2] ? ` <code class="or-hash" title="Audit hash">#${esc(e[2])}</code>` : ''}</span><time datetime="${esc(e[0])}">${esc(L.fmtDate(e[0]) + (e[0].length > 10 ? ', ' + time(e[0]) : ''))}</time></li>`).join('')}</ol>` : '<p class="muted">Nothing logged yet.</p>';
  }

  /* ---------- #orders-<id> (order) and #orders-<dispute id> ---------- */
  function renderDetail(el, id) {
    const d0 = dispute(id), o0 = d0 ? order(d0.order) : order(id);
    if (!o0) { el.innerHTML = `<div class="view-in or"><a class="btn-q or-back" href="#orders">${ic('back')}<span>Orders</span></a><div class="empty"><img src="assets/step-03-lock.svg" width="160" height="120" alt=""><p class="t-h2">That order isn’t here</p><p class="muted">It may have been archived. Search the full list instead.</p><a class="lq lq-p" href="#orders">All orders</a></div></div>`; L.liquid(el); return; }
    let firstPaint = true;
    const paint = (just) => {
      const o = order(o0.id), d = d0 ? dispute(d0.id) : null, od = disputeOf(o), b = L.brand(o.brand), c = L.creator(o.creator), w = who(o), R = rail(o);
      const isD = !!d, t = d ? sla(d) : null, held = pay(o) === 'held';
      el.innerHTML = `<div class="view-in or or-d" data-who="${w}">
        <a class="btn-q or-back" href="${isD ? '#orders-disputes' : '#orders'}">${ic('back')}<span>${isD ? 'Disputes & complaints' : 'Orders'}</span></a>
        <header class="or-dh">
          <div class="or-dh-t">
            <p class="or-dh-k">${isD ? kindTag(d) + `<span class="or-sla ${t.cls}">${ic(d.status === 'open' ? 'clock' : 'check')}${esc(t.t)}</span>` : `<span class="pill ${whoPill(o)}">${esc(NAME(o.phase))}</span><span class="muted">${esc(WHO[w])}</span>`}<span class="sample">Sample</span></p>
            <h1 class="t-h1">${esc(o.title)}</h1>
            <p class="or-parties"><a class="or-party is-brand" href="#brand-${esc(b.id)}">${bav(b)}<span><b>${esc(b.name)}</b><span class="muted">Brand · ${esc(b.city)}</span></span></a>
              <span class="or-parties-x" aria-hidden="true">${ic('arrow')}</span>
              <a class="or-party is-creator" href="#creator-${esc(c.id)}">${cav(c)}<span><b>${esc(c.name)}</b><span class="muted">Creator · ${esc(c.handle || c.city)}</span></span></a></p>
          </div>
          <div class="or-dh-m"><p class="t-money or-dh-amt">${L.inr(o.amount)}</p><p class="muted">${esc(o.id.toUpperCase())} · ${esc(dueTxt(o))}</p>${payPill(o)}</div>
        </header>
        ${!isD && od && od.status === 'open' ? `<a class="or-alert" href="#orders-${esc(od.id)}">${ic('alert')}<span><b>${od.kind === 'payment' ? 'Payment complaint' : 'Dispute'} ${esc(od.id)} is open.</b> ${esc(sla(od).t)}. Arbitrate it there.</span>${ic('chevron')}</a>` : ''}

        <section class="card or-board" aria-labelledby="orBoardH">
          <h2 class="sr-only" id="orBoardH">Where this order stands</h2>
          <div class="or-lane"><p class="or-lane-h">Work</p><ol class="or-rail" style="--n:${R.n}">${R.html}</ol></div>
          <div class="or-lane or-lane-m"><p class="or-lane-h">Escrow <span>tracked apart from the work</span></p>${money(o)}</div>
        </section>

        <div class="or-grid">
          <div class="or-main">
            ${isD ? `
            <section class="or-sec" aria-labelledby="orClaimH">
              <h2 class="or-sec-h" id="orClaimH">The claim</h2>
              <article class="or-claim is-${d.by}">
                <p class="or-claim-w">${d.by === 'creator' ? cav(c) : bav(b)}<span><b>${esc(d.by === 'creator' ? c.name : b.name)}</b><span class="muted">${esc(d.by === 'creator' ? 'Creator' : 'Brand')} · opened ${esc(L.fmtDate(d.opened) + ', ' + time(d.opened))}</span></span></p>
                <blockquote>${esc(d.claim)}</blockquote>
                <p class="or-sec-s">Evidence</p>
                <ul class="or-ev">${d.evidence.map(x => `<li>${ic(/chat/i.test(x) ? 'chat' : /link|live/i.test(x) ? 'link' : 'file')}<span>${esc(x)}</span></li>`).join('')}</ul>
              </article>
              <article class="or-claim is-other is-${d.by === 'creator' ? 'brand' : 'creator'}">
                <p class="or-claim-w">${d.by === 'creator' ? bav(b) : cav(c)}<span><b>${esc(d.by === 'creator' ? b.name : c.name)}</b><span class="muted">The other side</span></span></p>
                <blockquote>${esc(d.other)}</blockquote>
              </article>
            </section>
            <section class="or-sec or-arb" aria-labelledby="orArbH" aria-live="polite">
              <h2 class="or-sec-h" id="orArbH">${d.status === 'open' ? 'Arbitrate' : 'Outcome'}</h2>
              ${d.status === 'open' ? `<p class="or-arb-l">Read both sides and the evidence. Every choice needs a reason, both parties see it, and it is written to the audit log.</p>
              <div class="or-arb-g">
                ${held ? `<button class="or-act is-creator" type="button" data-act="release"><span class="or-act-i">${cav(c)}</span><span><b>Force release to creator</b><span>${esc(c.name)} did the job. ${L.inr(o.amount)} goes to them today.</span></span>${ic('arrow')}</button>
                <button class="or-act is-brand" type="button" data-act="refund"><span class="or-act-i">${bav(b)}</span><span><b>Refund brand</b><span>The work wasn’t delivered as briefed. ${L.inr(o.amount)} back to ${esc(b.name)}.</span></span>${ic('arrow')}</button>` : ''}
                <button class="or-act is-neutral" type="button" data-act="resolve"><span class="or-act-i or-act-ic">${ic('check')}</span><span><b>Mark resolved</b><span>The sides agreed or it runs on. No money moves.</span></span>${ic('arrow')}</button>
              </div>` : `<div class="or-out" data-out><span class="or-out-i">${ic('check')}</span><div><p class="t-h2">${esc(d.outcome || 'Resolved')}</p>
                <p class="muted">${d.by_admin ? `By ${esc(d.by_admin)}${d.resolvedAt ? ' · ' + esc(L.fmtDate(d.resolvedAt) + ', ' + time(d.resolvedAt)) : ''}` : 'Resolved before this sample started'}</p>
                ${d.reason ? `<p class="or-out-r">“${esc(d.reason)}”</p>` : ''}
                ${d.audit ? `<a class="btn-q" href="#audit">${ic('shield')}Audit entry ${esc(d.audit)} · <code>#${esc(d.hash)}</code></a>` : ''}</div></div>`}
            </section>` : `
            <section class="or-sec" aria-labelledby="orFactsH">
              <h2 class="or-sec-h" id="orFactsH">Order</h2>
              <dl class="or-facts">
                <div class="kv"><dt>Order ID</dt><dd class="num">${esc(o.id.toUpperCase())}</dd></div>
                <div class="kv"><dt>Paid into escrow</dt><dd>${o.funded ? esc(L.fmtDate(o.funded, { year: true })) : '—'}</dd></div>
                <div class="kv"><dt>Due</dt><dd>${o.due ? esc(L.fmtDate(o.due, { year: true })) : '—'}</dd></div>
                <div class="kv"><dt>${o.phase === 'refunded' ? 'Refunded' : 'Released'}</dt><dd>${o.released ? esc(L.fmtDate(o.released, { year: true })) : o.refunded ? esc(L.fmtDate(o.refunded, { year: true })) : '—'}</dd></div>
                <div class="kv"><dt>Payout</dt><dd>${(() => { const p = S().finance.payouts.find(x => x.order === o.id); return p ? esc(`${p.method}${p.utr ? ' · ' + p.utr : ''} · ${p.status}`) : '—'; })()}</dd></div>
              </dl>
            </section>
            ${held && !(od && od.status === 'open') ? `<details class="or-ovr"><summary>${ic('shield')}<span>Admin override</span><span class="muted">Only when support has confirmed with both sides</span></summary>
              <div class="or-arb-g">
                <button class="or-act is-creator" type="button" data-act="release"><span class="or-act-i">${cav(c)}</span><span><b>Force release to creator</b><span>${L.inr(o.amount)} to ${esc(c.name)} today.</span></span>${ic('arrow')}</button>
                <button class="or-act is-brand" type="button" data-act="refund"><span class="or-act-i">${bav(b)}</span><span><b>Refund brand</b><span>${L.inr(o.amount)} back to ${esc(b.name)}.</span></span>${ic('arrow')}</button>
              </div></details>` : ''}`}
            <section class="or-sec" aria-labelledby="orLogH"><h2 class="or-sec-h" id="orLogH">Timeline</h2>${timeline(o)}</section>
          </div>
          <aside class="or-side" aria-label="Order money">${slip(o)}</aside>
        </div>
      </div>`;
      L.liquid(el);
      const after = kind => { paint(kind); };
      L.$$('[data-act]', el).forEach(btn => btn.addEventListener('click', () => {
        const k = btn.dataset.act, o2 = order(o0.id), d2 = d0 ? dispute(d0.id) : null;
        if (k === 'release') forceRelease(o2, d2, after); else if (k === 'refund') refundBrand(o2, d2, after); else markResolved(o2, d2, after);
      }));
      if (firstPaint) { firstPaint = false; M().stagger(L.$$('.or-node', el)); const p = L.$('.or-dh-m .pill-escrow svg', el); p && setTimeout(() => p.isConnected && M().lock && M().lock(p, { color: 'plum' }), 450); }
      if (just) {
        const out = L.$('[data-out] .or-out-i', el); out && M().check && M().check(out);
        const n = L.$('.or-node.is-end, .or-node:last-child', el); n && M().bump && M().bump(n);
      }
    };
    paint();
  }

  function render(el, param) {
    if (!param || param === 'disputes') return renderList(el, param);
    return renderDetail(el, param);
  }
  L.register('orders', {
    title: p => !p ? 'Orders & escrow' : p === 'disputes' ? 'Disputes' : (dispute(p) ? 'Dispute ' + p : 'Order ' + String(p).toUpperCase()),
    nav: 'orders', render
  });
})();
