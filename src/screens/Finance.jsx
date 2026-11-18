/* Financials (#finance). Read only (finance and super_admin).
   - GET /v1/admin/finance/summary/?months=3|6     revenue, escrow volume, commission, gateway cost, by month
   - GET /v1/admin/finance/rules/                  the platform's money rules (commission, gateway, payout schedule)
   - GET /v1/admin/finance/payouts/                payouts to creators
   - GET /v1/admin/finance/payouts/export/         CSV export
   Money is integer paise; the summary's field names are not in the guide, so every group is shown as it came. */
import { useRef, useState } from 'react';
import L, { data } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { api, str, pick, nameOf, label, isMoneyKey } from '../lib/admin.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { usePaged, useLoad, useStagger, Failed, Loading, Empty, More, Row, Status, Fields, Gate, RoleNote, Seg, Head, errText, inr, when } from '../components/Admin.jsx';

const ui = () => (data.ui.fin = data.ui.fin || { months: 3, pstatus: '' });

/* a month-by-month series, wherever the summary keeps it */
function seriesOf(d) {
  const a = Array.isArray(d) ? d : d && (d.months || d.monthly || d.series || d.byMonth || d.trend);
  if (!Array.isArray(a) || !a.length || typeof a[0] !== 'object') return null;
  const keys = [...new Set(a.flatMap(r => Object.keys(r).filter(k => typeof r[k] === 'number' && isMoneyKey(k))))];
  const mk = Object.keys(a[0]).find(k => /month|period|label|date/i.test(k));
  return keys.length ? { rows: a, keys, mk } : null;
}
function Bars({ s }) {
  const [k, setK] = useState(s.keys[0]);
  const max = Math.max(1, ...s.rows.map(r => Math.abs(r[k] || 0)));
  return (
    <section className="card adm-card"><div className="row between wrap"><h2 className="t-h3">By month</h2>
      {s.keys.length > 1 ? <Seg label="Measure" value={k} onChange={setK} opts={s.keys.map(x => [x, label(x)])} /> : null}</div>
      <div className="adm-bars">{s.rows.map((r, i) => <div className="adm-bar-r" key={i}><span>{str(r[s.mk]) || `Month ${i + 1}`}</span><i style={{ width: `${(Math.abs(r[k] || 0) / max) * 100}%` }}></i><span>{inr(r[k])}</span></div>)}</div>
    </section>
  );
}

function Summary() {
  const rerender = useRerender();
  const u = ui();
  const r = useLoad(() => api.summary(u.months), [u.months]);
  return (
    <section className="stack" aria-labelledby="finS">
      <div className="row between wrap"><h2 className="t-h2" id="finS">Summary</h2><Seg label="Period" value={u.months} onChange={v => { u.months = v; rerender(); }} opts={[[3, 'Last 3 months'], [6, 'Last 6 months']]} /></div>
      <Gate r={r} what="The summary">{d => {
        const s = seriesOf(d);
        const heads = d && typeof d === 'object' ? Object.entries(d).filter(([k, v]) => (typeof v === 'number' && isMoneyKey(k)) || (v && typeof v === 'object' && 'amount' in v)) : [];
        const groups = d && typeof d === 'object' ? Object.entries(d).filter(([k, v]) => v && typeof v === 'object' && !Array.isArray(v) && !('amount' in v)) : [];
        const rest = d && typeof d === 'object' ? Object.fromEntries(Object.entries(d).filter(([k, v]) => (v == null || typeof v !== 'object') && !(typeof v === 'number' && isMoneyKey(k)))) : {};
        return <>
          {heads.length ? <dl className="adm-band">{heads.map(([k, v]) => <div key={k}><dt>{label(k)}</dt><dd>{inr(v)}</dd></div>)}</dl> : null}
          {s ? <Bars s={s} /> : null}
          <div className="grid-2 adm-grid2">
            {Object.keys(rest).length ? <section className="card adm-card"><h3 className="t-h3">Overview</h3><Fields obj={rest} /></section> : null}
            {groups.map(([k, v]) => <section className="card adm-card" key={k}><h3 className="t-h3">{label(k)}</h3><Fields obj={v} /></section>)}
          </div>
        </>;
      }}</Gate>
    </section>
  );
}

function Rules() {
  const r = useLoad(() => api.rules(), []);
  return (
    <section className="card adm-card" aria-labelledby="finR"><h2 className="t-h3" id="finR">Platform rules</h2>
      <Gate r={r} what="The rules">{d => (Array.isArray(d) ? <ul className="stack">{d.map((x, i) => <li key={i}><Fields obj={x} /></li>)}</ul> : <Fields obj={d} />)}</Gate>
    </section>
  );
}

function Payouts() {
  const box = useRef(null);
  const rerender = useRerender();
  const u = ui();
  const [busy, setBusy] = useState(false);
  const p = usePaged(api.payouts, { status: u.pstatus });
  useStagger(box, '.adm-row', [p.loading, u.pstatus]);
  const exp = async () => { setBusy(true); try { await api.exportPayouts({ status: u.pstatus }); L.toast('Export downloaded', 'download'); } catch (e) { L.toast(errText(e), 'alert'); } setBusy(false); };
  return (
    <section className="stack" aria-labelledby="finP" ref={box}>
      <div className="row between wrap"><h2 className="t-h2" id="finP">Payouts</h2><Lq className="lq-s lq-sm" onClick={exp} disabled={busy}><Icon n="download" className="ic" />{busy ? 'Exporting…' : 'Export CSV'}</Lq></div>
      <Seg label="Status" value={u.pstatus} onChange={v => { u.pstatus = v; rerender(); }} opts={[['', 'All'], ['pending', 'Pending'], ['processing', 'Processing'], ['paid', 'Paid'], ['failed', 'Failed']]} />
      {p.err ? <Failed err={p.err} retry={p.reload} what="Payouts" /> : p.loading ? <Loading what="payouts" />
        : p.rows.length ? <ul className="adm-list no-anchor">{p.rows.map((x, i) => <Row key={x.id || i} kind="creator" title={nameOf(pick(x.creator, x.payee, x.user)) || 'Creator'}
            sub={[str(pick(x.reference, x.utr, x.id)), when(pick(x.paidAt, x.scheduledFor, x.createdAt))].filter(Boolean).join(' · ')}
            pills={<Status s={pick(x.status, x.state)} />} right={inr(pick(x.amount, x.net, x.total))} />)}</ul>
        : <Empty title="No payouts here." />}
      <More p={p} />
    </section>
  );
}

function Finance() {
  const root = useRef(null);
  useStagger(root, '.adm-card, .adm-band>div', []);
  return (
    <div className="view-in adm fin" ref={root}>
      <Head eyebrow="Platform financials" title="Financials" lede="Revenue, escrow volume, commission, gateway cost and payouts. Read only." />
      <RoleNote area="finance" doing="Seeing financials" />
      <Summary />
      <div className="adm-grid"><Payouts /><div className="adm-col"><Rules /><Lq as="a" className="lq-s lq-sm" href="#orders">Orders &amp; escrow</Lq></div></div>
    </div>
  );
}

L.register('finance', { title: 'Financials', nav: 'finance', Component: Finance });
