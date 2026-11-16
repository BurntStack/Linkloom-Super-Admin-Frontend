/* Financials (#finance). Inline SVG charts, one period filter that scopes everything, a table view per chart, tooltips built
   with textContent, and the revenue hero (butter sheet, "how it adds up").
   Business model: subscriptions are Linkloom's revenue. Commission is rules.commissionPct (0%) → ₹0, shown, never editable here.
   The gateway fee (rules.gatewayPct, 2% of GMV) is a Linkloom cost. Plan prices are never shown: aggregate revenue only, sample figures.
   Charts are single-series each (one axis, no dual scales): subscriptions in ink (Linkloom's own money), GMV in plum (escrow),
   gateway cost in slate. Payouts export as CSV through a Blob, and the export is written to the audit log. */
import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import L, { data } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';

const esc = L.esc;
const S = () => data;

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
/* ---------- payouts CSV ---------- */
const PSTAT = { paid: ['pill-ok', 'check', 'Paid'], scheduled: ['pill-escrow', 'lock', 'Scheduled'], processing: ['pill-info', 'send', 'Sent, awaiting UTR'], cancelled: ['pill-paper', 'close', 'Cancelled'] };
const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function payoutsCSV(rows) {
  const s = S(), head = ['Payout ID', 'Creator', 'Creator ID', 'Order ID', 'Order', 'Brand', 'Amount (INR)', 'Commission (INR)', 'Method (masked)', 'UTR', 'Date', 'Status'];
  const lines = rows.map(p => { const c = L.creator(p.creator) || {}, o = s.orders.find(x => x.id === p.order) || {}, b = L.brand(o.brand) || {};
    return [p.id, c.name, p.creator, p.order, o.title, b.name, (p.amount / 100).toFixed(2), '0.00', p.method, p.utr || '', p.at || '', (PSTAT[p.status] || [, , p.status])[2]].map(csvCell).join(','); });
  return '\uFEFF' + [head.join(','), ...lines].join('\r\n') + '\r\n';
}
function download(name, text) {
  try { const blob = new Blob([text], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); return true; }
  catch (e) { console.error(e); return false; }
}

/* A chart is drawn into its box once the box has a width, and again when that width changes. */
function Chart({ k, months, title, sub, head }) {
  const box = useRef(null), fig = useRef(null), tip = useRef(null);
  const rows = months.map(x => ({ m: x.m, v: k === 'subs' ? x.subs : k === 'gmv' ? x.gmv : x.gateway, part: partial(x.m) }));
  const c = k === 'subs' ? { tone: 'ink', name: 'Subscriptions' } : k === 'gmv' ? { tone: 'plum', name: 'GMV through escrow' } : { tone: 'slate', name: 'Gateway fee, Linkloom cost' };
  useLayoutEffect(() => {
    const w = box.current;
    const draw = () => { w.innerHTML = columns(rows, w.clientWidth || 320, { label: c.name + ' by month', tone: c.tone, name: c.name, h: k === 'gw' ? 180 : 220 }); };
    draw();
    if (!('ResizeObserver' in window)) return;
    let lastW = 0;
    const ro = new ResizeObserver(() => { const cw = w.clientWidth; if (cw && Math.abs(cw - lastW) > 2) { if (lastW) draw(); lastW = cw; } });
    ro.observe(w);
    return () => ro.disconnect();
  }, []);
  const hide = () => { tip.current.hidden = true; L.$$('.is-hot', fig.current).forEach(n => n.classList.remove('is-hot')); };
  const show = e => {
    const t = e.target.closest('[data-tip]'); if (!t) return;
    const tp = tip.current, f = fig.current;
    tp.textContent = '';
    t.dataset.tip.split('|').forEach((p, i) => { const el = document.createElement(i === 0 ? 'b' : 'span'); el.textContent = p; tp.append(el); });
    tp.hidden = false;
    const fr = f.getBoundingClientRect(), r = t.getBoundingClientRect(), tw = tp.offsetWidth;
    tp.style.left = Math.min(Math.max(0, r.left - fr.left + r.width / 2 - tw / 2), fr.width - tw) + 'px'; tp.style.top = Math.max(0, r.top - fr.top + 8) + 'px';
    L.$$('.is-hot', f).forEach(n => n.classList.remove('is-hot'));
    const kids = [...t.parentNode.children], mark = kids.slice(0, kids.indexOf(t)).reverse().find(n => n.matches('.fn-col')); mark && mark.classList.add('is-hot');
  };
  return (
    <figure className="fn-fig card" data-chart={k} ref={fig} onPointerOver={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
      <figcaption className="fn-cap"><span className="fn-cap-t">{title}</span><span className="help">{sub}</span></figcaption>
      <div className="fn-svgw" data-draw={k} ref={box}></div><div className="fn-tip" role="presentation" hidden ref={tip}></div>
      <details className="fn-tbl"><summary>Show as a table</summary><table><thead><tr><th scope="col">Month</th><th scope="col">{head}</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.m}><th scope="row">{MONY(r.m) + (r.part ? ' (to 4 Nov)' : '')}</th><td>{L.inr(r.v)}</td></tr>)}</tbody></table></details>
    </figure>
  );
}

const DateBlock = ({ d }) => d
  ? <span className="fn-date"><b>{L.D(d).toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })}</b><span>{L.D(d).toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' })}</span></span>
  : <span className="fn-date is-none"><b>—</b><span>Due</span></span>;

const PF = [['all', 'All'], ['paid', 'Paid'], ['scheduled', 'Scheduled'], ['processing', 'Sent']];
const IN = v => v.toLocaleString('en-IN');

/* Everything below the period filter belongs to one period: changing the period mounts a fresh Period. */
function Period({ n, ui, setN }) {
  const root = useRef(null), subs = useRef(null);
  const rerender = useRerender();
  const s = S(), r = s.rules;
  const subsN = s.finance.subscribers, totalSubs = subsN.creators + subsN.brands, held = L.escrowHeld();
  const m = model(n), pays = [...s.finance.payouts].sort((a, b) => (b.at || '9').localeCompare(a.at || '9'));
  if (!PF.some(x => x[0] === ui.pf)) ui.pf = 'all';
  const pf = ui.pf, cnt = k => k === 'all' ? pays.length : pays.filter(p => p.status === k).length;
  const range = `${MONY(m.from)} – 4 Nov 2026`;
  const shown = pays.filter(p => pf === 'all' || p.status === pf);

  useLayoutEffect(() => {
    mo('count', subs.current, m.subs, p => L.inr(p).slice(1));
    mo('stagger', L.$$('.fn-prow', root.current));
  }, []);

  const pick = k => e => { const f = () => { ui.pf = k; flushSync(rerender); }; mo('flip', f, L.$$('.fn-prow', root.current)); };
  const exportCsv = e => {
    if (!shown.length) { L.toast('Nothing to export for this filter', 'info'); return; }
    const name = `linkloom-payouts-${ui.pf}-${TODAY}.csv`;
    if (!download(name, payoutsCSV(shown))) { L.toast('The CSV could not be made. Try again.', 'alert'); return; }
    L.audit('payouts.export', ui.pf === 'all' ? 'All payouts' : `Payouts · ${PF.find(x => x[0] === ui.pf)[1]}`, `${shown.length} row${shown.length === 1 ? '' : 's'}, CSV`);
    mo('bump', e.currentTarget);
    L.toast(`${name} downloaded · Logged to audit`, 'check');
  };

  return (
    <div className="view-in fn" ref={root}>
      <div className="fn-top"><h1 className="t-h1">Financials</h1><span className="sample">Sample figures · amounts in ₹ · plan prices not shown</span></div>
      <div className="fn-filters">
        <div className="seg fn-range" role="group" aria-label="Period">{[[3, 'Last 3 months'], [6, 'Last 6 months']].map(([k, t]) => <button key={k} type="button" data-n={k} aria-pressed={k === n} onClick={() => setN(k)}>{t}</button>)}</div>
        <p className="help" data-range="">{`${range} · Nov is month to date`}</p>
      </div>

      <section className="fn-hero butter" aria-labelledby="fnRevH">
        <div className="fn-hero-a">
          <h2 className="fn-hero-l" id="fnRevH">Platform revenue · subscriptions</h2>
          <p className="fn-big"><span className="fn-rs">₹</span><span data-subs="" ref={subs}></span></p>
          <p className="fn-hero-s">{`From ${IN(subsN.creators)} creator and ${IN(subsN.brands)} brand subscribers. Linkloom earns from plans, not from deals.`}</p>
          <div className="fn-subs" aria-label={`${totalSubs} subscribers: ${subsN.creators} creators, ${subsN.brands} brands`}>
            <div className="fn-seg" aria-hidden="true"><i className="is-c" style={{ flex: subsN.creators }}></i><i className="is-b" style={{ flex: subsN.brands }}></i></div>
            <ul className="fn-legend"><li><span className="fn-key is-c"></span>Creators <b className="num">{IN(subsN.creators)}</b></li><li><span className="fn-key is-b"></span>Brands <b className="num">{IN(subsN.brands)}</b></li><li className="muted">{`${IN(totalSubs)} active plans`}</li></ul>
          </div>
        </div>
        <div className="fn-recon">
          <p className="fn-recon-h">How it adds up</p>
          <dl>
            <div><dt>Subscriptions</dt><dd>{L.inr(m.subs)}</dd></div>
            <div><dt>Commission on orders <span className="fn-rate"><Icon n="lock" />{`${r.commissionPct}%`}</span></dt><dd>{L.inr(m.commission)}</dd></div>
            <div><dt>Gateway fees, paid by Linkloom <span className="fn-rate">{`${r.gatewayPct}%`}</span></dt><dd>{L.inr(-m.gateway)}</dd></div>
            <div className="is-total"><dt>Revenue after gateway costs</dt><dd>{L.inr(m.net)}</dd></div>
          </dl>
          <p className="fn-recon-ok"><Icon n="info" /><span>No commission under the subscription model.</span></p>
        </div>
      </section>

      <section className="fn-strip" aria-label="Money through Linkloom">
        <div className="fn-st"><p className="fn-st-l">GMV through escrow</p><p className="t-money fn-st-v" data-gmv="">{L.inr(m.gmv)}</p><p className="help">Agreed prices paid in by brands</p></div>
        <div className="fn-st is-escrow"><p className="fn-st-l"><Icon n="lock" />Held in escrow now</p><p className="t-money fn-st-v">{L.inr(held)}</p><p className="help">{`${L.liveOrders().length} live orders · `}<a className="btn-q" href="#orders">Open orders</a></p></div>
        <div className="fn-st"><p className="fn-st-l">Commission tracked</p><p className="t-money fn-st-v">{L.inr(m.commission)}</p><p className="help">{`${r.commissionPct}% of ${L.inr(m.gmv)}`}</p></div>
        <div className="fn-st"><p className="fn-st-l">Gateway cost</p><p className="t-money fn-st-v">{L.inr(m.gateway)}</p><p className="help">{`${r.gatewayPct}% of GMV · a Linkloom cost`}</p></div>
      </section>

      <div className="fn-charts">
        <Chart k="subs" months={m.months} title="Subscription revenue by month" sub="Linkloom’s revenue. * Nov is month to date." head="Subscriptions" />
        <Chart k="gmv" months={m.months} title="GMV through escrow by month" sub="Paid in by brands, held until approval. * month to date." head="GMV" />
      </div>

      <section className="fn-sec" aria-labelledby="fnComH">
        <div className="fn-sec-top"><h2 className="fn-sec-h" id="fnComH">Commission tracking</h2>
          <p className="fn-lockn"><Icon n="lock" /><span>Rate <b>{`${r.commissionPct}%`}</b> · set in platform rules, read only. Changing it is a future setting.</span></p></div>
        <div className="fn-com">
          <div className="fn-tw card"><table className="fn-ct">
            <thead><tr><th scope="col">Month</th><th scope="col">GMV</th><th scope="col">Rate</th><th scope="col">Commission</th><th scope="col">Gateway fee <span className="fn-th-s">Linkloom cost</span></th></tr></thead>
            <tbody>{m.months.map(x => <tr key={x.m}><th scope="row">{`${MON(x.m)} ${x.m.slice(0, 4)}`}{partial(x.m) ? <span className="fn-th-s">to date</span> : null}</th><td>{L.inr(x.gmv)}</td><td>{`${r.commissionPct}%`}</td><td className="is-zero">{L.inr(Math.round(x.gmv * r.commissionPct / 100))}</td><td>{L.inr(x.gateway)}</td></tr>)}</tbody>
            <tfoot><tr><th scope="row">Total</th><td>{L.inr(m.gmv)}</td><td>{`${r.commissionPct}%`}</td><td className="is-zero">{L.inr(m.commission)}</td><td>{L.inr(m.gateway)}</td></tr></tfoot>
          </table></div>
          <Chart k="gw" months={m.months} title="Gateway cost by month" sub={`${r.gatewayPct}% of GMV, paid by Linkloom. Never charged to brands or creators.`} head="Gateway fee" />
        </div>
      </section>

      <section className="fn-sec" aria-labelledby="fnPayH">
        <div className="fn-sec-top"><h2 className="fn-sec-h" id="fnPayH">Payouts to creators</h2>
          <div className="fn-pay-a">
            <div className="chips fn-pf" role="group" aria-label="Filter payouts">{PF.map(([k, t]) => <button key={k} className="chip" type="button" data-pf={k} aria-pressed={k === pf} onClick={pick(k)}>{t + ' '}<span className="fn-chip-n">{cnt(k)}</span></button>)}</div>
            <Lq className="lq-p lq-sm fn-csv" data-csv="" onClick={exportCsv}><Icon n="download" />Export CSV</Lq>
          </div></div>
        <ol className="fn-plist">{pays.map(p => { const c = L.creator(p.creator) || {}, o = s.orders.find(x => x.id === p.order) || {}, st = PSTAT[p.status] || ['pill-paper', 'info', p.status];
          return (
            <li className="fn-prow" data-st={p.status} key={p.id} hidden={!(pf === 'all' || p.status === pf)}>
              <DateBlock d={p.at} />
              <span className="avatar fn-av" aria-hidden="true">{L.initials(c.name)}</span>
              <span className="fn-pw"><b>{c.name || ''}</b><span><a href={`#orders-${p.order}`}>{o.title || p.order}</a>{` · ${p.order.toUpperCase()}`}</span></span>
              <span className="fn-pm"><span>{p.method}</span><span className="num">{p.utr || 'UTR pending'}</span></span>
              <span className="fn-pa"><b className="t-money">{L.inr(p.amount)}</b><span className={`pill ${st[0]}`}><Icon n={st[1]} />{st[2]}</span></span>
            </li>); })}</ol>
        <p className="fn-none muted" hidden={shown.length > 0}>No payouts with this status.</p>
        <p className="help fn-pay-n"><Icon n="shield" /><span>Methods stay masked in the export. Each export is written to the audit log.</span></p>
      </section>
    </div>
  );
}

export default function Finance() {
  const rerender = useRerender();
  const s = S(), ui = s.ui.fin || (s.ui.fin = { n: 6, pf: 'all' });
  const n = [3, 6].includes(ui.n) ? ui.n : 6;
  const setN = k => { if (k === n) return; ui.n = k; flushSync(rerender); const f = document.querySelector(`.fn-range [data-n="${k}"]`); f && f.focus({ preventScroll: true }); };
  return <Period key={n} n={n} ui={ui} setN={setN} />;
}

L.register('finance', { title: 'Financials', nav: 'finance', Component: Finance });
