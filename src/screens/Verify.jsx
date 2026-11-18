/* Verification desk (#verify, #verify-<id>).
   - GET  /v1/admin/verifications/?kind=&status=&limit=&cursor=   SLA-sorted queue, meta.counts
   - GET  /v1/admin/verifications/<id>/                           detail, masked values, 5-minute signed document
                                                                  links and automated `checks`
   - POST /v1/admin/verifications/<id>/approve/                    409 VERIFICATION_BLOCKED while a check blocks
   - POST /v1/admin/verifications/<id>/reject/        { reason (min 4), note }
   - POST /v1/admin/verifications/<id>/request-info/  { items: ["pan", "bank", ...], message }
   Classes are .vfy-* (and .adm-* for the shared pieces). */
import { useEffect, useRef, useState } from 'react';
import L, { data } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { api, can, num } from '../lib/admin.js';
import { mapVerification, sinceNow, refreshCounts } from '../lib/live.js';
import Av from '../components/Av.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { usePaged, useLoad, useStagger, Failed, Loading, More, RoleNote, ActBtn, decide, reason, note, errText, when } from '../components/Admin.jsx';

const ui = () => (data.ui.verify = data.ui.verify || { kind: '', status: 'pending' });

const STATUS = { pending: ['pill-info', 'clock', 'Waiting'], approved: ['pill-ok', 'check', 'Approved'], rejected: ['pill-err', 'alert', 'Rejected'], info_requested: ['pill-warn', 'send', 'More info asked'] };
const Pill = ({ st }) => { const m = STATUS[st] || STATUS.pending; return <span className={`pill ${m[0]}`}><Icon n={m[1]} />{m[2]}</span>; };
const Kind = ({ k }) => <span className={`vfy-kind vfy-kind--${k}`}><i className="dot"></i>{k === 'brand' ? 'Brand' : 'Creator'}</span>;
const sigIcon = ok => (ok === 'ok' ? 'check' : ok === 'warn' ? 'info' : 'alert');
const Kvs = ({ rows }) => <dl className="vfy-kv">{rows.filter(Boolean).map(([k, v, s]) => <div key={k}><dt>{k}</dt><dd>{v}{s ? <span className={`vfy-m is-${s.k}`}><Icon n={s.k === 'ok' ? 'check' : 'alert'} />{s.t}</span> : null}</dd></div>)}</dl>;
const Mono = ({ t }) => <span className="vfy-mono num">{t}</span>;
const None = ({ t = 'Not provided' }) => <span className="muted">{t}</span>;
const done = d => (d ? { k: 'ok', t: 'Submitted' } : { k: 'bad', t: 'Not submitted' });

/* the steps the applicant filled in (from the KYC record) */
const stepChecks = v => [
  { k: 'pan', n: 'PAN', ok: v.pan.done ? 'ok' : 'bad', t: v.pan.done ? 'Submitted' : 'Not submitted' },
  { k: 'id', n: 'ID', ok: v.idDoc.done ? 'ok' : 'bad', t: v.idDoc.done ? (v.idDoc.type || 'Submitted') : 'Not submitted' },
  { k: 'bank', n: 'Bank', ok: v.bank.done ? 'ok' : 'bad', t: v.bank.done ? 'Submitted' : 'Not submitted' }
];
/* the signals for a row: automated checks when the API sends them, the KYC steps otherwise */
const signals = v => (v.checks.length ? v.checks.map(c => ({ k: c.key, n: c.name, ok: c.tone === 'err' ? 'bad' : c.tone, t: c.message || c.status || '' })) : stepChecks(v));
const Sig = ({ c }) => <li className={`vfy-sig is-${c.ok}`} title={c.n + (c.t ? ': ' + c.t : '')}><span className="vfy-sig-i"><Icon n={sigIcon(c.ok)} /></span><span className="vfy-sig-n">{c.n}</span><span className="sr-only">{c.t ? ': ' + c.t : ''}</span></li>;

function QRow({ v }) {
  const c = signals(v), bad = c.filter(x => x.ok === 'bad').length, blocking = v.checks.some(x => x.blocking && x.tone !== 'ok');
  const sla = v.slaDueAt ? Date.parse(v.slaDueAt) - Date.now() : NaN;
  return (
    <li className={'vfy-row' + (v.status !== 'pending' ? ' is-done' : '')} data-kind={v.kind}>
      <a className="vfy-row-a" href={`#verify-${v.id}`} aria-label={`${v.name}, ${v.kind}. ${STATUS[v.status][2]}. Open`}>
        <Av kind={v.kind} name={v.name} />
        <span className="vfy-row-id"><b>{v.name}</b><span><Kind k={v.kind} /><span className="num">{v.submittedAt ? `Sent ${sinceNow(v.submittedAt)}` : (v.email || '')}</span></span></span>
        <ul className="vfy-sigs" aria-label="Checks">{c.slice(0, 5).map(x => <Sig c={x} key={x.k} />)}</ul>
        <span className="vfy-row-flag">{v.status !== 'pending' ? <Pill st={v.status} /> : blocking ? <span className="vfy-flag"><Icon n="lock" />Blocked by a check</span> : bad ? <span className="vfy-flag"><Icon n="alert" />{`${bad} check${bad > 1 ? 's' : ''} failing`}</span> : <span className="vfy-clear"><Icon n="check" />Checks clear</span>}</span>
        <span className="vfy-row-sla">{v.status === 'pending' ? (Number.isFinite(sla) ? <span className={`pill ${sla < 0 ? 'pill-err' : sla < 4 * 36e5 ? 'pill-warn' : 'pill-info'}`}><Icon n="clock" />{sla < 0 ? 'SLA missed' : `SLA ${Math.max(1, Math.round(sla / 36e5))} h`}</span> : <Pill st="pending" />) : <span className="t-cap muted">{[v.decidedBy, sinceNow(v.decidedAt)].filter(Boolean).join(' · ')}</span>}</span>
        <span className="vfy-row-go"><Icon n="chevron" /></span>
      </a></li>
  );
}

function Queue() {
  const root = useRef(null);
  const rerender = useRerender();
  const u = ui();
  const p = usePaged(api.verifications, { kind: u.kind, status: u.status });
  const rows = p.rows.map(mapVerification);
  useStagger(root, '.vfy-row', [p.loading, u.kind, u.status]);
  const mc = (p.meta && p.meta.counts) || {};
  const cnt = k => { const v = mc[k]; return num(v && typeof v === 'object' ? (v.pending ?? v.total) : v); };
  const set = (k, v) => () => { u[k] = v; rerender(); };
  const pend = cnt('pending');
  return (
    <div className="view-in vfy adm" ref={root}>
      <header className="page-h vfy-head">
        <div className="t"><p className="t-eyebrow">Verification desk</p><h1 className="t-h1">{p.loading ? 'Verification queue' : u.status === 'pending' ? (rows.length ? `${pend ?? rows.length} waiting for a decision` : 'Queue is clear') : 'Verification queue'}</h1>
          <p className="muted">Sorted by SLA: the oldest promise first.</p></div>
        <div className="seg vfy-seg" role="group" aria-label="Account type">
          {[['creator', 'Creators'], ['brand', 'Brands'], ['', 'All']].map(([k, t]) => <button type="button" aria-pressed={u.kind === k} key={k || 'all'} onClick={set('kind', k)}>{t + ' '}{cnt(k || 'total') != null && k ? <span className="vfy-seg-n num">{cnt(k)}</span> : null}</button>)}
        </div>
      </header>
      <RoleNote area="verify" doing="Deciding verifications" />
      <div className="chips adm-seg" role="group" aria-label="Status">
        {[['pending', 'Waiting'], ['info_requested', 'More info asked'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['', 'All']].map(([k, t]) => <button className="chip" type="button" aria-pressed={u.status === k} key={k || 'all'} onClick={set('status', k)}>{t}{cnt(k) != null && k ? <span className="adm-n num">{cnt(k)}</span> : null}</button>)}
      </div>
      {p.err ? <Failed err={p.err} retry={p.reload} what="The verification queue" />
        : p.loading ? <Loading what="the verification queue" />
        : <ol className="vfy-list no-anchor" id="vfyList">{rows.length ? rows.map(v => <QRow v={v} key={v.id} />)
          : <li className="empty"><img src="assets/step-05-stamp.svg" width="160" height="117" alt="" /><p className="t-h3">Nothing here</p><p className="muted">New requests show up when a creator or brand submits KYC.</p></li>}</ol>}
      <More p={p} />
    </div>
  );
}

const INFO_ITEMS = [['pan', 'PAN'], ['id', 'ID document'], ['bank', 'Bank account'], ['address', 'Address proof'], ['gst', 'GST certificate'], ['cin', 'Company registration (CIN)'], ['selfie', 'Selfie / liveness']];

function Detail({ id }) {
  const root = useRef(null);
  const r = useLoad(() => api.verification(id).then(mapVerification), [id]);
  const v = r.data;
  useEffect(() => { if (v) document.title = v.name + ' · Verification · Linkloom'; }, [v && v.name]);
  useStagger(root, '.vfy-card,.vfy-sigs--lg>li,.adm-check', [!!v]);
  if (r.err) return <div className="view-in adm"><a className="btn-q vfy-back" href="#verify"><Icon n="back" />Verification desk</a>{r.err.status === 404 ? <div className="empty"><p className="t-h2">No request with that link.</p><p className="muted">It may have been withdrawn by the applicant.</p></div> : <Failed err={r.err} retry={r.reload} what="This request" />}</div>;
  if (!v) return <div className="view-in"><Loading what="this request" /></div>;
  const steps = stepChecks(v), clear = steps.filter(x => x.ok === 'ok').length, pending = v.status === 'pending' || v.status === 'info_requested';
  const blocking = v.checks.filter(c => c.blocking && c.tone !== 'ok');
  const after = () => { refreshCounts(); r.reload(); };
  const approve = () => decide({
    title: `Approve ${v.name}?`, confirm: 'Approve', toast: 'Approved',
    intro: <><p>{`This marks their KYC verified and their ${v.kind} profile approved.`}</p>{v.checks.length ? <p className="muted">{`${v.checks.filter(c => c.tone === 'ok').length} of ${v.checks.length} automated checks pass.`}</p> : null}</>,
    run: () => api.approveVerification(v.id), done: after
  });
  const reject = () => decide({
    title: `Reject ${v.name}?`, confirm: 'Reject', tone: 'danger', toast: 'Rejected',
    intro: 'The applicant sees the reason and can submit again.',
    fields: [reason(4, 'Reason', 'Shown to the applicant and recorded in the audit log. At least 4 characters.'), note()],
    run: b => api.rejectVerification(v.id, b), done: after
  });
  const ask = () => decide({
    title: 'Ask for more information', confirm: 'Send request', toast: 'Request sent',
    intro: 'Their KYC status becomes "action needed" until they send what you ask for.',
    fields: [{ k: 'items', label: 'What is needed', type: 'checks', required: true, options: INFO_ITEMS, value: steps.filter(x => x.ok !== 'ok').map(x => x.k) },
      { k: 'message', label: 'Message to the applicant', type: 'textarea', required: true, min: 4 }],
    run: b => api.requestInfo(v.id, b), done: after
  });
  const openDoc = async d => {
    if (d.url && (!d.expiresAt || Date.parse(d.expiresAt) > Date.now())) { window.open(d.url, '_blank', 'noopener'); return; }
    L.toast('That link has expired. Getting a fresh one…', 'clock');
    try { const fresh = mapVerification(await api.verification(v.id)); r.set(fresh); const n = fresh.docs.find(x => x.key === d.key); n && n.url ? window.open(n.url, '_blank', 'noopener') : L.toast('The API gave no link for this document.', 'alert'); }
    catch (e) { L.toast(errText(e), 'alert'); }
  };
  const acct = v.accountId ? `#${v.kind}-${v.accountId}` : '';
  return (
    <div className="view-in vfy vfy-d adm" ref={root}>
      <a className="btn-q vfy-back" href="#verify"><Icon n="back" />Verification desk</a>
      <header className="vfy-mast">
        <Av kind={v.kind} name={v.name} cls="vfy-av" />
        <div className="vfy-mast-t">
          <p className="vfy-mast-k"><Kind k={v.kind} /><span>{v.kind === 'brand' ? 'Brand verification' : 'Creator KYC'}</span>{acct ? <a className="btn-q" href={acct}>View account</a> : null}</p>
          <h1 className="t-h1">{v.name}</h1>
          <p className="muted num">{(v.submittedAt ? `Sent ${L.fmtDate(v.submittedAt)}, ${sinceNow(v.submittedAt)}` : 'Submission time not given') + (v.slaDueAt ? ` · SLA ${when(v.slaDueAt)}` : '')}</p>
        </div>
        <div className="vfy-mast-s"><Pill st={v.status} /><p className="vfy-score"><b className="t-money num">{v.checks.length ? v.checks.filter(c => c.tone === 'ok').length : clear}</b><span>{v.checks.length ? `of ${v.checks.length} checks pass` : `of ${steps.length} steps submitted`}</span></p></div>
      </header>
      {v.status !== 'pending' ? <div className={`vfy-result is-${v.status}`} role="status"><span className="vfy-result-i"><Icon n={v.status === 'approved' ? 'check' : v.status === 'rejected' ? 'alert' : 'send'} /></span>
        <div><p className="t-h3">{v.status === 'approved' ? 'Approved' : v.status === 'rejected' ? 'Rejected' : 'Waiting on the applicant'}</p><p className="muted">{[v.reason, v.decidedBy, sinceNow(v.decidedAt)].filter(Boolean).join(' · ') || 'Decided.'}</p></div></div> : null}

      {v.checks.length ? <section className="stack" aria-labelledby="vfyChk"><h2 className="t-h3" id="vfyChk">Automated checks</h2>
        <ul className="stack">{v.checks.map(c => <li className={`adm-check is-${c.tone}`} key={c.key}><Icon n={c.tone === 'ok' ? 'check' : c.tone === 'warn' ? 'info' : 'alert'} />
          <span><b>{c.name}{c.blocking && c.tone !== 'ok' ? ' · blocks approval' : ''}</b>{c.message || c.status}</span></li>)}</ul></section>
        : <ul className="vfy-sigs vfy-sigs--lg" aria-label="Steps">{steps.map(x => <li className={`vfy-sig is-${x.ok}`} key={x.k}><span className="vfy-sig-i"><Icon n={sigIcon(x.ok)} /></span><span className="vfy-sig-t"><b>{x.n}</b><span>{x.t}</span></span></li>)}</ul>}

      <div className="vfy-cards">
        <section className="vfy-card" aria-labelledby="vfyLId"><header><span className="vfy-ci"><Icon n="user" /></span><h2 className="t-h3" id="vfyLId">Account</h2></header>
          <Kvs rows={[['Name', v.name], v.email ? ['Email', v.email] : null, v.phone ? ['Phone', <Mono t={v.phone} />] : null, ['Type', v.kind === 'brand' ? 'Brand' : 'Creator'], ['Status from the API', <Mono t={v.rawStatus || 'not given'} />]]} /></section>
        <section className="vfy-card" aria-labelledby="vfyLPan"><header><span className="vfy-ci"><Icon n="file" /></span><h2 className="t-h3" id="vfyLPan">PAN and ID</h2></header>
          <Kvs rows={[['PAN', v.pan.masked ? <Mono t={v.pan.masked} /> : <None />, done(v.pan.done)], ['Name on PAN', v.pan.name || <None />], ['ID document', v.idDoc.type || <None />, done(v.idDoc.done)]]} /></section>
        <section className="vfy-card" aria-labelledby="vfyLBank"><header><span className="vfy-ci"><Icon n="wallet" /></span><h2 className="t-h3" id="vfyLBank">Payout account</h2></header>
          <Kvs rows={[['Account', v.bank.masked ? <Mono t={v.bank.masked} /> : <None />, done(v.bank.done)], ['Holder', v.bank.holder || <None />], ['IFSC', v.bank.ifsc ? <Mono t={v.bank.ifsc} /> : <None />]]} />
          <p className="vfy-note">Full numbers stay with the backend; only masked values are shown.</p></section>
        <section className="vfy-card" aria-labelledby="vfyLDoc"><header><span className="vfy-ci"><Icon n="paperclip" /></span><h2 className="t-h3" id="vfyLDoc">Documents</h2></header>
          {v.docs.length ? <div className="stack">{v.docs.map(d => <Lq className="lq-s lq-sm" key={d.key} onClick={() => openDoc(d)}><Icon n="eye" className="ic" />{d.name}</Lq>)}
            <p className="vfy-note">Links are signed and last 5 minutes; an expired one is fetched again.</p></div> : <p className="muted">No documents in this request.</p>}</section>
        {v.extra.length ? <section className="vfy-card" aria-labelledby="vfyLMore"><header><span className="vfy-ci"><Icon n="info" /></span><h2 className="t-h3" id="vfyLMore">Other fields from the API</h2></header>
          <Kvs rows={v.extra.map(([k, val]) => [k, <Mono t={val} />])} /></section> : null}
      </div>
      {pending ? <div className="vfy-dock adm-dock" role="region" aria-label="Decision">
        <p>{!can('verify') ? <><Icon n="lock" /><span>Deciding needs the Super admin or Trust &amp; safety role.</span></>
          : blocking.length ? <><Icon n="lock" /><span>{`Approval is blocked: ${blocking.map(c => c.name).join(', ')}.`}</span></>
          : <><Icon n="info" /><span>Every decision is recorded in the audit log.</span></>}</p>
        <div className="adm-acts">
          <ActBtn area="verify" ic="close" onClick={reject}>Reject</ActBtn>
          <ActBtn area="verify" ic="chat" onClick={ask}>Ask for more info</ActBtn>
          <ActBtn area="verify" ic="check" tone="p" onClick={approve} disabled={!!blocking.length}>Approve</ActBtn>
        </div></div> : null}
    </div>
  );
}

const Verify = ({ param }) => (param ? <Detail id={param} key={param} /> : <Queue />);

L.register('verify', { title: 'Verification', nav: 'verify', Component: Verify });
