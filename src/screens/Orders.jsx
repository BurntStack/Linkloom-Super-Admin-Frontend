/* Orders and escrow (#orders, #orders-disputes, #order-<id>, #dispute-<id>).
   - GET  /v1/admin/finance/orders/?status=&q=     orders
   - GET  /v1/admin/finance/orders/pipeline/       how many orders (and how much money) sit in each stage
   - GET  /v1/admin/finance/orders/<id>/           with the breakdown { price, commission, gateway, creatorGets, linkloomNet } in paise
   - POST /v1/admin/finance/orders/<id>/force-release/ · refund/   { reason (min 12), disputeId }   super_admin only,
          sent with an Idempotency-Key that stays the same for every retry of one decision
   - GET  /v1/admin/finance/disputes/, GET .../<id>/, POST .../<id>/resolve/ { reason }  (restores the order, moves no money) */
import { useRef, useState } from 'react';
import L, { data } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { api, can, whoCan, str, pick, num, nameOf, idOf, label, isMoneyKey } from '../lib/admin.js';
import { idemKey } from '../lib/api.js';
import { refreshCounts } from '../lib/live.js';
import Icon from '../components/Icon.jsx';
import { usePaged, useLoad, useStagger, Failed, Loading, Empty, More, Row, Status, Fields, Lists, RoleNote, ActBtn, Seg, Head, decide, reason, inr, when } from '../components/Admin.jsx';

const ui = () => (data.ui.orders = data.ui.orders || { status: '', dstatus: 'open', q: '' });
const ord = o => ({
  id: str(o.id), ref: str(pick(o.reference, o.ref, o.code, o.number, o.id)), status: str(pick(o.status, o.state)).toLowerCase(),
  creator: nameOf(pick(o.creator, o.creatorName)), brand: nameOf(pick(o.brand, o.brandName)), title: str(pick(o.title, o.campaignTitle, o.campaign && nameOf(o.campaign), o.package && nameOf(o.package))),
  price: pick(o.price, o.amount, o.total, o.breakdown && o.breakdown.price), at: str(pick(o.createdAt, o.placedAt)),
  disputeId: idOf(pick(o.dispute, o.disputeId, o.openDispute)), escrow: str(pick(o.escrowStatus, o.escrow && o.escrow.status)).toLowerCase()
});

/* ----- pipeline ----- */
function Pipeline({ onPick, active }) {
  const r = useLoad(() => api.pipeline(), []);
  if (r.err) return <Failed err={r.err} retry={r.reload} what="The order pipeline" />;
  if (!r.data) return <Loading what="the order pipeline" />;
  const d = r.data;
  const src = Array.isArray(d) ? d : Array.isArray(d.stages) ? d.stages : Array.isArray(d.pipeline) ? d.pipeline : null;
  const stages = src ? src.map(s => ({ key: str(pick(s.status, s.stage, s.key, s.name)), n: num(pick(s.count, s.orders, s.n)), amt: pick(s.amount, s.total, s.value, s.escrow) }))
    : Object.entries(d).filter(([, v]) => typeof v === 'number' || (v && typeof v === 'object' && !Array.isArray(v))).map(([k, v]) => ({ key: k, n: typeof v === 'number' && !isMoneyKey(k) ? v : num(v && pick(v.count, v.orders, v.n)), amt: typeof v === 'number' ? (isMoneyKey(k) ? v : null) : pick(v.amount, v.total, v.value, v.escrow) }));
  return (
    <section aria-labelledby="orPipe" className="stack"><h2 className="t-h3" id="orPipe">Pipeline</h2>
      <dl className="adm-band">{stages.map(s => <div key={s.key}><button type="button" className="stack" style={{ gap: 4, textAlign: 'left' }} aria-pressed={active === s.key} onClick={() => onPick(active === s.key ? '' : s.key)}>
        <dt>{label(s.key)}</dt><dd>{s.n != null ? s.n : s.amt != null ? inr(s.amt) : '—'}</dd>{s.n != null && s.amt != null ? <p>{inr(s.amt)}</p> : null}</button></div>)}</dl>
    </section>
  );
}

function OrderList() {
  const root = useRef(null);
  const rerender = useRerender();
  const u = ui();
  const [q, setQ] = useState(u.q);
  const p = usePaged(api.orders, { status: u.status, q: u.q });
  useStagger(root, '.adm-row', [p.loading, u.status]);
  const rows = p.rows.map(ord);
  return (
    <div className="stack" ref={root}>
      <Pipeline active={u.status} onPick={s => { u.status = s; rerender(); }} />
      <form className="adm-bar" onSubmit={e => { e.preventDefault(); u.q = q.trim(); rerender(); }}>
        <div className="adm-search"><Icon n="search" /><label className="sr-only" htmlFor="orQ">Search orders</label><input className="input" id="orQ" type="search" placeholder="Order reference, creator or brand" value={q} onChange={e => setQ(e.target.value)} /></div>
        {u.status ? <button className="btn-q" type="button" onClick={() => { u.status = ''; rerender(); }}><Icon n="close" />{`Stage: ${label(u.status)}`}</button> : null}
      </form>
      {p.err ? <Failed err={p.err} retry={p.reload} what="Orders" /> : p.loading ? <Loading what="orders" />
        : rows.length ? <ul className="adm-list no-anchor">{rows.map(o => <Row key={o.id} href={`#order-${o.id}`} title={o.title || `Order ${o.ref}`}
            sub={[o.creator && `Creator ${o.creator}`, o.brand && `Brand ${o.brand}`, when(o.at)].filter(Boolean).join(' · ')}
            pills={<><Status s={o.status} />{o.disputeId ? <span className="pill pill-err"><Icon n="alert" />Disputed</span> : null}</>} right={inr(o.price)} />)}</ul>
        : <Empty title="No orders here." />}
      <More p={p} />
    </div>
  );
}

/* ----- disputes ----- */
const disp = x => ({ id: str(x.id), status: str(pick(x.status, x.state)).toLowerCase(), reason: str(pick(x.reason, x.category, x.type)), by: nameOf(pick(x.raisedBy, x.openedBy, x.createdBy)),
  orderId: idOf(pick(x.order, x.orderId)), at: str(pick(x.createdAt, x.openedAt)), amount: pick(x.amount, x.order && x.order.price) });
function DisputeList() {
  const root = useRef(null);
  const rerender = useRerender();
  const u = ui();
  const p = usePaged(api.disputes, { status: u.dstatus });
  useStagger(root, '.adm-row', [p.loading, u.dstatus]);
  return (
    <div className="stack" ref={root}>
      <Seg label="Status" value={u.dstatus} onChange={v => { u.dstatus = v; rerender(); }} opts={[['open', 'Open'], ['resolved', 'Resolved'], ['', 'All']]} />
      {p.err ? <Failed err={p.err} retry={p.reload} what="Disputes" /> : p.loading ? <Loading what="disputes" />
        : p.rows.length ? <ul className="adm-list no-anchor">{p.rows.map(disp).map(x => <Row key={x.id} href={`#dispute-${x.id}`} title={x.reason ? label(x.reason) : 'Dispute'}
            sub={[x.by && `Raised by ${x.by}`, when(x.at)].filter(Boolean).join(' · ')} pills={<Status s={x.status} />} right={x.amount != null ? inr(x.amount) : null} />)}</ul>
        : <Empty title="No disputes here." text="Disputes raised on orders show up here." />}
      <More p={p} />
    </div>
  );
}

/* ----- money actions (super_admin) ----- */
export function moneyAction(kind, o, disputeId, done) {
  const key = idemKey();                     // one decision, one key: retries from this sheet cannot move money twice
  const release = kind === 'release';
  decide({
    title: release ? 'Force-release escrow to the creator?' : 'Refund the brand?', confirm: release ? 'Release funds' : 'Refund', tone: 'danger',
    toast: release ? 'Funds released' : 'Refund started',
    intro: <><p>{release ? `${inr(o.creatorGets ?? o.price)} goes to the creator now. This cannot be undone from the console.` : `${inr(o.price)} goes back to the brand. This cannot be undone from the console.`}</p><p className="muted t-small">{`Idempotency key ${key}`}</p></>,
    fields: [reason(12, 'Reason', 'Recorded in the audit log. At least 12 characters.'), { k: 'disputeId', label: 'Dispute id', value: disputeId || '', help: 'The dispute this settles, if any.' }],
    run: b => (release ? api.forceRelease : api.refund)(o.id, b, key), done
  });
}

const BREAK = [['price', 'Order price'], ['commission', 'Linkloom commission'], ['gateway', 'Payment gateway'], ['creatorGets', 'Creator gets'], ['linkloomNet', 'Linkloom net']];
function OrderDetail({ id }) {
  const root = useRef(null);
  const r = useLoad(() => api.order(id), [id]);
  useStagger(root, '.adm-card', [!!r.data]);
  const back = <a className="btn-q adm-back" href="#orders"><Icon n="back" />Orders</a>;
  if (r.err) return <div className="view-in adm">{back}<Failed err={r.err} retry={r.reload} what="This order" /></div>;
  if (!r.data) return <div className="view-in">{back}<Loading what="this order" /></div>;
  const d = r.data, o = ord(d), b = (d.breakdown && typeof d.breakdown === 'object' ? d.breakdown : d.financials && typeof d.financials === 'object' ? d.financials : d);
  const money = { id: o.id, price: pick(b.price, o.price), creatorGets: b.creatorGets };
  const settled = /released|refunded|completed|cancel/.test(o.status);
  const after = () => { refreshCounts(); r.reload(); };
  return (
    <div className="view-in adm" ref={root}>
      {back}
      <Head eyebrow={`Order ${o.ref}`} title={o.title || 'Order'} lede={[o.creator && `Creator ${o.creator}`, o.brand && `Brand ${o.brand}`, when(o.at)].filter(Boolean).join(' · ')}>
        <Status s={o.status} />{o.escrow ? <Status s={o.escrow} text={'Escrow ' + label(o.escrow).toLowerCase()} /> : null}
      </Head>
      <dl className="adm-band">{BREAK.map(([k, t]) => <div key={k}><dt>{t}</dt><dd>{inr(b[k])}</dd></div>)}</dl>
      <div className="adm-grid">
        <div className="adm-col">
          <section className="card adm-card"><h2 className="t-h3">Order</h2><Fields obj={d} skip={['id', 'breakdown', 'financials']} /></section>
          <Lists obj={d} />
        </div>
        <div className="adm-col">
          <section className="card adm-card"><h2 className="t-h3">Escrow override</h2>
            {!can('money') ? <p className="adm-role"><Icon n="lock" /><span>{`Releasing or refunding needs the ${whoCan('money')} role.`}</span></p>
              : <p className="muted t-small">Use only when a dispute or a support case requires it. Every override is sealed in the audit log.</p>}
            {o.disputeId ? <a className="btn-q" href={`#dispute-${o.disputeId}`}><Icon n="alert" />Open the dispute</a> : null}
            <div className="adm-acts">
              <ActBtn area="money" ic="send" tone="p" disabled={settled} onClick={() => moneyAction('release', money, o.disputeId, after)}>Force-release</ActBtn>
              <ActBtn area="money" ic="refund" disabled={settled} onClick={() => moneyAction('refund', money, o.disputeId, after)}>Refund</ActBtn>
            </div>
            {settled ? <p className="muted t-small">{`This order is ${label(o.status).toLowerCase()}; no override is possible.`}</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function DisputeDetail({ id }) {
  const root = useRef(null);
  const r = useLoad(() => api.dispute(id), [id]);
  useStagger(root, '.adm-card', [!!r.data]);
  const back = <a className="btn-q adm-back" href="#orders-disputes"><Icon n="back" />Disputes</a>;
  if (r.err) return <div className="view-in adm">{back}<Failed err={r.err} retry={r.reload} what="This dispute" /></div>;
  if (!r.data) return <div className="view-in">{back}<Loading what="this dispute" /></div>;
  const d = r.data, x = disp(d), open = !/resolv|closed|released|refunded/.test(x.status);
  const order = d.order && typeof d.order === 'object' ? d.order : null;
  const b = order && (order.breakdown || order);
  const money = { id: x.orderId, price: pick(b && b.price, x.amount), creatorGets: b && b.creatorGets };
  const after = () => { refreshCounts(); r.reload(); };
  const resolve = () => decide({ title: 'Resolve without moving money?', confirm: 'Resolve', toast: 'Dispute resolved', intro: 'The order goes back to the state it was in before the dispute. No funds move.', fields: [reason(4)], run: bd => api.resolveDispute(x.id, bd), done: after });
  return (
    <div className="view-in adm" ref={root}>
      {back}
      <Head eyebrow="Dispute" title={x.reason ? label(x.reason) : 'Dispute'} lede={[x.by && `Raised by ${x.by}`, when(x.at)].filter(Boolean).join(' · ')}>
        <Status s={x.status} />{x.orderId ? <a className="btn-q" href={`#order-${x.orderId}`}>Open the order</a> : null}
      </Head>
      <div className="adm-grid">
        <div className="adm-col">
          <section className="card adm-card"><h2 className="t-h3">Dispute</h2><Fields obj={d} skip={['id', 'order']} /></section>
          {order ? <section className="card adm-card"><h2 className="t-h3">Order</h2><Fields obj={order} /></section> : null}
          <Lists obj={d} skip={['order']} />
        </div>
        <div className="adm-col">
          <section className="card adm-card"><h2 className="t-h3">Mediation</h2>
            <RoleNote area="disputes" doing="Resolving disputes" />
            {open ? <div className="adm-acts">
              <ActBtn area="disputes" ic="check" onClick={resolve}>Resolve, no money moves</ActBtn>
              {x.orderId ? <><ActBtn area="money" ic="send" tone="p" onClick={() => moneyAction('release', money, x.id, after)}>Release to creator</ActBtn>
                <ActBtn area="money" ic="refund" onClick={() => moneyAction('refund', money, x.id, after)}>Refund brand</ActBtn></> : null}
            </div> : <p className="muted">{`This dispute is ${label(x.status).toLowerCase()}.`}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Orders({ param }) {
  const root = useRef(null);
  const tab = param === 'disputes' ? 'disputes' : 'orders';
  useStagger(root, '.adm > nav, .adm-head', []);
  return (
    <div className="view-in adm or" ref={root}>
      <Head eyebrow="Orders & escrow" title={tab === 'disputes' ? 'Disputes' : 'Orders'} lede="Every order, where its money is, and dispute mediation. Money is shown in rupees from integer paise." />
      <nav className="chips" aria-label="Orders sections"><a className="chip" href="#orders" aria-current={tab === 'orders' ? 'page' : undefined}>Orders</a><a className="chip" href="#orders-disputes" aria-current={tab === 'disputes' ? 'page' : undefined}>Disputes</a></nav>
      <RoleNote area="finance" doing="Seeing orders" />
      {tab === 'disputes' ? <DisputeList /> : <OrderList />}
    </div>
  );
}

L.register('orders', { title: p => (p === 'disputes' ? 'Disputes' : 'Orders & escrow'), nav: 'orders', Component: ({ param }) => <Orders param={param} key={param || 'orders'} /> });
L.register('order', { title: 'Order', nav: 'orders', Component: ({ param }) => <OrderDetail id={param} key={param} /> });
L.register('dispute', { title: 'Dispute', nav: 'orders', Component: ({ param }) => <DisputeDetail id={param} key={param} /> });
