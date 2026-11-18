/* Orders & escrow (#orders, #orders-disputes, #orders-<orderId>, #orders-<disputeId>).
   Ticket rows, a stage rail with a money lane, and the order money slip.
   Lifecycle: invited → accepted → funded → in_progress → submitted → revision → approved → released, or disputed / refunded.
   Money: integer paise. Commission is rules.commissionPct (0%): ₹0 on every order, read only.
   The gateway fee (rules.gatewayPct, 2%) is a Linkloom cost, never charged to brands or creators.
   Colour is meaning: coral = creator, violet = brand, plum = escrow, butter = Linkloom (you). Status colours only for status.
   Data: /v1/admin/finance/orders/, .../orders/{id}/, /v1/admin/finance/disputes/, rules/ and payouts/.
   Every arbitration action opens a confirm sheet and needs a reason; force-release and refund send an Idempotency-Key
   (super_admin only); the server writes the audit entry. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { data } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import Select from '../components/Select.jsx';
import Count from '../components/Count.jsx';
import needs from '../components/Needs.jsx';
import { act as api, reload, fetchOrder, fetchDispute, why } from '../lib/admin.js';

const S = () => data;

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
const LockIc = () => <Icon n="lock" />;
const PayPill = ({ o }) => ({
  none: <span className="pill pill-line">{o.phase === 'accepted' ? 'Not paid in yet' : 'Nothing paid'}</span>,
  held: <span className="pill pill-escrow"><LockIc />In escrow</span>,
  released: <span className="pill pill-ok"><Icon n="check" />Released</span>,
  refunded: <span className="pill pill-info"><Icon n="refund" />Refunded</span>
})[pay(o)];
/* where a disputed or refunded order stopped on the rail */
const stopAt = o => o.stoppedAt || (o.phase === 'refunded' ? 'in_progress' : 'submitted');
const ix = o => { const i = STAGES.findIndex(x => x.k === o.phase); return i >= 0 ? i : STAGES.findIndex(x => x.k === stopAt(o)); };

/* money per order: commission at the platform rate (0%), gateway at its rate, paid by Linkloom */
/* the server's breakdown when the order carries one; else worked out from the platform rules */
export const orderMoney = o => {
  const m = o.money || {};
  if (m.commission || m.gateway || m.linkloom) return { price: m.price || o.amount, commission: m.commission, gateway: m.gateway, creatorGets: m.creatorGets, linkloom: m.linkloom };
  const r = S().rules, commission = Math.round(o.amount * r.commissionPct / 100), gateway = Math.round(o.amount * r.gatewayPct / 100);
  return { price: o.amount, commission, gateway, creatorGets: o.amount - commission, linkloom: commission - gateway };
};
const order = id => S().orders.find(o => o.id === id);
const dispute = id => S().disputes.find(d => d.id === id);
const disputeOf = o => S().disputes.find(d => d.order === o.id && d.status === 'open') || S().disputes.find(d => d.order === o.id);
const first = n => String(n || '').split(' ')[0];
const Cav = ({ c, cls = '' }) => <span className={`avatar or-av ${cls}`} aria-hidden="true">{L.initials(c ? c.name : '?')}</span>;
const Bav = ({ b, cls = '' }) => <span className={`avatar v or-av ${cls}`} aria-hidden="true">{L.initials(b ? b.name : '?')}</span>;
const Pair = ({ o }) => <span className="or-pair"><Bav b={L.brand(o.brand)} /><Cav c={L.creator(o.creator)} /></span>;
const time = s => L.D(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase());
const sla = d => {
  if (d.status !== 'open') return { t: 'Resolved', cls: 'is-ok' };
  if (!d.sla) return { t: 'Open', cls: '' };
  const n = L.daysLeft(d.sla);
  return n < 0 ? { t: `${-n} day${n === -1 ? '' : 's'} overdue`, cls: 'is-late' } : n === 0 ? { t: 'Due today', cls: 'is-late' } : n === 1 ? { t: 'Due tomorrow', cls: 'is-soon' } : { t: `Due ${L.fmtDate(d.sla)} · ${n} days`, cls: '' };
};
const dueTxt = o => {
  if (o.phase === 'released') return o.released ? 'Released ' + L.fmtDate(o.released) : 'Released';
  if (o.phase === 'refunded') return o.refunded ? 'Refunded ' + L.fmtDate(o.refunded) : 'Refunded';
  if (!o.due) return 'No due date';
  const n = L.daysLeft(o.due);
  return n < 0 ? `${-n} day${n === -1 ? '' : 's'} past due` : n === 0 ? 'Due today' : `Due ${L.fmtDate(o.due)} · ${n} day${n === 1 ? '' : 's'}`;
};
const KindTag = ({ d }) => d.kind === 'payment' ? <span className="pill pill-info"><Icon n="wallet" />Payment complaint</span> : <span className="pill pill-err"><Icon n="alert" />Dispute</span>;
const ByChip = ({ d }) => { const o = order(d.order) || {}, p = d.by === 'creator' ? L.creator(o.creator) : L.brand(o.brand); return <span className={`or-by is-${d.by}`}><i aria-hidden="true"></i>{`Opened by ${p ? p.name : d.by} `}<span className="muted">{`(${d.by})`}</span></span>; };
const Sla = ({ d, t }) => <span className={`or-sla ${t.cls}`}><Icon n={d.status === 'open' ? 'clock' : 'check'} />{t.t}</span>;

/* ---------- shared confirm sheet: summary, consequences, required reason, logged ---------- */
function ConfirmForm({ o, close }) {
  const { action, target, yes, mini, bullets, danger, onYes, min = 12 } = o;
  const [id] = useState(() => 'orR' + Date.now().toString(36));
  const ta = useRef(null);
  const [count, setCount] = useState(0);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = e => {
    e.preventDefault();
    if (busy) return;
    const r = ta.current.value.trim();
    if (r.length < min) { flushSync(() => setBad(true)); ta.current.focus(); mo('shake', ta.current); return; }
    flushSync(() => { setBusy(true); setErr(''); });
    Promise.resolve(onYes(r)).then(() => { close(); L.toast('Done · logged to audit', 'check'); }, e2 => { if (ta.current) flushSync(() => { setBusy(false); setErr(why(e2)); }); });
  };
  return (
    <form className="or-cf" noValidate onSubmit={submit}>
      {mini || null}
      {bullets && bullets.length ? <ul className="or-cf-b">{bullets.map((b, i) => <li key={i}><Icon n="arrow" /><span>{b}</span></li>)}</ul> : null}
      <div className={'field' + (bad ? ' is-err' : '')}><label htmlFor={id}>Reason <span className="muted">(required)</span></label>
        <textarea className="textarea" id={id} name="reason" maxLength={400} aria-describedby={`${id}h ${id}e`} aria-invalid={bad ? 'true' : undefined} placeholder="What you checked and why this is fair to both sides" ref={ta} onInput={e => { setCount(e.currentTarget.value.length); if (e.currentTarget.value.trim().length >= min) setBad(false); }}></textarea>
        <p className="help or-cf-h" id={id + 'h'}><span>{`At least ${min} characters. Both sides see this reason.`}</span><span className="num" data-cnt="">{`${count} / 400`}</span></p>
        <p className="err or-cf-e" id={id + 'e'} aria-live="polite" hidden={!bad}><Icon n="alert" /><span>{`Add a reason of at least ${min} characters.`}</span></p></div>
      {err ? <p className="err" role="alert">{err}</p> : null}
      <p className="or-cf-log"><Icon n="shield" /><span>The server writes this to the audit log as <code>{action}</code> on <b>{target}</b>, with your name and the time. Entries can’t be edited or deleted.</span></p>
      <div className="or-cf-a"><Lq type="submit" className={danger ? 'lq-ink' : 'lq-p'} disabled={busy}>{busy ? 'Saving…' : yes}</Lq><Lq className="lq-s" data-cancel="" onClick={() => close()}>Cancel</Lq></div>
    </form>
  );
}
export const confirmAction = o => L.openSheet({ title: o.title, body: s => <ConfirmForm o={o} close={s.close} /> });

/* ---------- the arbitration actions (dispute or order) ---------- */
const tgt = (o, d) => `Order ${o.id.slice(0, 8).toUpperCase()}${d ? ' · ' + (d.kind === 'payment' ? 'complaint' : 'dispute') : ''}`;
/* after an arbitration: orders, disputes, payouts and the counts are fetched again */
const refresh = (o, d) => reload(['orders', 'disputes', 'payouts', 'counts', 'dashboard']).then(() => Promise.all([fetchOrder(o.id).catch(() => {}), d ? fetchDispute(d.id).catch(() => {}) : null]));
function MiniFlow({ o, way }) {
  const c = L.creator(o.creator), b = L.brand(o.brand);
  return (
    <div className="or-flow" aria-label={`${L.inr(o.amount)} from escrow to ${way === 'release' ? c.name : b.name}`}>
      <span className="or-flow-p is-escrow"><span className="or-coin" aria-hidden="true"><LockIc /></span><b>Escrow</b></span>
      <span className="or-flow-l" aria-hidden="true"><b className="t-money">{L.inr(o.amount)}</b><i></i></span>{way === 'release' ? <span className="or-flow-p is-creator"><Cav c={c} /><b>{c.name}</b></span> : <span className="or-flow-p is-brand"><Bav b={b} /><b>{b.name}</b></span>}</div>
  );
}
function forceRelease(o, d, after) {
  const c = L.creator(o.creator), b = L.brand(o.brand), m = orderMoney(o);
  confirmAction({
    title: 'Force release to creator', action: 'escrow.force_release', target: tgt(o, d), yes: `Release ${L.inr(m.creatorGets)} to ${first(c.name)}`, danger: true,
    mini: <MiniFlow o={o} way="release" />,
    bullets: [`${L.inr(m.creatorGets)} leaves escrow for ${c.name}’s payout method today.`, `${b.name} is told the work was accepted on review and can’t be refunded later.`, d ? `${d.kind === 'payment' ? 'The complaint' : 'The dispute'} is marked resolved.` : 'The order closes as released.'],
    onYes(reason) { return api.forceRelease(o.id, reason, d && d.id).then(() => refresh(o, d)).then(() => after && after('release')); }
  });
}
function refundBrand(o, d, after) {
  const c = L.creator(o.creator), b = L.brand(o.brand), m = orderMoney(o);
  confirmAction({
    title: 'Refund the brand', action: 'escrow.refund', target: tgt(o, d), yes: `Refund ${L.inr(m.price)} to ${b.name}`, danger: true,
    mini: <MiniFlow o={o} way="refund" />,
    bullets: [`${L.inr(m.price)} goes back to ${b.name}’s original payment method, usually in 5 to 7 working days.`, `${c.name} gets nothing for this order and is told why.`, 'The gateway fee Linkloom paid is not recovered.'],
    onYes(reason) { return api.refund(o.id, reason, d && d.id).then(() => refresh(o, d)).then(() => after && after('refund')); }
  });
}
function markResolved(o, d, after) {
  confirmAction({
    title: 'Mark resolved, no money moves', action: 'dispute.resolve', target: tgt(o, d), yes: 'Mark resolved',
    mini: <div className="or-mini"><p><b>{o.title}</b><span className="muted">{`${L.inr(o.amount)} stays where it is: ${pay(o) === 'held' ? 'in escrow' : pay(o)}`}</span></p></div>,
    bullets: ['Use this when the two sides agreed, or the order runs on as normal.', 'Escrow is untouched. The order keeps its current stage.'],
    onYes(reason) { return api.resolveDispute(d.id, reason).then(() => refresh(o, d)).then(() => after && after('resolve')); }
  });
}

/* ---------- pipeline ---------- */
function Pipeline({ orders, f, pick }) {
  const by = k => orders.filter(o => o.phase === k), v = rows => rows.reduce((n, o) => n + o.amount, 0);
  const max = Math.max(1, ...ALL.map(st => v(by(st.k))));
  const cell = (st, i) => { const r = by(st.k), val = v(r), held = HELD.includes(st.k);
    return (
      <li className={`or-pc${r.length ? '' : ' is-zero'}${held ? ' is-held' : ''} is-${st.k}`} key={st.k}>
        <button type="button" className="or-pc-b" data-ph={st.k} aria-pressed={f === st.k} aria-label={`${st.n}: ${r.length} order${r.length === 1 ? '' : 's'}, ${L.inr(val)}. ${st.d}. Filter the list`} onClick={() => pick(st.k)}>
          <span className="or-pc-n">{i != null ? '0' + (i + 1) : <Icon n={st.k === 'disputed' ? 'alert' : 'refund'} />}</span>
          <span className="or-pc-t">{st.n}</span>
          <span className="or-pc-c t-money">{r.length}</span>
          <span className="or-pc-v">{val ? L.inr(val) : '—'}</span>
          <span className="or-pc-bar" aria-hidden="true"><i style={{ width: (val ? Math.max(4, val / max * 100) : 0) + '%' }}></i></span>
        </button></li>
    ); };
  const heldV = v(orders.filter(o => HELD.includes(o.phase) && o.phase !== 'disputed')), dispV = v(by('disputed'));
  return (
    <section className="or-pipe card" aria-labelledby="orPipeH">
      <div className="or-pipe-top"><h2 className="or-sec-h" id="orPipeH">Lifecycle</h2><p className="help">Orders and value in each phase. Pick a phase to filter the list.</p></div>
      <div className="or-pipe-w">
        <ol className="or-pipe-main">{STAGES.map(cell)}</ol>
        <ol className="or-pipe-br" aria-label="Off the main path">{BRANCH.map(st => cell(st, null))}</ol>
      </div>
      <div className="or-pipe-hold" aria-hidden="true"><span className="or-pipe-band"></span><span className="or-pipe-hl"><LockIc />{`Held in escrow · ${L.inr(heldV)}`}{dispV ? <> <span>{`+ ${L.inr(dispV)} disputed`}</span></> : null}</span></div>
    </section>
  );
}

const MiniRail = ({ o }) => { const cur = ix(o), off = o.phase === 'disputed' || o.phase === 'refunded'; return <ol className="or-mini-r" aria-hidden="true">{STAGES.map((st, i) => <li className={i < cur || (o.phase === 'released') ? 'is-done' : i === cur ? (off ? 'is-' + o.phase : 'is-now') : off ? 'is-off' : ''} key={st.k}></li>)}</ol>; };
/* a click anywhere on a ticket opens it */
const openRow = e => { if (e.target.closest('a,button')) return; const a = e.currentTarget.querySelector('.or-tk-link'); a && a.click(); };
function Ticket({ o, hidden }) {
  const b = L.brand(o.brand), c = L.creator(o.creator), d = disputeOf(o), late = o.due && !['released', 'refunded'].includes(o.phase) && L.daysLeft(o.due) < 0;
  const dOpen = d && d.status === 'open';
  return (
    <li className="or-tk" data-who={who(o)} data-id={o.id} hidden={hidden} onClick={openRow}>
      <div className="or-tk-a"><Pair o={o} />
        <div className="or-tk-tx"><p className="or-tk-p"><span className="or-b">{b.name}</span><span aria-hidden="true">→</span><span className="or-c">{c.name}</span></p>
          <h3 className="or-tk-t"><a className="or-tk-link" href={`#orders-${o.id}`}>{o.title}</a></h3>
          <p className="or-tk-id num">{o.id.slice(0, 8).toUpperCase() + (dOpen ? ' · ' : '')}{dOpen ? <span className="or-tk-d"><Icon n="alert" />{d.kind === 'payment' ? 'Complaint open' : 'Dispute open'}</span> : null}</p></div></div>
      <div className="or-tk-r"><MiniRail o={o} /><p className="or-tk-s"><span className={`pill ${whoPill(o)}`}>{NAME(o.phase)}</span><span>{WHO[who(o)]}</span></p></div>
      <div className="or-tk-m"><p className="t-money or-tk-amt">{L.inr(o.amount)}</p><PayPill o={o} /><p className={'or-tk-due' + (late ? ' is-late' : '')}><Icon n="clock" /><span>{dueTxt(o)}</span></p></div>
    </li>
  );
}
function DisputeCard({ d }) {
  const o = order(d.order) || { id: d.order || '', title: 'Order', amount: 0, phase: 'disputed' }, b = L.brand(o.brand), c = L.creator(o.creator), t = sla(d);
  return (
    <li className={'or-dc' + (d.status === 'open' ? '' : ' is-closed')} data-by={d.by} onClick={openRow}>
      <div className="or-dc-h"><KindTag d={d} /><Sla d={d} t={t} /></div>
      <h3 className="or-dc-t"><a className="or-tk-link" href={`#orders-${d.id}`}>{o.title}</a></h3>
      <p className="or-tk-p"><span className="or-b">{b.name}</span><span aria-hidden="true">→</span><span className="or-c">{c.name}</span><span className="muted">{`· ${o.id.slice(0, 8).toUpperCase()}`}</span></p>
      <blockquote className="or-dc-q">{d.claim}</blockquote>
      <div className="or-dc-f"><ByChip d={d} /><span className="or-dc-amt"><span className="t-money">{L.inr(o.amount)}</span>{d.status === 'open' ? <PayPill o={o} /> : <span className="pill pill-paper">{d.outcome || 'Resolved'}</span>}</span></div>
    </li>
  );
}

/* ---------- #orders list ---------- */
const ESC = [['all', 'Any escrow state'], ['held', 'In escrow'], ['released', 'Released'], ['refunded', 'Refunded'], ['none', 'Not paid in']];
const TURN = ['dispute', 'you', 'brand', 'creator', 'done'];
function List({ tab }) {
  const root = useRef(null), search = useRef(null);
  const rerender = useRerender();
  const s = S(), ui = s.ui.ord || (s.ui.ord = { q: '', ph: 'all', esc: 'all' });
  const t = tab === 'disputes' ? 'disputes' : 'orders';
  const orders = s.orders, open = s.disputes.filter(d => d.status === 'open');
  const heldNow = L.escrowHeld();
  const ds = [...s.disputes].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || String(a.sla || '9').localeCompare(String(b.sla || '9')));
  const [sorted] = useState(() => [...orders].sort((a, b) => TURN.indexOf(who(a)) - TURN.indexOf(who(b)) || (a.due || '9').localeCompare(b.due || '9')));
  const rowEls = () => L.$$('.or-tk', root.current);

  useLayoutEffect(() => { mo('stagger', t === 'disputes' ? L.$$('.or-dc', root.current) : rowEls().filter(r => !r.hidden)); }, []);

  const match = o => {
    const b = L.brand(o.brand), c = L.creator(o.creator), qq = ui.q.trim().toLowerCase();
    return (ui.ph === 'all' || o.phase === ui.ph) && (ui.esc === 'all' || pay(o) === ui.esc) && (!qq || [o.title, b.name, c.name, o.id].join(' ').toLowerCase().includes(qq));
  };
  const n = sorted.filter(match).length;
  const any = ui.ph !== 'all' || ui.esc !== 'all' || ui.q.trim();
  const apply = () => flushSync(rerender);
  const glide = () => { mo('flip', apply, rowEls()); };   // the tickets that stay glide to their new places
  const pick = k => { ui.ph = ui.ph === k ? 'all' : k; glide(); };
  const clear = () => { ui.q = ''; ui.ph = 'all'; ui.esc = 'all'; search.current.value = ''; glide(); search.current.focus(); };
  const go = k => () => { if (k !== t) L.go(k === 'disputes' ? '#orders-disputes' : '#orders'); };

  return (
    <div className="view-in or" ref={root}>
      <header className="or-head">
        <div className="or-head-t"><h1 className="t-h1">Orders &amp; escrow</h1>
          <p className="muted">{`Every hire on Linkloom, from invitation to payout. ${open.length} open dispute${open.length === 1 ? '' : 's'} or complaint${open.length === 1 ? '' : 's'}.`}</p></div>
        <div className="or-held"><span className="or-coin" aria-hidden="true"><LockIc /></span>
          <p><span className="or-held-l">Held in escrow, platform-wide</span><Count as="b" className="t-money" data-held="" value={heldNow} fmt={L.inr} /><span className="or-held-s">{`${L.liveOrders().length} live orders · commission ${s.rules.commissionPct}%`}</span></p></div>
      </header>
      <div className="seg or-seg" role="group" aria-label="Show">
        <button type="button" data-tab="orders" aria-pressed={t === 'orders'} onClick={go('orders')}>Orders<span className="or-seg-n">{orders.length}</span></button>
        <button type="button" data-tab="disputes" aria-pressed={t === 'disputes'} onClick={go('disputes')}>Disputes &amp; complaints<span className="or-seg-n">{open.length}</span></button>
      </div>
      {t === 'orders' ? <>
        <Pipeline orders={orders} f={ui.ph} pick={pick} />
        <section className="or-sec" aria-labelledby="orListH">
          <div className="or-filt">
            <h2 className="sr-only" id="orListH">Orders</h2>
            <div className="field or-q"><label className="sr-only" htmlFor="orQ">Search orders</label><span className="or-q-i" aria-hidden="true"><Icon n="search" /></span>
              <input className="input" id="orQ" type="search" placeholder="Search title, brand, creator or order ID" defaultValue={ui.q} autoComplete="off" ref={search} onInput={e => { ui.q = e.currentTarget.value; rerender(); }} /></div>
            <div className="field or-es"><label className="sr-only" htmlFor="orEs">Escrow state</label>
              <Select id="orEs" value={ui.esc} onChange={e => { ui.esc = e.target.value; glide(); }}>{ESC.map(([k, name]) => <option value={k} key={k}>{name}</option>)}</Select></div>
            <button className="btn-q or-clear" type="button" data-clear="" hidden={!any} onClick={clear}><Icon n="close" />Clear filters</button>
          </div>
          <p className="or-count help" aria-live="polite" data-count="">{`${n} of ${orders.length} order${orders.length === 1 ? '' : 's'}${ui.ph !== 'all' ? ' · ' + NAME(ui.ph) : ''}`}</p>
          <ol className="or-list">{sorted.map(o => <Ticket o={o} hidden={!match(o)} key={o.id} />)}</ol>
          <div className="empty or-none" hidden={n > 0}><img src="assets/step-03-lock.svg" width="160" height="120" alt="" /><p className="t-h2">No orders match</p><p className="muted">Try another phase or clear the filters.</p><Lq className="lq-s lq-sm" data-clear="" onClick={clear}>Clear filters</Lq></div>
        </section>
      </> : (
        <section className="or-sec" aria-labelledby="orDisH">
          <div className="or-sec-top"><h2 className="or-sec-h" id="orDisH">Open first, by SLA</h2><p className="help">Disputes freeze escrow. Payment complaints are about money that should have moved.</p></div>
          {ds.length ? <ol className="or-dlist">{ds.map(d => <DisputeCard d={d} key={d.id} />)}</ol> : <div className="empty"><img src="assets/step-05-stamp.svg" width="160" height="120" alt="" /><p className="t-h2">No disputes</p><p className="muted">When a brand or creator raises one, it lands here with its SLA.</p></div>}
        </section>
      )}
    </div>
  );
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
    return (
      <li className={`or-node ${cls}${st.k === 'revision' && o.phase !== 'revision' ? ' is-skip' : ''}`} aria-current={now ? 'step' : undefined} key={st.k}>
        <span className="or-nh"><span className="or-n" aria-hidden="true">{'0' + (i + 1)}</span><span className="or-nt">{st.n}<span className="sr-only">{`, ${now ? 'current stage' : done ? 'done' : 'not yet'}`}</span></span></span>
        <span className="or-rl" aria-hidden="true"><i></i></span><span className="or-nd">{sub}</span></li>
    );
  });
  if (end) {
    const d = disputeOf(o);
    nodes.push(
      <li className={`or-node is-end is-${o.phase}`} aria-current="step" key="end"><span className="or-nh"><span className="or-n" aria-hidden="true">—</span><span className="or-nt">{NAME(o.phase)}<span className="sr-only">, where it is now</span></span></span>
        <span className="or-rl" aria-hidden="true"><i><Icon n={o.phase === 'refunded' ? 'refund' : 'alert'} /></i></span><span className="or-nd">{o.phase === 'refunded' ? (o.forced === 'refund' ? 'By admin · ' : '') + L.fmtDate(o.refunded) : d ? 'Opened ' + L.fmtDate(d.opened) : 'Frozen'}</span></li>
    );
  }
  return nodes;
}
function Money({ o }) {
  const st = pay(o), c = L.creator(o.creator), b = L.brand(o.brand);
  return (
    <div className="or-money" data-pay={st}>
      <div className={'or-mn' + (st === 'none' ? (o.phase === 'accepted' ? ' is-now' : '') : ' is-done')}><span className="or-mdot" aria-hidden="true"></span><b>Paid in</b><span>{o.funded ? 'By ' + b.name + ' · ' + L.fmtDate(o.funded) : 'Not yet'}</span></div>
      <div className={'or-mn or-mn-hold' + (st === 'held' ? ' is-now' : st === 'none' ? '' : ' is-done')}><span className="or-mdot" aria-hidden="true"></span><b>Held in escrow</b><span>{st === 'held' ? (o.phase === 'disputed' ? 'Frozen by the dispute' : 'Since ' + L.fmtDate(o.funded)) : st === 'none' ? 'While the work happens' : 'Until ' + (st === 'released' ? 'release' : 'the refund')}</span><span className="or-band" aria-hidden="true"></span></div>
      <div className={'or-mn or-mn-out' + (st === 'released' || st === 'refunded' ? ' is-now' : '')}><span className="or-mdot" aria-hidden="true"></span><b>{st === 'refunded' ? 'Refunded to ' + b.name : 'Released to ' + first(c.name)}</b><span>{st === 'released' ? L.fmtDate(o.released) : st === 'refunded' ? L.fmtDate(o.refunded) : 'On approval'}</span></div>
    </div>
  );
}
function Slip({ o }) {
  const m = orderMoney(o), r = S().rules, st = pay(o), c = L.creator(o.creator);
  return (
    <article className="or-slip" aria-label="Order money">
      <header className="or-slip-h"><span>{`Order money · ${o.id.slice(0, 8).toUpperCase()}`}</span><PayPill o={o} /></header>
      <p className="or-slip-big"><span className="t-money" data-amt="">{L.inr(m.price)}</span><span>{st === 'held' ? 'in escrow now' : st === 'released' ? 'paid to ' + first(c.name) : st === 'refunded' ? 'returned to the brand' : 'agreed price'}</span></p>
      <dl className="or-slip-rows">
        <div><dt>Brand pays</dt><dd>{L.inr(m.price)}</dd></div>
        <div className="is-com"><dt>Commission <span className="or-rate"><Icon n="lock" />{`${r.commissionPct}%`}</span></dt><dd>{L.inr(m.commission)}</dd></div>
        <div><dt>Creator receives</dt><dd>{L.inr(m.creatorGets)}</dd></div>
        <div className="is-gw"><dt>Gateway fee <span className="or-rate">{`${r.gatewayPct}%`}</span></dt><dd>{L.inr(m.gateway)}</dd></div>
        <div className="is-net"><dt>Linkloom on this order</dt><dd>{L.inr(m.linkloom)}</dd></div>
      </dl>
      <p className="or-slip-n"><Icon n="info" /><span>No commission under the subscription model. The gateway fee is Linkloom’s cost, never charged to the brand or the creator. Taxes as per confirmed rules.</span></p>
      <p className="or-slip-f">Rate set in platform rules · read only. Editing rates is a future setting.</p>
    </article>
  );
}
function Timeline({ o }) {
  const d = S().disputes.filter(x => x.order === o.id), ev = [];
  if (o.funded) ev.push([o.funded, `${L.inr(o.amount)} paid into escrow by ${L.brand(o.brand).name}`]);
  d.forEach(x => x.opened && ev.push([x.opened, `${x.kind === 'payment' ? 'Complaint' : 'Dispute'} opened by the ${x.by}`]));
  S().audit.filter(a => a.target.includes(o.id)).forEach(a => ev.push([a.at, `${a.who}: ${a.action}`, a.hash]));
  if (o.released && !o.forced) ev.push([o.released, `${L.inr(o.amount)} released to ${L.creator(o.creator).name}`]);
  if (o.refunded && !o.forced) ev.push([o.refunded, `${L.inr(o.amount)} refunded to ${L.brand(o.brand).name}`]);
  ev.sort((a, b) => L.D(b[0]) - L.D(a[0]));
  ev.forEach(e => { e[0] = String(e[0]); });
  return ev.length ? <ol className="or-log">{ev.map((e, i) => <li key={i}><span>{e[1]}{e[2] ? <> <code className="or-hash" title="Audit hash">{'#' + e[2]}</code></> : null}</span><time dateTime={e[0]}>{L.fmtDate(e[0]) + (e[0].length > 10 ? ', ' + time(e[0]) : '')}</time></li>)}</ol> : <p className="muted">Nothing logged yet.</p>;
}

/* ---------- #orders-<id> (order) and #orders-<dispute id> ---------- */
function Detail({ id }) {
  const root = useRef(null), paints = useRef(0);
  const rerender = useRerender();
  const d0 = dispute(id), o0 = d0 ? order(d0.order) : order(id);
  const [tried, setTried] = useState(false);
  useEffect(() => { let on = true; (d0 ? fetchDispute(id).then(d => d.order && fetchOrder(d.order)) : fetchOrder(id)).catch(() => {}).finally(() => on && setTried(true)); return () => { on = false; }; }, [id]);
  useLayoutEffect(() => {
    if (!o0) return;
    mo('stagger', L.$$('.or-node', root.current));
    const p = L.$('.or-dh-m .pill-escrow svg', root.current);
    const t = p && setTimeout(() => p.isConnected && mo('lock', p, { color: 'plum' }), 450);
    return () => clearTimeout(t);
  }, []);
  if (!o0 && !tried) return <div className="view-in or"><div className="empty"><p className="t-h3">Loading the order</p></div></div>;
  if (!o0) return <div className="view-in or"><a className="btn-q or-back" href="#orders"><Icon n="back" /><span>Orders</span></a><div className="empty"><img src="assets/step-03-lock.svg" width="160" height="120" alt="" /><p className="t-h2">That order isn’t here</p><p className="muted">It may have been archived. Search the full list instead.</p><Lq as="a" className="lq-p" href="#orders">All orders</Lq></div></div>;

  const o = order(o0.id), d = d0 ? dispute(d0.id) : null, od = disputeOf(o), b = L.brand(o.brand), c = L.creator(o.creator), w = who(o), nodes = rail(o);
  const isD = !!d, t = d ? sla(d) : null, held = pay(o) === 'held';
  /* after a decision the page is drawn afresh; the outcome gets its check and the last stage a bump */
  const after = () => {
    paints.current++; flushSync(rerender);
    const out = L.$('[data-out] .or-out-i', root.current); out && mo('check', out);
    const n = L.$('.or-node.is-end, .or-node:last-child', root.current); n && mo('bump', n);
  };
  const act = k => () => { const o2 = order(o0.id), d2 = d0 ? dispute(d0.id) : null; if (k === 'release') forceRelease(o2, d2, after); else if (k === 'refund') refundBrand(o2, d2, after); else markResolved(o2, d2, after); };
  const payout = S().finance.payouts.find(x => x.order === o.id);
  return (
    <div className="view-in or or-d no-anchor" data-who={w} ref={root} key={paints.current}>
      <a className="btn-q or-back" href={isD ? '#orders-disputes' : '#orders'}><Icon n="back" /><span>{isD ? 'Disputes & complaints' : 'Orders'}</span></a>
      <header className="or-dh">
        <div className="or-dh-t">
          <p className="or-dh-k">{isD ? <><KindTag d={d} /><Sla d={d} t={t} /></> : <><span className={`pill ${whoPill(o)}`}>{NAME(o.phase)}</span><span className="muted">{WHO[w]}</span></>}</p>
          <h1 className="t-h1">{o.title}</h1>
          <p className="or-parties"><a className="or-party is-brand" href={`#brand-${b.id}`}><Bav b={b} /><span><b>{b.name}</b><span className="muted">{`Brand · ${b.city}`}</span></span></a>
            <span className="or-parties-x" aria-hidden="true"><Icon n="arrow" /></span>
            <a className="or-party is-creator" href={`#creator-${c.id}`}><Cav c={c} /><span><b>{c.name}</b><span className="muted">{`Creator · ${c.handle || c.city}`}</span></span></a></p>
        </div>
        <div className="or-dh-m"><p className="t-money or-dh-amt">{L.inr(o.amount)}</p><p className="muted">{`${o.id.slice(0, 8).toUpperCase()} · ${dueTxt(o)}`}</p><PayPill o={o} /></div>
      </header>
      {!isD && od && od.status === 'open' ? <a className="or-alert" href={`#orders-${od.id}`}><Icon n="alert" /><span><b>{`${od.kind === 'payment' ? 'Payment complaint' : 'Dispute'} is open.`}</b>{` ${sla(od).t}. Arbitrate it there.`}</span><Icon n="chevron" /></a> : null}

      <section className="card or-board" aria-labelledby="orBoardH">
        <h2 className="sr-only" id="orBoardH">Where this order stands</h2>
        <div className="or-lane"><p className="or-lane-h">Work</p><ol className="or-rail" style={{ '--n': nodes.length }}>{nodes}</ol></div>
        <div className="or-lane or-lane-m"><p className="or-lane-h">Escrow <span>tracked apart from the work</span></p><Money o={o} /></div>
      </section>

      <div className="or-grid">
        <div className="or-main">
          {isD ? <>
            <section className="or-sec" aria-labelledby="orClaimH">
              <h2 className="or-sec-h" id="orClaimH">The claim</h2>
              <article className={`or-claim is-${d.by}`}>
                <p className="or-claim-w">{d.by === 'creator' ? <Cav c={c} /> : <Bav b={b} />}<span><b>{d.by === 'creator' ? c.name : b.name}</b><span className="muted">{`${d.by === 'creator' ? 'Creator' : 'Brand'}${d.opened ? ' · opened ' + L.fmtDate(d.opened) + ', ' + time(d.opened) : ''}`}</span></span></p>
                <blockquote>{d.claim}</blockquote>
                <p className="or-sec-s">Evidence</p>
                {d.evidence.length ? null : <p className="muted">No evidence attached.</p>}
                <ul className="or-ev">{d.evidence.map((x, i) => <li key={i}><Icon n={/chat/i.test(x) ? 'chat' : /link|live/i.test(x) ? 'link' : 'file'} /><span>{x}</span></li>)}</ul>
              </article>
              <article className={`or-claim is-other is-${d.by === 'creator' ? 'brand' : 'creator'}`}>
                <p className="or-claim-w">{d.by === 'creator' ? <Bav b={b} /> : <Cav c={c} />}<span><b>{d.by === 'creator' ? b.name : c.name}</b><span className="muted">The other side</span></span></p>
                <blockquote>{d.other}</blockquote>
              </article>
            </section>
            <section className="or-sec or-arb" aria-labelledby="orArbH" aria-live="polite">
              <h2 className="or-sec-h" id="orArbH">{d.status === 'open' ? 'Arbitrate' : 'Outcome'}</h2>
              {d.status === 'open' ? <>
                <p className="or-arb-l">Read both sides and the evidence. Every choice needs a reason, both parties see it, and it is written to the audit log.</p>
                <div className="or-arb-g">
                  {held ? <>
                    <button className="or-act is-creator" type="button" data-act="release" onClick={act('release')}><span className="or-act-i"><Cav c={c} /></span><span><b>Force release to creator</b><span>{`${c.name} did the job. ${L.inr(o.amount)} goes to them today.`}</span></span><Icon n="arrow" /></button>
                    <button className="or-act is-brand" type="button" data-act="refund" onClick={act('refund')}><span className="or-act-i"><Bav b={b} /></span><span><b>Refund brand</b><span>{`The work wasn’t delivered as briefed. ${L.inr(o.amount)} back to ${b.name}.`}</span></span><Icon n="arrow" /></button>
                  </> : null}
                  <button className="or-act is-neutral" type="button" data-act="resolve" onClick={act('resolve')}><span className="or-act-i or-act-ic"><Icon n="check" /></span><span><b>Mark resolved</b><span>The sides agreed or it runs on. No money moves.</span></span><Icon n="arrow" /></button>
                </div>
              </> : (
                <div className="or-out" data-out=""><span className="or-out-i"><Icon n="check" /></span><div><p className="t-h2">{d.outcome || 'Resolved'}</p>
                  <p className="muted">{d.by_admin ? `By ${d.by_admin}${d.resolvedAt ? ' · ' + L.fmtDate(d.resolvedAt) + ', ' + time(d.resolvedAt) : ''}` : d.resolvedAt ? L.fmtDate(d.resolvedAt) : 'Resolved'}</p>
                  {d.reason ? <p className="or-out-r">{`“${d.reason}”`}</p> : null}
                  <a className="btn-q" href="#audit"><Icon n="shield" />Audit log</a></div></div>
              )}
            </section>
          </> : <>
            <section className="or-sec" aria-labelledby="orFactsH">
              <h2 className="or-sec-h" id="orFactsH">Order</h2>
              <dl className="or-facts">
                <div className="kv"><dt>Order ID</dt><dd className="num">{o.id.slice(0, 8).toUpperCase()}</dd></div>
                <div className="kv"><dt>Paid into escrow</dt><dd>{o.funded ? L.fmtDate(o.funded, { year: true }) : '—'}</dd></div>
                <div className="kv"><dt>Due</dt><dd>{o.due ? L.fmtDate(o.due, { year: true }) : '—'}</dd></div>
                <div className="kv"><dt>{o.phase === 'refunded' ? 'Refunded' : 'Released'}</dt><dd>{o.released ? L.fmtDate(o.released, { year: true }) : o.refunded ? L.fmtDate(o.refunded, { year: true }) : '—'}</dd></div>
                <div className="kv"><dt>Payout</dt><dd>{payout ? `${payout.method}${payout.utr ? ' · ' + payout.utr : ''} · ${payout.status}` : '—'}</dd></div>
              </dl>
            </section>
            {held && !(od && od.status === 'open') ? <details className="or-ovr"><summary><Icon n="shield" /><span>Admin override</span><span className="muted">Only when support has confirmed with both sides</span></summary>
              <div className="or-arb-g">
                <button className="or-act is-creator" type="button" data-act="release" onClick={act('release')}><span className="or-act-i"><Cav c={c} /></span><span><b>Force release to creator</b><span>{`${L.inr(o.amount)} to ${c.name} today.`}</span></span><Icon n="arrow" /></button>
                <button className="or-act is-brand" type="button" data-act="refund" onClick={act('refund')}><span className="or-act-i"><Bav b={b} /></span><span><b>Refund brand</b><span>{`${L.inr(o.amount)} back to ${b.name}.`}</span></span><Icon n="arrow" /></button>
              </div></details> : null}
          </>}
          <section className="or-sec" aria-labelledby="orLogH"><h2 className="or-sec-h" id="orLogH">Timeline</h2><Timeline o={o} /></section>
        </div>
        <aside className="or-side" aria-label="Order money"><Slip o={o} /></aside>
      </div>
    </div>
  );
}

const Orders = ({ param }) => (!param || param === 'disputes' ? <List tab={param} /> : <Detail id={param} />);

L.register('orders', {
  title: p => !p ? 'Orders & escrow' : p === 'disputes' ? 'Disputes' : (dispute(p) ? 'Dispute' : 'Order'),
  nav: 'orders', Component: needs(['orders', 'disputes'], Orders, ['rules', 'payouts', 'creators', 'brands', 'audit', 'dashboard', 'counts'])
});
