/* Verification desk (#verify, #verify-<id>).
   The real queue from GET /v1/admin/verifications/ and each request from GET /v1/admin/verifications/{id}/, for a
   signed-in admin. Read only: the backend has no endpoint to approve, reject or ask for more yet, so the decision
   dock says so instead of pretending to decide. Classes are .vfy-*. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { data, store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import Av from '../components/Av.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { live, ensureVerifications, reloadVerifications, fetchVerification, documentUrl, sinceNow } from '../lib/live.js';

const ui = () => (data.ui.verify = data.ui.verify || { tab: 'all' });

const STATUS = { pending: ['pill-info', 'clock', 'Waiting'], approved: ['pill-ok', 'check', 'Approved'], rejected: ['pill-err', 'alert', 'Rejected'], info_requested: ['pill-warn', 'send', 'More info asked'] };
const Pill = ({ st }) => { const m = STATUS[st] || STATUS.pending; return <span className={`pill ${m[0]}`}><Icon n={m[1]} />{m[2]}</span>; };
const Kind = ({ k }) => <span className={`vfy-kind vfy-kind--${k}`}><i className="dot"></i>{k === 'brand' ? 'Brand' : 'Creator'}</span>;
const sigIcon = ok => (ok === 'ok' ? 'check' : ok === 'warn' ? 'info' : 'alert');
const Sig = ({ c }) => <li className={`vfy-sig is-${c.ok}`} title={c.n + ': ' + c.t}><span className="vfy-sig-i"><Icon n={sigIcon(c.ok)} /></span><span className="vfy-sig-n">{c.n}</span><span className="sr-only">{': ' + c.t}</span></li>;
const Kvs = ({ rows }) => <dl className="vfy-kv">{rows.filter(Boolean).map(([k, v, s]) => <div key={k}><dt>{k}</dt><dd>{v}{s ? <span className={`vfy-m is-${s.k}`}><Icon n={s.k === 'ok' ? 'check' : s.k === 'close' || s.k === 'warn' ? 'info' : 'alert'} />{s.t}</span> : null}</dd></div>)}</dl>;
const Mono = ({ t }) => <span className="vfy-mono num">{t}</span>;
const None = ({ t = 'Not provided' }) => <span className="muted">{t}</span>;

const done = d => (d ? { k: 'ok', t: 'Submitted' } : { k: 'bad', t: 'Not submitted' });
const liveChecks = v => [
  { k: 'pan', n: 'PAN', ok: v.pan.done ? 'ok' : 'bad', t: v.pan.done ? 'Submitted' : 'Not submitted' },
  { k: 'id', n: 'ID', ok: v.idDoc.done ? 'ok' : 'bad', t: v.idDoc.done ? (v.idDoc.type || 'Submitted') : 'Not submitted' },
  { k: 'bank', n: 'Bank', ok: v.bank.done ? 'ok' : 'bad', t: v.bank.done ? 'Submitted' : 'Not submitted' }
];
const liveAgo = sinceNow;
function LiveRow({ v }) {
  const c = liveChecks(v), missing = c.filter(x => x.ok !== 'ok').length;
  return (
    <li className={'vfy-row' + (v.status !== 'pending' ? ' is-done' : '')} data-kind={v.kind}>
      <a className="vfy-row-a" href={`#verify-${v.id}`} aria-label={`${v.name}, ${v.kind}. ${STATUS[v.status][2]}. Open`}>
        <Av kind={v.kind} name={v.name} />
        <span className="vfy-row-id"><b>{v.name}</b><span><Kind k={v.kind} /><span className="num">{v.submittedAt ? `Sent ${liveAgo(v.submittedAt)}` : (v.email || '')}</span></span></span>
        <ul className="vfy-sigs" aria-label="Steps">{c.map(x => <Sig c={x} key={x.k} />)}</ul>
        <span className="vfy-row-flag">{v.status !== 'pending' ? <Pill st={v.status} /> : missing ? <span className="vfy-flag"><Icon n="alert" />{`${missing} step${missing > 1 ? 's' : ''} missing`}</span> : <span className="vfy-clear"><Icon n="check" />All steps submitted</span>}</span>
        <span className="vfy-row-sla">{v.status === 'pending' ? <Pill st="pending" /> : <span className="t-cap muted">{[v.decidedBy, liveAgo(v.decidedAt)].filter(Boolean).join(' · ')}</span>}</span>
        <span className="vfy-row-go"><Icon n="chevron" /></span>
      </a></li>
  );
}
function LiveQueue() {
  const root = useRef(null);
  const rerender = useRerender();
  const u = ui(), lv = live();
  useEffect(() => { ensureVerifications(); return store.on(why => { if (why === 'live') rerender(); }); }, []);
  useLayoutEffect(() => { mo('stagger', [...root.current.querySelectorAll('.vfy-row')]); }, [lv.vstatus, u.tab]);
  const all = lv.verifications, f = v => u.tab === 'all' || v.kind === u.tab;
  const pend = all.filter(v => v.status === 'pending'), P = pend.filter(f), D = all.filter(v => v.status !== 'pending').filter(f);
  const cnt = k => pend.filter(v => k === 'all' || v.kind === k).length;
  const setTab = k => () => { u.tab = k; flushSync(rerender); };
  const ready = lv.vstatus === 'ready';
  return (
    <div className="view-in vfy" ref={root}>
      <header className="page-h vfy-head">
        <div className="t"><p className="t-eyebrow">Verification desk</p><h1 className="t-h1">{!ready ? 'Verification queue' : pend.length ? `${pend.length} waiting for a decision` : 'Queue is clear'}</h1>
          <p className="muted">Read only for now: approving and rejecting need endpoints the backend does not have yet.</p></div>
        <div className="seg vfy-seg" role="group" aria-label="Show">
          {[['creator', 'Creators'], ['brand', 'Brands'], ['all', 'All']].map(([k, t]) => <button type="button" data-tab={k} aria-pressed={u.tab === k} key={k} onClick={setTab(k)}>{t + ' '}<span className="vfy-seg-n num">{ready ? cnt(k) : '–'}</span></button>)}
        </div>
      </header>
      {lv.vstatus === 'loading' || lv.vstatus === 'idle' ? <div className="empty"><p className="t-h3">Loading the verification queue</p><p className="muted">The server can take up to a minute to wake up.</p></div>
        : lv.vstatus === 'failed' ? <div className="empty"><p className="t-h3">The verification queue did not load.</p><p className="muted">{lv.verror}</p><Lq className="lq-s lq-sm" onClick={reloadVerifications}>Try again</Lq></div>
        : <>
          <section aria-labelledby="vfyQ"><h2 className="sr-only" id="vfyQ">Waiting</h2><ol className="vfy-list no-anchor" id="vfyList">
            {P.length ? P.map(v => <LiveRow v={v} key={u.tab + v.id} />) : <li className="empty" key={u.tab}><img src="assets/step-05-stamp.svg" width="160" height="117" alt="" /><p className="t-h3">Nothing waiting here</p><p className="muted">New requests show up here when a creator or brand submits KYC.</p></li>}
          </ol></section>
          <section className="vfy-done" aria-labelledby="vfyD" hidden={!D.length}><h2 className="t-h3" id="vfyD">Decided</h2><ol className="vfy-list vfy-list--done no-anchor" id="vfyDone">{D.map(v => <LiveRow v={v} key={u.tab + v.id} />)}</ol></section>
        </>}
    </div>
  );
}
function LiveDetail({ id }) {
  const root = useRef(null);
  const [got, setGot] = useState({ v: null, done: false, err: '' });
  const [doc, setDoc] = useState('');
  useEffect(() => {
    let on = true;
    fetchVerification(id).then(v => on && setGot({ v, done: true, err: '' }), e => on && setGot({ v: null, done: true, err: (e && e.status === 404) ? '' : ((e && e.message) || 'It did not load.') }));
    return () => { on = false; };
  }, []);
  const v = got.v;
  useEffect(() => { if (v) document.title = v.name + ' · Verification · Linkloom'; }, [v && v.name]);
  useLayoutEffect(() => { if (v) mo('stagger', [...root.current.querySelectorAll('.vfy-card,.vfy-sigs--lg>li')]); }, [!!v]);
  if (!got.done) return <div className="view-in"><div className="empty"><p className="t-h2">Loading this request</p><p className="muted">Asking the Linkloom API.</p></div></div>;
  if (!v) return <div className="view-in"><div className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h2">{got.err ? 'This request did not load.' : 'No request with that link.'}</p><p className="muted">{got.err || 'It may have been withdrawn by the applicant.'}</p><Lq className="lq-p" data-go="#verify">Back to the desk</Lq></div></div>;
  const c = liveChecks(v), clear = c.filter(x => x.ok === 'ok').length, pending = v.status === 'pending';
  const openDoc = async () => {
    setDoc('Opening…');
    try { const url = await documentUrl(v.idDoc.uploadId); if (url) { window.open(url, '_blank', 'noopener'); setDoc(''); } else setDoc('The API gave no link for this document.'); }
    catch (e) { setDoc(e && (e.status === 403 || e.status === 404) ? 'The backend does not let an admin open this document yet.' : 'The document did not open. Try again.'); }
  };
  return (
    <div className="view-in vfy vfy-d" ref={root}>
      <a className="btn-q vfy-back" href="#verify"><Icon n="back" />Verification desk</a>
      <header className="vfy-mast">
        <Av kind={v.kind} name={v.name} cls="vfy-av" />
        <div className="vfy-mast-t">
          <p className="vfy-mast-k"><Kind k={v.kind} /><span>{v.kind === 'brand' ? 'Brand verification' : 'Creator KYC'}</span>{v.kind === 'creator' && v.accountId ? <a className="btn-q" href={`#creator-${v.accountId}`}>View account</a> : null}</p>
          <h1 className="t-h1">{v.name}</h1>
          <p className="muted num">{(v.submittedAt ? `Sent ${L.fmtDate(v.submittedAt)}, ${liveAgo(v.submittedAt)}` : 'Submission time not given')}</p>
        </div>
        <div className="vfy-mast-s"><Pill st={v.status} /><p className="vfy-score"><b className="t-money num">{clear}</b><span>{`of ${c.length} steps submitted`}</span></p></div>
      </header>
      {!pending ? <div className={`vfy-result is-${v.status}`} role="status"><span className="vfy-result-i"><Icon n={v.status === 'approved' ? 'check' : v.status === 'rejected' ? 'alert' : 'send'} /></span>
        <div><p className="t-h3">{v.status === 'approved' ? 'Approved' : v.status === 'rejected' ? 'Rejected' : 'Waiting on the applicant'}</p><p className="muted">{[v.reason, v.decidedBy, liveAgo(v.decidedAt)].filter(Boolean).join(' · ') || 'Decided.'}</p></div></div> : null}
      <ul className="vfy-sigs vfy-sigs--lg" aria-label="Steps">{c.map(x => <li className={`vfy-sig is-${x.ok}`} key={x.k}><span className="vfy-sig-i"><Icon n={sigIcon(x.ok)} /></span><span className="vfy-sig-t"><b>{x.n}</b><span>{x.t}</span></span></li>)}</ul>
      <div className="vfy-cards">
        <section className="vfy-card" aria-labelledby="vfyLId"><header><span className="vfy-ci"><Icon n="user" /></span><h2 className="t-h3" id="vfyLId">Account</h2></header>
          <Kvs rows={[['Name', v.name], v.email ? ['Email', v.email] : null, v.phone ? ['Phone', <Mono t={v.phone} />] : null, ['Type', v.kind === 'brand' ? 'Brand' : 'Creator'], ['Status from the API', <Mono t={v.rawStatus || 'not given'} />]]} /></section>
        <section className="vfy-card" aria-labelledby="vfyLPan"><header><span className="vfy-ci"><Icon n="file" /></span><h2 className="t-h3" id="vfyLPan">PAN and ID</h2></header>
          <Kvs rows={[['PAN', v.pan.masked ? <Mono t={v.pan.masked} /> : <None />, done(v.pan.done)], ['Name on PAN', v.pan.name || <None />], ['ID document', v.idDoc.type || <None />, done(v.idDoc.done)]]} />
          {v.idDoc.uploadId ? <div className="row wrap"><Lq className="lq-s lq-sm" onClick={openDoc}><Icon n="eye" className="ic" />Open the ID document</Lq></div> : null}
          {doc ? <p className="vfy-note" role="status">{doc}</p> : null}</section>
        <section className="vfy-card" aria-labelledby="vfyLBank"><header><span className="vfy-ci"><Icon n="wallet" /></span><h2 className="t-h3" id="vfyLBank">Payout account</h2></header>
          <Kvs rows={[['Account', v.bank.masked ? <Mono t={v.bank.masked} /> : <None />, done(v.bank.done)], ['Holder', v.bank.holder || <None />], ['IFSC', v.bank.ifsc ? <Mono t={v.bank.ifsc} /> : <None />]]} />
          <p className="vfy-note">Full numbers stay with the backend; only the last digits are shown.</p></section>
        {v.extra.length ? <section className="vfy-card" aria-labelledby="vfyLMore"><header><span className="vfy-ci"><Icon n="info" /></span><h2 className="t-h3" id="vfyLMore">Other fields from the API</h2></header>
          <Kvs rows={v.extra.map(([k, val]) => [k, <Mono t={val} />])} /></section> : null}
      </div>
      {pending ? <div className="vfy-dock" role="region" aria-label="Decision">
        <p className="vfy-dock-t"><Icon n="info" /><span>Approve, reject and ask-for-more are not connected: the backend has no endpoint for them yet.</span></p>
        <div className="vfy-dock-b">
          <Lq className="lq-s lq-sm" disabled aria-disabled="true"><Icon n="close" className="ic" />Reject</Lq>
          <Lq className="lq-s lq-sm" disabled aria-disabled="true"><Icon n="chat" className="ic" />Ask for more info</Lq>
          <Lq className="lq-p lq-sm" disabled aria-disabled="true"><Icon n="check" className="ic" />Approve</Lq>
        </div></div> : null}
    </div>
  );
}

const Verify = ({ param }) => (param ? <LiveDetail id={param} /> : <LiveQueue />);

L.register('verify', { title: 'Verification', nav: 'verify', Component: Verify });
