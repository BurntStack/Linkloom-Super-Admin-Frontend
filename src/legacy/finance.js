/* Financials (#finance). Builder D. Mirrors the brand Reports (inline SVG charts, one period filter that scopes everything, a
   table view per chart, tooltips built with textContent) and the creator Earnings hero (butter sheet, "how it adds up").
   Business model: subscriptions are Linkloom's revenue. Commission is rules.commissionPct (0%) → ₹0, shown, never editable here.
   The gateway fee (rules.gatewayPct, 2% of GMV) is a Linkloom cost. Plan prices are never shown: aggregate revenue only, sample figures.
   Charts are single-series each (one axis, no dual scales): subscriptions in ink (Linkloom's own money), GMV in plum (escrow),
   gateway cost in slate. Checked with the dataviz validator: each passes contrast ≥ 3:1 on white; no categorical pairing is drawn.
   Payouts export as CSV through a Blob, and the export is written to the audit log. */
(() => {
  const L = window.LLD, esc = L.esc, ic = L.icon, M = () => L.motion;
  const S = () => window.LLD_DATA;
  const TODAY = '2026-11-04';
  const sum = (rows, f) => rows.reduce((n, r) => n + f(r), 0);
  const MON = m => new Date(m + '-15T12:00:00+05:30').toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' });
  const MONY = m => new Date(m + '-15T12:00:00+05:30').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const partial = m => m === TODAY.slice(0, 7);
  /* compact rupees for axes and labels: ₹3.1L, ₹1.2Cr, ₹6.98K */
  const rc = p => { const r = p / 100; return r >= 1e7 ? '₹' + +(r / 1e7).toFixed(2) + 'Cr' : r >= 1e5 ? '₹' + +(r / 1e5).toFixed(1) + 'L' : r >= 1e3 ? '₹' + +(r / 1e3).toFixed(1) + 'K' : '₹' + Math.round(r); };
  const niceMax = v => { if (v <= 0) return 100000; const r = v / 100, p = Math.pow(10, Math.floor(Math.log10(r))), n = r / p; const step = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find(x => n <= x); return step * p * 100; };
  const topRound = (x, y, w, h, r = 4) => { if (h <= 0) return ''; r = Math.min(r, h, w / 2); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
  let uid = 0;

  const model = n => {
    const s = S(), r = s.rules, months = s.finance.months.slice(-n);
    const subs = sum(months, m => m.subs), gmv = sum(months, m => m.gmv), gateway = sum(months, m => m.gateway);
    const commission = Math.round(gmv * r.commissionPct / 100);
    return { months, subs, gmv, gateway, commission, net: subs + commission - gateway, from: months[0].m, to: months[months.length - 1].m };
  };

  /* single-series columns; the current, partial month is hatched and labelled "to date" */
  function columns(data, w, o) {
    const H = o.h || 220, ml = 52, mr = 8, mt = 28, mb = 30, ih = H - mt - mb, iw = Math.max(40, w - ml - mr);
    const max = niceMax(Math.max(...data.map(d => d.v)));
    const y = v => mt + ih - v / max * ih, band = iw / data.length, bw = Math.min(24, band * .5), pid = 'fnH' + (++uid);
    const full = data.filter(d => !d.part), peak = full.length ? data.indexOf(full.reduce((a, d) => d.v > a.v ? d : a)) : -1;
    let g = `<svg class="fn-svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="group" aria-label="${esc(o.label)}">
      <defs><pattern id="${pid}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" class="fn-hb is-${o.tone}"/><line x1="0" y1="0" x2="0" y2="6" class="fn-hl is-${o.tone}"/></pattern></defs>`;
    g += [0, .25, .5, .75, 1].map(t => t * max).map(t => `<line class="fn-grid${t ? '' : ' is-base'}" x1="${ml}" x2="${w - mr}" y1="${y(t)}" y2="${y(t)}"/><text class="fn-tick" x="${ml - 10}" y="${y(t) + 4}" text-anchor="end">${esc(rc(t))}</text>`).join('');
    data.forEach((d, i) => {
      const cx = ml + band * i + band / 2, x = cx - bw / 2, h = d.v / max * ih;
      g += `<g class="fn-col" style="--i:${i}"><path class="fn-bar is-${o.tone}${d.part ? ' is-part' : ''}"${d.part ? ` fill="url(#${pid})"` : ''} d="${topRound(x, y(d.v), bw, h)}"/></g>`;
      g += `<text class="fn-x" x="${cx}" y="${H - 9}" text-anchor="middle">${esc(MON(d.m))}${d.part ? '*' : ''}</text>`;
      if (i === peak || i === data.length - 1 && !d.part) g += `<text class="fn-val" x="${cx}" y="${y(d.v) - 8}" text-anchor="middle">${esc(rc(d.v))}</text>`;
      const tip = [L.inr(d.v), MONY(d.m) + (d.part ? ', to 4 Nov' : ''), o.name].join('|');
      g += `<rect class="fn-hit" x="${ml + band * i}" y="${mt}" width="${band}" height="${ih}" tabindex="0" role="img" aria-label="${esc(tip.replace(/\|/g, ', '))}" data-tip="${esc(tip)}"/>`;
    });
    return g + '</svg>';
  }
  function tips(fig) {
    const tip = L.$('.fn-tip', fig); if (!tip) return;
    const show = t => {
      tip.textContent = '';
      t.dataset.tip.split('|').forEach((p, i) => { const e = document.createElement(i === 0 ? 'b' : 'span'); e.textContent = p; tip.append(e); });
      tip.hidden = false;
      const fr = fig.getBoundingClientRect(), r = t.getBoundingClientRect(), tw = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(0, r.left - fr.left + r.width / 2 - tw / 2), fr.width - tw) + 'px'; tip.style.top = Math.max(0, r.top - fr.top + 8) + 'px';
      L.$$('.is-hot', fig).forEach(n => n.classList.remove('is-hot'));
      const kids = [...t.parentNode.children], mark = kids.slice(0, kids.indexOf(t)).reverse().find(n => n.matches('.fn-col')); mark && mark.classList.add('is-hot');
    };
    const hide = () => { tip.hidden = true; L.$$('.is-hot', fig).forEach(n => n.classList.remove('is-hot')); };
    fig.addEventListener('pointerover', e => { const t = e.target.closest('[data-tip]'); if (t) show(t); });
    fig.addEventListener('pointerleave', hide);
    fig.addEventListener('focusin', e => { const t = e.target.closest('[data-tip]'); if (t) show(t); });
    fig.addEventListener('focusout', hide);
  }
  const chartFig = (key, title, sub, rows, head) => `<figure class="fn-fig card" data-chart="${key}">
      <figcaption class="fn-cap"><span class="fn-cap-t">${esc(title)}</span><span class="help">${esc(sub)}</span></figcaption>
      <div class="fn-svgw" data-draw="${key}"></div><div class="fn-tip" role="presentation" hidden></div>
      <details class="fn-tbl"><summary>Show as a table</summary><table><thead><tr><th scope="col">Month</th><th scope="col">${esc(head)}</th></tr></thead>
        <tbody>${rows.map(r => `<tr><th scope="row">${esc(MONY(r.m))}${r.part ? ' (to 4 Nov)' : ''}</th><td>${L.inr(r.v)}</td></tr>`).join('')}</tbody></table></details>
    </figure>`;

  /* ---------- payouts CSV ---------- */
  const PSTAT = { paid: ['pill-ok', 'check', 'Paid'], scheduled: ['pill-escrow', 'lock', 'Scheduled'], processing: ['pill-info', 'send', 'Sent, awaiting UTR'], cancelled: ['pill-paper', 'close', 'Cancelled'] };
  const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function payoutsCSV(rows) {
    const s = S(), head = ['Payout ID', 'Creator', 'Creator ID', 'Order ID', 'Order', 'Brand', 'Amount (INR)', 'Commission (INR)', 'Method (masked)', 'UTR', 'Date', 'Status'];
    const lines = rows.map(p => { const c = L.creator(p.creator) || {}, o = s.orders.find(x => x.id === p.order) || {}, b = L.brand(o.brand) || {};
      return [p.id, c.name, p.creator, p.order, o.title, b.name, (p.amount / 100).toFixed(2), '0.00', p.method, p.utr || '', p.at || '', (PSTAT[p.status] || [, , p.status])[2]].map(csvCell).join(','); });
    return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n';
  }
  function download(name, text) {
    try { const blob = new Blob([text], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); return true; }
    catch (e) { console.error(e); return false; }
  }
  const dateBlock = d => d ? `<span class="fn-date"><b>${L.D(d).toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })}</b><span>${L.D(d).toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' })}</span></span>` : `<span class="fn-date is-none"><b>—</b><span>Due</span></span>`;

  function render(el) {
    const s = S(), ui = s.ui.fin || (s.ui.fin = { n: 6, pf: 'all' }), r = s.rules;
    let n = [3, 6].includes(ui.n) ? ui.n : 6;
    const subsN = s.finance.subscribers, totalSubs = subsN.creators + subsN.brands, held = L.escrowHeld();
    const PF = [['all', 'All'], ['paid', 'Paid'], ['scheduled', 'Scheduled'], ['processing', 'Sent']];

    const paint = () => {
      const m = model(n), pays = [...s.finance.payouts].sort((a, b) => (b.at || '9').localeCompare(a.at || '9'));
      const pf = PF.some(x => x[0] === ui.pf) ? ui.pf : 'all', cnt = k => k === 'all' ? pays.length : pays.filter(p => p.status === k).length;
      const range = `${MONY(m.from)} – 4 Nov 2026`;
      el.innerHTML = `<div class="view-in fn">
        <div class="fn-top"><h1 class="t-h1">Financials</h1><span class="sample">Sample figures · amounts in ₹ · plan prices not shown</span></div>
        <div class="fn-filters">
          <div class="seg fn-range" role="group" aria-label="Period">${[[3, 'Last 3 months'], [6, 'Last 6 months']].map(([k, t]) => `<button type="button" data-n="${k}" aria-pressed="${k === n}">${t}</button>`).join('')}</div>
          <p class="help" data-range>${esc(range)} · Nov is month to date</p>
        </div>

        <section class="fn-hero butter" aria-labelledby="fnRevH">
          <div class="fn-hero-a">
            <h2 class="fn-hero-l" id="fnRevH">Platform revenue · subscriptions</h2>
            <p class="fn-big"><span class="fn-rs">₹</span><span data-subs>${L.inr(m.subs).slice(1)}</span></p>
            <p class="fn-hero-s">From ${subsN.creators.toLocaleString('en-IN')} creator and ${subsN.brands.toLocaleString('en-IN')} brand subscribers. Linkloom earns from plans, not from deals.</p>
            <div class="fn-subs" aria-label="${esc(`${totalSubs} subscribers: ${subsN.creators} creators, ${subsN.brands} brands`)}">
              <div class="fn-seg" aria-hidden="true"><i class="is-c" style="flex:${subsN.creators}"></i><i class="is-b" style="flex:${subsN.brands}"></i></div>
              <ul class="fn-legend"><li><span class="fn-key is-c"></span>Creators <b class="num">${subsN.creators.toLocaleString('en-IN')}</b></li><li><span class="fn-key is-b"></span>Brands <b class="num">${subsN.brands.toLocaleString('en-IN')}</b></li><li class="muted">${totalSubs.toLocaleString('en-IN')} active plans</li></ul>
            </div>
          </div>
          <div class="fn-recon">
            <p class="fn-recon-h">How it adds up</p>
            <dl>
              <div><dt>Subscriptions</dt><dd>${L.inr(m.subs)}</dd></div>
              <div><dt>Commission on orders <span class="fn-rate">${ic('lock')}${r.commissionPct}%</span></dt><dd>${L.inr(m.commission)}</dd></div>
              <div><dt>Gateway fees, paid by Linkloom <span class="fn-rate">${r.gatewayPct}%</span></dt><dd>${L.inr(-m.gateway)}</dd></div>
              <div class="is-total"><dt>Revenue after gateway costs</dt><dd>${L.inr(m.net)}</dd></div>
            </dl>
            <p class="fn-recon-ok">${ic('info')}<span>No commission under the subscription model.</span></p>
          </div>
        </section>

        <section class="fn-strip" aria-label="Money through Linkloom">
          <div class="fn-st"><p class="fn-st-l">GMV through escrow</p><p class="t-money fn-st-v" data-gmv>${L.inr(m.gmv)}</p><p class="help">Agreed prices paid in by brands</p></div>
          <div class="fn-st is-escrow"><p class="fn-st-l">${ic('lock')}Held in escrow now</p><p class="t-money fn-st-v">${L.inr(held)}</p><p class="help">${L.liveOrders().length} live orders · <a class="btn-q" href="#orders">Open orders</a></p></div>
          <div class="fn-st"><p class="fn-st-l">Commission tracked</p><p class="t-money fn-st-v">${L.inr(m.commission)}</p><p class="help">${r.commissionPct}% of ${L.inr(m.gmv)}</p></div>
          <div class="fn-st"><p class="fn-st-l">Gateway cost</p><p class="t-money fn-st-v">${L.inr(m.gateway)}</p><p class="help">${r.gatewayPct}% of GMV · a Linkloom cost</p></div>
        </section>

        <div class="fn-charts">
          ${chartFig('subs', 'Subscription revenue by month', 'Linkloom’s revenue. * Nov is month to date.', m.months.map(x => ({ m: x.m, v: x.subs, part: partial(x.m) })), 'Subscriptions')}
          ${chartFig('gmv', 'GMV through escrow by month', 'Paid in by brands, held until approval. * month to date.', m.months.map(x => ({ m: x.m, v: x.gmv, part: partial(x.m) })), 'GMV')}
        </div>

        <section class="fn-sec" aria-labelledby="fnComH">
          <div class="fn-sec-top"><h2 class="fn-sec-h" id="fnComH">Commission tracking</h2>
            <p class="fn-lockn">${ic('lock')}<span>Rate <b>${r.commissionPct}%</b> · set in platform rules, read only. Changing it is a future setting.</span></p></div>
          <div class="fn-com">
            <div class="fn-tw card"><table class="fn-ct">
              <thead><tr><th scope="col">Month</th><th scope="col">GMV</th><th scope="col">Rate</th><th scope="col">Commission</th><th scope="col">Gateway fee <span class="fn-th-s">Linkloom cost</span></th></tr></thead>
              <tbody>${m.months.map(x => `<tr><th scope="row">${esc(MON(x.m))} ${x.m.slice(0, 4)}${partial(x.m) ? '<span class="fn-th-s">to date</span>' : ''}</th><td>${L.inr(x.gmv)}</td><td>${r.commissionPct}%</td><td class="is-zero">${L.inr(Math.round(x.gmv * r.commissionPct / 100))}</td><td>${L.inr(x.gateway)}</td></tr>`).join('')}</tbody>
              <tfoot><tr><th scope="row">Total</th><td>${L.inr(m.gmv)}</td><td>${r.commissionPct}%</td><td class="is-zero">${L.inr(m.commission)}</td><td>${L.inr(m.gateway)}</td></tr></tfoot>
            </table></div>
            ${chartFig('gw', 'Gateway cost by month', `${r.gatewayPct}% of GMV, paid by Linkloom. Never charged to brands or creators.`, m.months.map(x => ({ m: x.m, v: x.gateway, part: partial(x.m) })), 'Gateway fee')}
          </div>
        </section>

        <section class="fn-sec" aria-labelledby="fnPayH">
          <div class="fn-sec-top"><h2 class="fn-sec-h" id="fnPayH">Payouts to creators</h2>
            <div class="fn-pay-a">
              <div class="chips fn-pf" role="group" aria-label="Filter payouts">${PF.map(([k, t]) => `<button class="chip" type="button" data-pf="${k}" aria-pressed="${k === pf}">${t} <span class="fn-chip-n">${cnt(k)}</span></button>`).join('')}</div>
              <button class="lq lq-p lq-sm fn-csv" type="button" data-csv>${ic('download')}Export CSV</button>
            </div></div>
          <ol class="fn-plist">${pays.map(p => { const c = L.creator(p.creator) || {}, o = s.orders.find(x => x.id === p.order) || {}, st = PSTAT[p.status] || ['pill-paper', 'info', p.status];
            return `<li class="fn-prow" data-st="${esc(p.status)}">
              ${dateBlock(p.at)}
              <span class="avatar fn-av" aria-hidden="true">${esc(L.initials(c.name))}</span>
              <span class="fn-pw"><b>${esc(c.name || '')}</b><span><a href="#orders-${esc(p.order)}">${esc(o.title || p.order)}</a> · ${esc(p.order.toUpperCase())}</span></span>
              <span class="fn-pm"><span>${esc(p.method)}</span><span class="num">${esc(p.utr || 'UTR pending')}</span></span>
              <span class="fn-pa"><b class="t-money">${L.inr(p.amount)}</b><span class="pill ${st[0]}">${ic(st[1])}${esc(st[2])}</span></span>
            </li>`; }).join('')}</ol>
          <p class="fn-none muted" hidden>No payouts with this status.</p>
          <p class="help fn-pay-n">${ic('shield')}<span>Methods stay masked in the export. Each export is written to the audit log.</span></p>
        </section>
      </div>`;
      L.liquid(el);
      draw(m);
      L.$$('.fn-fig', el).forEach(tips);
      M().count(L.$('[data-subs]', el), m.subs, p => L.inr(p).slice(1));
      L.$$('.fn-range button', el).forEach(b => b.addEventListener('click', () => { const k = +b.dataset.n; if (k === n) return; n = ui.n = k; paint(); const f = L.$(`.fn-range [data-n="${k}"]`, el); f && f.focus({ preventScroll: true }); }));
      const prow = L.$$('.fn-prow', el), none = L.$('.fn-none', el);
      const apply = () => { let k = 0; prow.forEach(r => { const on = ui.pf === 'all' || r.dataset.st === ui.pf; r.hidden = !on; k += on; }); none.hidden = k > 0; };
      ui.pf = pf; apply();
      L.$$('[data-pf]', el).forEach(b => b.addEventListener('click', () => { ui.pf = b.dataset.pf; L.$$('[data-pf]', el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); M().flip(apply, prow); }));
      L.$('[data-csv]', el).addEventListener('click', e => {
        const rows = pays.filter(p => ui.pf === 'all' || p.status === ui.pf);
        if (!rows.length) { L.toast('Nothing to export for this filter', 'info'); return; }
        const name = `linkloom-payouts-${ui.pf}-${TODAY}.csv`;
        if (!download(name, payoutsCSV(rows))) { L.toast('The CSV could not be made. Try again.', 'alert'); return; }
        L.audit('payouts.export', ui.pf === 'all' ? 'All payouts' : `Payouts · ${PF.find(x => x[0] === ui.pf)[1]}`, `${rows.length} row${rows.length === 1 ? '' : 's'}, CSV`);
        const btn = e.currentTarget; M().bump && M().bump(btn);
        L.toast(`${name} downloaded · Logged to audit`, 'check');
      });
      M().stagger(prow);
    };

    let lastW = 0, ro = null;
    const draw = m => {
      m = m || model(n);
      const get = k => k === 'subs' ? { d: m.months.map(x => ({ m: x.m, v: x.subs, part: partial(x.m) })), tone: 'ink', name: 'Subscriptions' }
        : k === 'gmv' ? { d: m.months.map(x => ({ m: x.m, v: x.gmv, part: partial(x.m) })), tone: 'plum', name: 'GMV through escrow' }
        : { d: m.months.map(x => ({ m: x.m, v: x.gateway, part: partial(x.m) })), tone: 'slate', name: 'Gateway fee, Linkloom cost' };
      L.$$('[data-draw]', el).forEach(w => { const k = w.dataset.draw, c = get(k), W = w.clientWidth || 320;
        w.innerHTML = columns(c.d, W, { label: c.name + ' by month', tone: c.tone, name: c.name, h: k === 'gw' ? 180 : 220 }); });
    };
    paint();
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => { const w = (L.$('.fn-svgw', el) || {}).clientWidth; if (w && Math.abs(w - lastW) > 2) { if (lastW) draw(); lastW = w; } });
      L.$$('.fn-svgw', el).forEach(x => ro.observe(x));
      const mo = new MutationObserver(() => { ro.disconnect(); L.$$('.fn-svgw', el).forEach(x => ro.observe(x)); });
      mo.observe(el, { childList: true });
      return () => { ro.disconnect(); mo.disconnect(); };
    }
  }

  L.register('finance', { title: 'Financials', nav: 'finance', render });
})();
