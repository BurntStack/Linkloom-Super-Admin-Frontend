/* Verification desk (#verify, #verify-<id>).
   Creator KYC (ID, PAN, payout, selfie, socials) and brand verification (GSTIN, company PAN, CIN, authorised person, billing) in one queue.
   Data: GET /v1/admin/verifications/ (queue) and GET /v1/admin/verifications/{id}/ (detail: masked values, signed
   document links, automated checks). Decisions: POST .../approve/, .../reject/ {reason, note}, .../request-info/ {items, message}.
   The server writes each decision to the audit log; a check with blocking: true turns Approve off (the server refuses it too).
   Classes are .vfy-* (and .adm-* for the confirm sheet in lib/adm.jsx). */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { data } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import { confirm, nameMatch, mask, freeMail, gstState, Av } from '../lib/adm.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import needs, { Waiting } from '../components/Needs.jsx';
import { act, reload, fetchVerification, why } from '../lib/admin.js';

const S = () => data;
const ui = () => { const s = S(); s.ui = s.ui || {}; return (s.ui.verify = s.ui.verify || { tab: 'all' }); };

/* ---------- checks: one list per request, used by the queue row, the summary and the problem band ---------- */
const SLA_H = { creator: 24, brand: 48 };
const ms = x => { const t = L.D(x).getTime(); return Number.isFinite(t) ? t : null; };
const ageH = v => { const t = ms(v.submitted); return t == null ? 0 : (Date.now() - t) / 36e5; };
const leftH = v => { const due = ms(v.slaDueAt); return due != null ? (due - Date.now()) / 36e5 : SLA_H[v.kind] - ageH(v); };
const sla = v => {
  if (ms(v.slaDueAt) == null && ms(v.submitted) == null) return { k: 'ok', t: 'Waiting', cls: 'pill-paper', ic: 'clock' };
  const left = leftH(v), h = Math.abs(left);
  const t = h < 1 ? Math.round(h * 60) + ' min' : Math.round(h) + ' h';
  return left < 0 ? { k: 'over', t: 'Over SLA by ' + t, cls: 'pill-err', ic: 'alert' } : left < 6 ? { k: 'soon', t: 'Due in ' + t, cls: 'pill-warn', ic: 'clock' } : { k: 'ok', t: 'Due in ' + t, cls: 'pill-paper', ic: 'clock' };
};
/* the server's automated checks when it sends them; otherwise what the submission itself shows */
function checks(v) {
  if (v.checks && v.checks.length) return v.checks;
  const out = [], sub = (k, n, done, t) => out.push({ k, n, ok: done ? 'ok' : 'bad', t: done ? t || 'Submitted' : 'Not submitted' });
  if (v.kind === 'creator') {
    const d = v.id_doc, age = d.dob ? L.ageFrom(d.dob) : null;
    if (age != null && age < 18) out.push({ k: 'id', n: 'ID', ok: 'bad', t: `Under 18 (age ${age})`, block: true });
    else sub('id', 'ID', d.submitted || !!d.masked, [d.type, age != null ? 'age ' + age : ''].filter(Boolean).join(' · '));
    const pm = d.name && v.pan.name ? nameMatch(d.name, v.pan.name) : null;
    out.push(pm ? { k: 'pan', n: 'PAN', ok: pm.k === 'ok' ? 'ok' : pm.k === 'close' ? 'warn' : 'bad', t: pm.t } : { k: 'pan', n: 'PAN', ok: v.pan.submitted || v.pan.masked ? 'ok' : 'bad', t: v.pan.submitted || v.pan.masked ? 'Submitted' : 'Not submitted' });
    const bm = d.name && v.bank.holder ? nameMatch(d.name, v.bank.holder) : null;
    out.push(bm ? { k: 'bank', n: v.bank.kind, ok: bm.k === 'ok' ? 'ok' : bm.k === 'close' ? 'warn' : 'bad', t: bm.k === 'ok' ? 'Holder matches' : bm.t } : { k: 'bank', n: v.bank.kind, ok: v.bank.submitted || v.bank.masked ? 'ok' : 'bad', t: v.bank.submitted || v.bank.masked ? 'Submitted' : 'Not submitted' });
    if (v.selfie.faceMatch != null) out.push({ k: 'face', n: 'Selfie', ok: v.selfie.faceMatch >= 85 && !/fail/i.test(v.selfie.liveness) ? 'ok' : 'bad', t: `${v.selfie.liveness ? v.selfie.liveness + ' · ' : ''}${v.selfie.faceMatch}% face match` });
    if (v.socials.length) { const unl = v.socials.filter(x => !x.linked); out.push({ k: 'soc', n: 'Socials', ok: unl.length ? 'warn' : 'ok', t: unl.length ? `${unl.length} not linked by login` : `${v.socials.length} linked by login` }); }
  } else {
    const b = v.business, p = v.person;
    out.push({ k: 'gst', n: 'GSTIN', ok: b.gstin ? (b.gstinStatus && !/active/i.test(b.gstinStatus) ? 'bad' : 'ok') : 'bad', t: b.gstin ? [b.gstinStatus, gstState(b.gstin)].filter(Boolean).join(' · ') || 'Provided' : 'Not provided' });
    out.push({ k: 'pan', n: 'Company PAN', ok: b.pan ? (b.gstin && b.gstin.slice(2, 12) !== b.pan ? 'bad' : 'ok') : 'bad', t: b.pan ? (b.gstin && b.gstin.slice(2, 12) === b.pan ? 'Matches the GSTIN' : b.gstin ? 'Does not match the GSTIN' : 'Provided') : 'Not provided' });
    out.push({ k: 'cin', n: 'CIN', ok: b.cin ? 'ok' : 'warn', t: b.cin ? 'Registered company' : 'Not provided' });
    out.push({ k: 'per', n: 'Authorised person', ok: p.name ? 'ok' : 'bad', t: p.name ? [p.name, p.designation].filter(Boolean).join(', ') : 'Not named' });
    if (p.mail) out.push({ k: 'mail', n: 'Business mail', ok: p.mailVerified && !freeMail(p.mail) ? 'ok' : 'bad', t: freeMail(p.mail) ? 'Free mail, not a company domain' : p.mailVerified ? 'Verified' : 'Not verified' });
    out.push({ k: 'bill', n: 'Billing', ok: v.billing.address ? 'ok' : 'warn', t: v.billing.address ? 'Address on file' : 'Missing' });
  }
  return out;
}
/* problem band: what blocks approval, and what to look at */
const problems = v => checks(v).filter(c => c.ok !== 'ok').map(c => ({ block: !!c.block, h: `${c.n}: ${c.t}`, d: c.block ? 'This check blocks approval. Reject it, or ask for what is missing.' : c.ok === 'bad' ? 'Look at this before you approve.' : 'Worth a look; it does not block approval.' }));

const STATUS = { pending: ['pill-info', 'clock', 'Waiting'], approved: ['pill-ok', 'check', 'Approved'], rejected: ['pill-err', 'alert', 'Rejected'], info_requested: ['pill-warn', 'send', 'More info asked'] };
const Pill = ({ st }) => { const m = STATUS[st] || STATUS.pending; return <span className={`pill ${m[0]}`}><Icon n={m[1]} />{m[2]}</span>; };
const Kind = ({ k }) => <span className={`vfy-kind vfy-kind--${k}`}><i className="dot"></i>{k === 'brand' ? 'Brand' : 'Creator'}</span>;
const sigIcon = ok => (ok === 'ok' ? 'check' : ok === 'warn' ? 'info' : 'alert');
const Sig = ({ c }) => <li className={`vfy-sig is-${c.ok}`} title={c.n + ': ' + c.t}><span className="vfy-sig-i"><Icon n={sigIcon(c.ok)} /></span><span className="vfy-sig-n">{c.n}</span><span className="sr-only">{': ' + c.t}</span></li>;
const bySla = (a, b) => leftH(a) - leftH(b);

/* ---------- queue ---------- */
function Row({ v }) {
  const c = checks(v), sl = sla(v), bad = c.filter(x => x.ok === 'bad').length, pr = problems(v).filter(x => x.block);
  return (
    <li className={'vfy-row' + (v.status !== 'pending' ? ' is-done' : '')} data-kind={v.kind}>
      <a className="vfy-row-a" href={`#verify-${v.id}`} aria-label={`${v.name}, ${v.kind}. ${v.status === 'pending' ? sl.t : STATUS[v.status][2]}. Open`}>
        <Av kind={v.kind} name={v.name} />
        <span className="vfy-row-id"><b>{v.name}</b><span><Kind k={v.kind} /><span className="num">{v.submitted ? `Sent ${L.ago(v.submitted)}` : v.email}</span></span></span>
        <ul className="vfy-sigs" aria-label="Checks">{c.map(x => <Sig c={x} key={x.k} />)}</ul>
        <span className="vfy-row-flag">{v.status !== 'pending' ? <Pill st={v.status} /> : pr.length ? <span className="vfy-flag"><Icon n="alert" />{pr[0].h.replace(/:.*/, '')}</span> : bad ? <span className="vfy-flag"><Icon n="alert" />{`${bad} check${bad > 1 ? 's' : ''} failed`}</span> : <span className="vfy-clear"><Icon n="check" />All checks clear</span>}</span>
        <span className="vfy-row-sla">{v.status === 'pending' ? <span className={`pill ${sl.cls}`}><Icon n={sl.ic} />{sl.t}</span> : <span className="t-cap muted">{[v.decidedBy, L.ago(v.decidedAt)].filter(Boolean).join(' · ')}</span>}</span>
        <span className="vfy-row-go"><Icon n="chevron" /></span>
      </a></li>
  );
}
function Queue() {
  const root = useRef(null);
  const rerender = useRerender();
  const s = S(), u = ui();
  const all = s.verifications;
  const cnt = k => all.filter(v => v.status === 'pending' && (k === 'all' || v.kind === k)).length;
  const pend = all.filter(v => v.status === 'pending').sort(bySla);
  const over = pend.filter(v => sla(v).k === 'over').length;
  const f = v => u.tab === 'all' || v.kind === u.tab;
  const P = pend.filter(f), D = all.filter(v => v.status !== 'pending').filter(f);
  /* a tab change lists the rows afresh (each one rises in), as the first paint does */
  useLayoutEffect(() => { mo('stagger', [...root.current.querySelectorAll('.vfy-row')]); }, [u.tab]);
  const setTab = k => () => { u.tab = k; flushSync(rerender); };
  return (
    <div className="view-in vfy" ref={root}>
      <header className="page-h vfy-head">
        <div className="t"><p className="t-eyebrow">Verification desk</p><h1 className="t-h1">{pend.length ? `${pend.length} waiting for a decision` : 'Queue is clear'}</h1>
          <p className="muted">Creators within 24 hours, brands within 48. Oldest first by time left.{over ? <> <b className="vfy-over">{`${over} over SLA.`}</b></> : null}</p></div>
        <div className="seg vfy-seg" role="group" aria-label="Show">
          {[['creator', 'Creators'], ['brand', 'Brands'], ['all', 'All']].map(([k, t]) => <button type="button" data-tab={k} aria-pressed={u.tab === k} key={k} onClick={setTab(k)}>{t + ' '}<span className="vfy-seg-n num">{cnt(k)}</span></button>)}
        </div>
      </header>
      <section aria-labelledby="vfyQ"><h2 className="sr-only" id="vfyQ">Waiting</h2><ol className="vfy-list no-anchor" id="vfyList">
        {P.length ? P.map(v => <Row v={v} key={u.tab + v.id} />) : <li className="empty" key={u.tab}><img src="assets/step-05-stamp.svg" width="160" height="117" alt="" /><p className="t-h3">Nothing waiting here</p><p className="muted">{`New ${u.tab === 'brand' ? 'brand' : u.tab === 'creator' ? 'creator' : ''} requests show up the minute they are sent.`}</p></li>}
      </ol></section>
      <section className="vfy-done" aria-labelledby="vfyD" hidden={!D.length}><h2 className="t-h3" id="vfyD">Decided</h2><ol className="vfy-list vfy-list--done no-anchor" id="vfyDone">{D.map(v => <Row v={v} key={u.tab + v.id} />)}</ol></section>
    </div>
  );
}

/* ---------- detail ---------- */
const ok = t => ({ k: 'ok', t }), bad = t => ({ k: 'bad', t }), warn = t => ({ k: 'warn', t });
/* rows: [label, value, status?] */
const Kvs = ({ rows }) => <dl className="vfy-kv">{rows.filter(Boolean).map(([k, v, s]) => <div key={k}><dt>{k}</dt><dd>{v}{s ? <span className={`vfy-m is-${s.k}`}><Icon n={s.k === 'ok' ? 'check' : s.k === 'close' || s.k === 'warn' ? 'info' : 'alert'} />{s.t}</span> : null}</dd></div>)}</dl>;
const Mono = ({ t }) => <span className="vfy-mono num">{t}</span>;
const None = ({ t = 'Not provided' }) => <span className="muted">{t}</span>;

const val = (x, t) => (x ? x : <None t={t} />);
const matchOf = (a, b) => { if (!a || !b) return null; const m = nameMatch(a, b); return m.k === 'ok' ? ok('Matches ID') : m.k === 'close' ? warn(m.t) : bad(m.t); };
function Docs({ v }) {
  if (!v.docs || !v.docs.length) return null;
  return (
    <section className="vfy-card" aria-labelledby="vfyDocs"><header><span className="vfy-ci"><Icon n="file" /></span><h2 className="t-h3" id="vfyDocs">Documents</h2></header>
      <ul className="vfy-socs">{v.docs.map((x, i) => <li key={i}><span className="vfy-soc-ic"><Icon n="file" /></span><span className="vfy-soc-t"><b>{x.label}</b><span>Signed link, valid for 5 minutes</span></span><Lq as="a" className="lq-s lq-sm" href={x.url} target="_blank" rel="noopener noreferrer">Open</Lq></li>)}</ul>
      <p className="vfy-note">Links expire after 5 minutes. Reload the page for fresh ones.</p></section>
  );
}
function CreatorBody({ v }) {
  const d = v.id_doc, age = d.dob ? L.ageFrom(d.dob) : null;
  const acc = v.account && L.creator(v.account);
  return (
    <>
      <section className="vfy-card" aria-labelledby="vfyId"><header><span className="vfy-ci"><Icon n="user" /></span><h2 className="t-h3" id="vfyId">Identity</h2></header>
        <Kvs rows={[['Document', val(d.type)], ['Number', d.masked ? <Mono t={d.masked} /> : <None />], ['Name on ID', val(d.name)],
          ['Date of birth', d.dob ? L.fmtDate(d.dob, { year: true }) : <None />, age == null ? null : age >= 18 ? ok(`Age ${age}`) : bad(`Age ${age}, under 18`)]]} /></section>
      <section className="vfy-card" aria-labelledby="vfyPan"><header><span className="vfy-ci"><Icon n="file" /></span><h2 className="t-h3" id="vfyPan">PAN and payout</h2></header>
        <Kvs rows={[['PAN', v.pan.masked ? <Mono t={v.pan.masked} /> : <None />], ['Name on PAN', val(v.pan.name), matchOf(d.name, v.pan.name)],
          [v.bank.kind === 'UPI' ? 'UPI ID' : 'Bank account', v.bank.masked ? <Mono t={v.bank.masked} /> : <None />], v.bank.ifsc ? ['IFSC', <Mono t={v.bank.ifsc} />] : null,
          ['Account holder', val(v.bank.holder), matchOf(d.name, v.bank.holder)]]} />
        <p className="vfy-note">Full numbers stay encrypted on the server; only masked values are shown.</p></section>
      {v.selfie.faceMatch != null || v.selfie.liveness ? <section className="vfy-card" aria-labelledby="vfySelf"><header><span className="vfy-ci"><Icon n="camera" /></span><h2 className="t-h3" id="vfySelf">Selfie</h2></header>
        <Kvs rows={[['Liveness', val(v.selfie.liveness), /pass/i.test(v.selfie.liveness) ? ok('Live') : v.selfie.liveness ? bad(v.selfie.liveness) : null]]} />
        {v.selfie.faceMatch != null ? <div className="vfy-face"><div className="vfy-face-h"><span>Face match with ID photo</span><b className="t-money num">{`${v.selfie.faceMatch}%`}</b></div>
          <div className="vfy-bar" role="img" aria-label={`Face match ${v.selfie.faceMatch} percent; 85 percent needed`}><i style={{ width: Math.min(100, v.selfie.faceMatch) + '%' }}></i><s style={{ left: '85%' }}></s></div>
          <p className="t-cap muted">85% needed. The selfie itself is never shown here or to brands.</p></div> : null}</section> : null}
      <section className="vfy-card" aria-labelledby="vfySoc"><header><span className="vfy-ci"><Icon n="link" /></span><h2 className="t-h3" id="vfySoc">Social accounts</h2></header>
        {v.socials.length ? <ul className="vfy-socs">{v.socials.map(x => <li key={x.p + x.handle}><span className="vfy-soc-ic"><Icon n={x.p === 'youtube' ? 'yt' : 'ig'} /></span>
          <span className="vfy-soc-t"><b>{x.handle || '—'}</b><span>{(x.p === 'youtube' ? 'YouTube' : 'Instagram') + (x.age ? ` · ${x.age} old` : '')}</span></span>
          <span className="vfy-soc-n"><b className="t-money">{L.compact(x.followers)}</b><span>{x.p === 'youtube' ? 'subscribers' : 'followers'}</span></span>
          {x.linked ? <span className="pill pill-ok"><Icon n="check" />Linked</span> : <span className="pill pill-err"><Icon n="alert" />Not linked</span>}</li>)}</ul> : <p className="muted">No social accounts in this request.</p>}
        {acc && !acc.stub ? <p className="vfy-note">{`On Linkloom${acc.joined ? ' since ' + L.fmtDate(acc.joined, { year: true }) : ''}: ${L.compact(acc.followers || 0)} followers, ${acc.jobs} jobs${acc.rating ? ', rated ' + acc.rating : ''}. `}<a className="btn-q" href={`#creator-${acc.id}`}>Account</a></p> : null}</section>
      <Docs v={v} />
    </>
  );
}
function BrandBody({ v }) {
  const b = v.business, p = v.person, g = b.gstin, cin = b.cin;
  const dom = (p.mail || '').split('@')[1] || '', bdom = (v.billing.email || '').split('@')[1] || '';
  return (
    <>
      <section className="vfy-card" aria-labelledby="vfyBiz"><header><span className="vfy-ci"><Icon n="brief" /></span><h2 className="t-h3" id="vfyBiz">Business</h2></header>
        <Kvs rows={[['Legal name', val(b.legal)],
          ['GSTIN', g ? <Mono t={g} /> : <None />, g ? (!b.gstinStatus || /active/i.test(b.gstinStatus) ? ok([b.gstinStatus || 'Provided', gstState(g)].filter(Boolean).join(' · ')) : bad(b.gstinStatus)) : bad('Missing')],
          ['Company PAN', b.pan ? <Mono t={mask(b.pan)} /> : <None />, b.pan ? (g ? (g.slice(2, 12) === b.pan ? ok('Same as characters 3 to 12 of the GSTIN') : bad('Does not match the GSTIN')) : null) : bad('Missing')],
          ['CIN', cin ? <Mono t={cin} /> : <None />, cin ? ok('Provided') : warn('Needed for companies; LLPs give an LLPIN')]]} /></section>
      <section className="vfy-card" aria-labelledby="vfyPer"><header><span className="vfy-ci"><Icon n="user" /></span><h2 className="t-h3" id="vfyPer">Authorised person</h2></header>
        <Kvs rows={[['Name', val(p.name, 'Not named')], ['Designation', val(p.designation, '—')],
          ['Business mail', val(p.mail), !p.mail ? null : freeMail(p.mail) ? bad('Free mailbox') : p.mailVerified ? ok('Verified by link') : bad('Not verified')]]} /></section>
      <section className="vfy-card" aria-labelledby="vfyBill"><header><span className="vfy-ci"><Icon n="wallet" /></span><h2 className="t-h3" id="vfyBill">Billing</h2></header>
        <Kvs rows={[['Address', val(v.billing.address)],
          ['Invoices to', val(v.billing.email), v.billing.email && dom ? (bdom === dom ? ok('Same domain as the person') : warn('Different domain')) : null]]} /></section>
      <Docs v={v} />
    </>
  );
}

function Detail({ id }) {
  const root = useRef(null);
  const [st, setSt] = useState({ done: false, err: '' });
  const s = S(), v = s.verifications.find(x => x.id === id);
  useEffect(() => { let on = true; fetchVerification(id).then(() => on && setSt({ done: true, err: '' }), e => on && setSt({ done: true, err: why(e) })); return () => { on = false; }; }, [id]);
  useLayoutEffect(() => {
    if (!v || !root.current) return;
    mo('stagger', [...root.current.querySelectorAll('.vfy-card,.vfy-sigs--lg>li')]);
  }, [!!v]);
  if (!v && !st.done) return <Waiting title="Loading the request" />;
  if (!v) return <div className="view-in"><div className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h2">No request with that link.</p><p className="muted">{st.err || 'It may have been withdrawn by the applicant.'}</p><Lq className="lq-p" data-go="#verify">Back to the desk</Lq></div></div>;

  const c = checks(v), pr = problems(v), block = pr.some(x => x.block), sl = sla(v), pending = v.status === 'pending';
  const clear = c.filter(x => x.ok === 'ok').length;
  const next = s.verifications.filter(x => x.status === 'pending' && x.id !== v.id).sort(bySla)[0];
  const acc = v.account ? (v.kind === 'brand' ? L.brand(v.account) : L.creator(v.account)) : null;
  /* after a decision: the queue and this request are fetched again, then the page shows the outcome */
  const after = () => reload(['verifications', 'counts']).then(() => fetchVerification(v.id).catch(() => {})).then(() => L.route());

  const ITEMS = v.kind === 'creator'
    ? [['id', 'A clearer photo of the ID, both sides'], ['pan', 'PAN card photo'], ['bank', 'Payout account in their own name (bank letter or cancelled cheque)'], ['selfie', 'A new selfie in good light'], ['socials', 'Connect Instagram or YouTube by login']]
    : [['gstin', 'GSTIN and the GST registration certificate'], ['pan', 'Company PAN'], ['cin', 'Certificate of incorporation (CIN or LLPIN)'], ['person', 'Name and designation of the authorised person, with a board or partner letter'], ['email', 'A work email on the company domain'], ['billing', 'Billing address and accounts email']];
  const KEY = { id: 'id', pan: 'pan', bank: 'bank', face: 'selfie', soc: 'socials', gst: 'gstin', cin: 'cin', per: 'person', mail: 'email', bill: 'billing' };
  const preset = new Set(c.filter(x => x.ok !== 'ok').map(x => KEY[x.k] || x.k));
  const first = v.kind === 'brand' ? (v.person.name ? v.person.name.split(' ')[0] : 'there') : v.name.split(' ')[0];
  const compose = keys => `Hi ${first}, thanks for sending your details. To finish ${v.kind === 'brand' ? 'verifying ' + (v.business.legal || v.name) : 'your verification'}, please share:\n${ITEMS.filter(i => keys.includes(i[0])).map(i => '• ' + i[1]).join('\n')}\nYou can upload these from the same verification page. We will review within ${SLA_H[v.kind]} hours of your reply. – Linkloom Trust team`;
  const under18 = v.kind === 'creator' && v.id_doc.dob && L.ageFrom(v.id_doc.dob) < 18;

  const decide = a => () => {
    const sum = <ul className="adm-sum">{c.map(x => <li className={`is-${x.ok}`} key={x.k}><Icon n={sigIcon(x.ok)} /><b>{x.n}</b><span>{x.t}</span></li>)}</ul>;
    if (a === 'approve') confirm({
      title: `Approve ${v.name}`, cta: 'Approve and notify', done: `${v.name} approved · logged to audit`,
      lead: v.kind === 'creator' ? `${first} can bid and get paid once approved. Brands see a verified tick; KYC details stay private.` : `${v.name} can post campaigns and fund escrow once approved.`,
      summary: sum, noteLabel: 'Note for the log', placeholder: 'For example: all documents match', note: c.every(x => x.ok === 'ok') ? (v.kind === 'creator' ? 'ID, PAN, payout and socials match' : 'GSTIN active, PAN and CIN match, mail verified') : '',
      onConfirm: ({ note }) => act.approveVerification(v.id, note).then(after)
    });
    else if (a === 'reject') confirm({
      title: `Reject ${v.name}`, cta: 'Reject request', danger: true, done: 'Request rejected · logged to audit',
      lead: `${first} is told the reason and can apply again${under18 ? ' after turning 18' : ' with new documents'}. Nothing is deleted.`,
      reasons: v.kind === 'creator' ? ['Under 18', 'Payout account is not theirs', 'Documents do not match', 'Edited or fake document', 'Duplicate account'] : ['No business details', 'GSTIN inactive or not theirs', 'Not a real business', 'Suspected scam'],
      preset: under18 ? 'Under 18' : v.kind === 'brand' && !v.business.gstin && !v.business.legal ? 'No business details' : null,
      noteLabel: 'Note for the log', summary: sum,
      onConfirm: ({ reason, note }) => act.rejectVerification(v.id, reason === 'Other' ? note : reason, reason === 'Other' ? '' : note).then(after)
    });
    else if (a === 'info') {
      const keys = () => [...document.querySelectorAll('.adm-items input:checked')].map(i => i.value);
      confirm({
        title: `Ask ${first} for more`, cta: 'Send request', done: 'Request sent · logged to audit',
        lead: 'Pick what is missing. The message below is what they get by email and in the app; edit it if you like.',
        extra: <fieldset className="adm-fs"><legend className="t-label">What to send</legend><div className="adm-items">{ITEMS.map(([k, t]) => <label className="check" key={k}><input type="checkbox" value={k} defaultChecked={preset.has(k)} /><span>{t}</span></label>)}</div></fieldset>,
        noteLabel: 'Message', placeholder: 'Message to the applicant', note: compose([...preset]),
        /* the message follows the ticked items until the admin edits it by hand */
        mount(body) { let touched = false; const ta = body.querySelector('textarea'); ta.rows = 8; ta.addEventListener('input', () => { touched = true; });
          body.querySelectorAll('.adm-items input').forEach(i => i.addEventListener('change', () => { if (!touched) ta.value = compose(keys()); })); },
        validate: () => keys().length ? '' : 'Pick at least one thing to ask for.',
        onConfirm: ({ note }) => act.requestInfo(v.id, keys(), note).then(after)
      });
    }
  };

  return (
    <div className="view-in vfy vfy-d" ref={root}>
      <a className="btn-q vfy-back" href="#verify"><Icon n="back" />Verification desk</a>
      <header className="vfy-mast">
        <Av kind={v.kind} name={v.name} cls="vfy-av" />
        <div className="vfy-mast-t">
          <p className="vfy-mast-k"><Kind k={v.kind} /><span>{v.kind === 'brand' ? 'Brand verification' : 'Creator KYC'}</span>{acc && !acc.stub ? <a className="btn-q" href={`#${v.kind}-${acc.id}`}>View account</a> : <span>{v.email}</span>}</p>
          <h1 className="t-h1">{v.name}</h1>
          <p className="muted num">{v.submitted ? `Sent ${L.fmtDate(v.submitted)}, ${L.ago(v.submitted)}${v.note ? ' · ' + v.note : ''}` : v.note}</p>
        </div>
        <div className="vfy-mast-s">{pending ? <span className={`pill ${sl.cls}`}><Icon n={sl.ic} />{sl.t}</span> : <Pill st={v.status} />}
          <p className="vfy-score"><b className="t-money num">{clear}</b><span>{`of ${c.length} checks clear`}</span></p></div>
      </header>
      {st.err ? <p className="vfy-note" role="status">{`Showing the queue copy: the full request did not load (${st.err}).`}</p> : null}
      {!pending ? <div className={`vfy-result is-${v.status}`} role="status"><span className="vfy-result-i"><Icon n={v.status === 'approved' ? 'check' : v.status === 'rejected' ? 'alert' : 'send'} /></span>
        <div><p className="t-h3">{v.status === 'approved' ? 'Approved' : v.status === 'rejected' ? 'Rejected' : 'Waiting on the applicant'}</p><p className="muted">{[v.decision, [v.decidedBy, L.ago(v.decidedAt)].filter(Boolean).join(', ')].filter(Boolean).join(' · ') + '. Logged to audit.'}</p></div>
        {next ? <Lq as="a" className="lq-p lq-sm" href={`#verify-${next.id}`}>{`Next: ${next.name}`}</Lq> : <Lq as="a" className="lq-s lq-sm" href="#verify">Back to the desk</Lq>}</div> : null}
      {pr.length ? <section className="vfy-probs" aria-label="Needs your attention">{pr.map((x, i) => <div className={'vfy-prob' + (x.block ? ' is-block' : '')} key={i}><span className="vfy-prob-i"><Icon n={x.block ? 'alert' : 'info'} /></span><div><p className="vfy-prob-h">{x.h}</p><p>{x.d}</p></div></div>)}</section> : null}
      {c.length ? <ul className="vfy-sigs vfy-sigs--lg" aria-label="Checks">{c.map(x => <li className={`vfy-sig is-${x.ok}`} key={x.k}><span className="vfy-sig-i"><Icon n={sigIcon(x.ok)} /></span><span className="vfy-sig-t"><b>{x.n}</b><span>{x.t}</span></span></li>)}</ul> : null}
      <div className="vfy-cards">{v.kind === 'creator' ? <CreatorBody v={v} /> : <BrandBody v={v} />}</div>
      {pending ? <div className="vfy-dock" role="region" aria-label="Decision">
        <p className="vfy-dock-t">{block ? <><Icon n="alert" /><span>{`Approve is off: ${pr.find(x => x.block).h.toLowerCase()}.`}</span></> : <><Icon n="shield" /><span>Your decision is logged and the applicant is told.</span></>}</p>
        <div className="vfy-dock-b">
          <Lq className="lq-s lq-sm" data-act="reject" onClick={decide('reject')}><Icon n="close" className="ic" />Reject</Lq>
          <Lq className="lq-s lq-sm" data-act="info" onClick={decide('info')}><Icon n="chat" className="ic" />Ask for more info</Lq>
          <Lq className="lq-p lq-sm" data-act="approve" onClick={decide('approve')} disabled={block} aria-disabled={block ? 'true' : undefined}><Icon n="check" className="ic" />Approve</Lq>
        </div></div> : null}
    </div>
  );
}

const Verify = ({ param }) => (param ? <Detail id={param} /> : <Queue />);

L.register('verify', {
  title: id => { if (!id) return 'Verification'; const v = S().verifications.find(x => x.id === id); return v ? v.name + ' · Verification' : 'Verification'; },
  nav: 'verify',
  Component: needs(['verifications'], Verify, ['creators', 'brands', 'counts'])
});
