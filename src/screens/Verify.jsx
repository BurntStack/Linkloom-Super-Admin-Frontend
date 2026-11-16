/* Verification desk (#verify, #verify-<id>).
   Creator KYC (ID, PAN, payout, selfie, socials) and brand verification (GSTIN, company PAN, CIN, authorised person, billing) in one queue.
   Decisions: Approve / Reject (reason) / Ask for more info (items + message). Every decision opens a sheet, states it is logged, calls L.audit.
   Classes are .vfy-* (and .adm-* for the confirm sheet in lib/adm.jsx). */
import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import L, { data } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import { confirm, nameMatch, mask, freeMail, gstState, Av } from '../lib/adm.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';

const S = () => data;
const ui = () => { const s = S(); s.ui = s.ui || {}; return (s.ui.verify = s.ui.verify || { tab: 'all' }); };

/* ---------- data guard: the ID check is the source of truth for age. v3 is flagged under 18, so its DOB must read under 18 too. ---------- */
S().verifications.forEach(v => { if (v.id_doc && v.id_doc.match === 'under18' && L.ageFrom(v.id_doc.dob) >= 18) { const d = v.id_doc.dob.split('-'); d[0] = String(L.today().getFullYear() - 17 - (+d[1] > L.today().getMonth() + 1 ? 1 : 0)); v.id_doc.dob = d.join('-'); } });

/* ---------- checks: one list per request, used by the queue row, the summary and the problem band ---------- */
const SLA_H = { creator: 24, brand: 48 };
const ageH = v => (L.today() - L.D(v.submitted)) / 36e5;
const sla = v => {
  const left = SLA_H[v.kind] - ageH(v), h = Math.abs(left);
  const t = h < 1 ? Math.round(h * 60) + ' min' : Math.round(h) + ' h';
  return left < 0 ? { k: 'over', t: 'Over SLA by ' + t, cls: 'pill-err', ic: 'alert' } : left < 6 ? { k: 'soon', t: 'Due in ' + t, cls: 'pill-warn', ic: 'clock' } : { k: 'ok', t: 'Due in ' + t, cls: 'pill-paper', ic: 'clock' };
};
function checks(v) {
  const out = [];
  if (v.kind === 'creator') {
    const d = v.id_doc, age = L.ageFrom(d.dob);
    out.push({ k: 'id', n: 'ID', ok: d.match === 'ok' && age >= 18 ? 'ok' : 'bad', t: age < 18 ? `Under 18 (age ${age})` : `${d.type} · age ${age}` });
    const pm = nameMatch(d.name, v.pan.name);
    out.push({ k: 'pan', n: 'PAN', ok: v.pan.match === 'ok' && pm.k === 'ok' ? 'ok' : pm.k === 'close' ? 'warn' : 'bad', t: pm.t });
    const bm = nameMatch(d.name, v.bank.holder);
    out.push({ k: 'bank', n: v.bank.kind === 'UPI' ? 'UPI' : 'Bank', ok: v.bank.match === 'ok' ? 'ok' : bm.k === 'close' ? 'warn' : 'bad', t: v.bank.match === 'ok' ? 'Holder matches' : bm.t });
    out.push({ k: 'face', n: 'Selfie', ok: v.selfie.liveness === 'passed' && v.selfie.faceMatch >= 85 ? 'ok' : 'bad', t: `Live · ${v.selfie.faceMatch}% face match` });
    const unl = v.socials.filter(x => !x.linked);
    out.push({ k: 'soc', n: 'Socials', ok: unl.length ? 'warn' : 'ok', t: unl.length ? `${unl.length} not linked by login` : `${v.socials.length} linked by login` });
  } else {
    const b = v.business, p = v.person;
    out.push({ k: 'gst', n: 'GSTIN', ok: b.gstin && b.gstinStatus === 'Active' ? 'ok' : 'bad', t: b.gstin ? `${b.gstinStatus} · ${gstState(b.gstin)}` : 'Not provided' });
    out.push({ k: 'pan', n: 'Company PAN', ok: b.pan && b.panFromGstin && b.gstin.slice(2, 12) === b.pan ? 'ok' : 'bad', t: b.pan ? 'Matches the GSTIN' : 'Not provided' });
    out.push({ k: 'cin', n: 'CIN', ok: b.cin ? 'ok' : 'warn', t: b.cin ? 'Registered company' : 'Not provided' });
    out.push({ k: 'per', n: 'Authorised person', ok: p.name && p.name !== '—' ? 'ok' : 'bad', t: p.name && p.name !== '—' ? `${p.name}, ${p.designation}` : 'Not named' });
    out.push({ k: 'mail', n: 'Business mail', ok: p.mailVerified && !freeMail(p.mail) ? 'ok' : 'bad', t: freeMail(p.mail) ? 'Free mail, not a company domain' : p.mailVerified ? 'Verified' : 'Not verified' });
    out.push({ k: 'bill', n: 'Billing', ok: v.billing.address ? 'ok' : 'warn', t: v.billing.address ? 'Address on file' : 'Missing' });
  }
  return out;
}
/* problem band: what blocks approval, in words an admin can act on */
function problems(v) {
  const p = [];
  if (v.kind === 'creator') {
    const age = L.ageFrom(v.id_doc.dob);
    if (age < 18) p.push({ block: true, h: `Under 18: ${v.name.split(' ')[0]} is ${age}`, d: 'Linkloom accounts are 18+. This cannot be approved. Reject it and say they can apply again after their 18th birthday.' });
    if (v.bank.match !== 'ok') { const bm = nameMatch(v.id_doc.name, v.bank.holder); p.push({ block: bm.k === 'bad', h: bm.k === 'close' ? 'Payout holder name is close, not exact' : 'Payout account belongs to someone else', d: bm.k === 'close' ? `The account is in the name “${v.bank.holder}”; the ID reads “${v.id_doc.name}”. ${v.note || ''}${v.note ? '. ' : ''}Usually fine; ask for a bank letter if unsure.` : `The ${v.bank.kind === 'UPI' ? 'UPI ID' : 'account'} is held by “${v.bank.holder}”. Payouts must go to the creator’s own account.` }); }
    if (v.socials.some(x => !x.linked)) p.push({ block: false, h: 'Instagram not linked by login', d: 'Follower numbers are self-reported until they connect the account.' });
  } else {
    if (!v.business.gstin && !v.business.legal) p.push({ block: true, h: 'No business details at all', d: 'No legal name, GSTIN, PAN or CIN, and no named person. Ask for them, or reject if the account looks like a scam.' });
    if (freeMail(v.person.mail) || !v.person.mailVerified) p.push({ block: true, h: 'Business mail is not a company address', d: `${v.person.mail} is a free mailbox and is not verified.` });
    const acc = v.account && L.brand(v.account);
    if (acc && acc.reports) p.push({ block: false, h: `${acc.reports} open reports on this brand`, d: `Its campaigns are reported in moderation. Posted ${acc.postsLast30} campaigns since joining on ${L.fmtDate(acc.joined)}.`, go: '#brand-' + acc.id });
  }
  return p;
}

const STATUS = { pending: ['pill-info', 'clock', 'Waiting'], approved: ['pill-ok', 'check', 'Approved'], rejected: ['pill-err', 'alert', 'Rejected'], info_requested: ['pill-warn', 'send', 'More info asked'] };
const Pill = ({ st }) => { const m = STATUS[st] || STATUS.pending; return <span className={`pill ${m[0]}`}><Icon n={m[1]} />{m[2]}</span>; };
const Kind = ({ k }) => <span className={`vfy-kind vfy-kind--${k}`}><i className="dot"></i>{k === 'brand' ? 'Brand' : 'Creator'}</span>;
const sigIcon = ok => (ok === 'ok' ? 'check' : ok === 'warn' ? 'info' : 'alert');
const Sig = ({ c }) => <li className={`vfy-sig is-${c.ok}`} title={c.n + ': ' + c.t}><span className="vfy-sig-i"><Icon n={sigIcon(c.ok)} /></span><span className="vfy-sig-n">{c.n}</span><span className="sr-only">{': ' + c.t}</span></li>;
const bySla = (a, b) => (SLA_H[a.kind] - ageH(a)) - (SLA_H[b.kind] - ageH(b));

/* ---------- queue ---------- */
function Row({ v }) {
  const c = checks(v), sl = sla(v), bad = c.filter(x => x.ok === 'bad').length, pr = problems(v).filter(x => x.block);
  return (
    <li className={'vfy-row' + (v.status !== 'pending' ? ' is-done' : '')} data-kind={v.kind}>
      <a className="vfy-row-a" href={`#verify-${v.id}`} aria-label={`${v.name}, ${v.kind}. ${v.status === 'pending' ? sl.t : STATUS[v.status][2]}. Open`}>
        <Av kind={v.kind} name={v.name} />
        <span className="vfy-row-id"><b>{v.name}</b><span><Kind k={v.kind} /><span className="num">{`Sent ${L.ago(v.submitted)}`}</span></span></span>
        <ul className="vfy-sigs" aria-label="Checks">{c.map(x => <Sig c={x} key={x.k} />)}</ul>
        <span className="vfy-row-flag">{v.status !== 'pending' ? <Pill st={v.status} /> : pr.length ? <span className="vfy-flag"><Icon n="alert" />{pr[0].h.replace(/:.*/, '')}</span> : bad ? <span className="vfy-flag"><Icon n="alert" />{`${bad} check${bad > 1 ? 's' : ''} failed`}</span> : <span className="vfy-clear"><Icon n="check" />All checks clear</span>}</span>
        <span className="vfy-row-sla">{v.status === 'pending' ? <span className={`pill ${sl.cls}`}><Icon n={sl.ic} />{sl.t}</span> : <span className="t-cap muted">{`${v.decidedBy || ''} · ${L.ago(v.decidedAt)}`}</span>}</span>
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
          <p className="muted">Creators within 24 hours, brands within 48. Oldest first by time left.{over ? <> <b className="vfy-over">{`${over} over SLA.`}</b></> : null} <span className="sample">Sample data</span></p></div>
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

function CreatorBody({ v }) {
  const d = v.id_doc, age = L.ageFrom(d.dob), pm = nameMatch(d.name, v.pan.name), bm = nameMatch(d.name, v.bank.holder);
  const acc = v.account && L.creator(v.account);
  return (
    <>
      <section className="vfy-card" aria-labelledby="vfyId"><header><span className="vfy-ci"><Icon n="user" /></span><h2 className="t-h3" id="vfyId">Identity</h2></header>
        <Kvs rows={[['Document', d.type], ['Number', <Mono t={d.masked} />], ['Name on ID', d.name],
          ['Date of birth', L.fmtDate(d.dob, { year: true }), age >= 18 ? ok(`Age ${age}`) : bad(`Age ${age}, under 18`)]]} /></section>
      <section className="vfy-card" aria-labelledby="vfyPan"><header><span className="vfy-ci"><Icon n="file" /></span><h2 className="t-h3" id="vfyPan">PAN and payout</h2></header>
        <Kvs rows={[['PAN', <Mono t={v.pan.masked} />], ['Name on PAN', v.pan.name, pm.k === 'ok' ? ok('Matches ID') : pm.k === 'close' ? warn(pm.t) : bad(pm.t)],
          [v.bank.kind === 'UPI' ? 'UPI ID' : 'Bank account', <Mono t={v.bank.masked} />],
          ['Account holder', v.bank.holder, v.bank.match === 'ok' ? ok('Matches ID') : bm.k === 'close' ? warn(bm.t) : bad(bm.t)]]} />
        <p className="vfy-note">Penny-drop check returned the holder name above. Full numbers stay encrypted; only the last digits are shown.</p></section>
      <section className="vfy-card" aria-labelledby="vfySelf"><header><span className="vfy-ci"><Icon n="camera" /></span><h2 className="t-h3" id="vfySelf">Selfie</h2></header>
        <Kvs rows={[['Liveness', v.selfie.liveness === 'passed' ? 'Passed, blink and turn' : v.selfie.liveness, v.selfie.liveness === 'passed' ? ok('Live') : bad('Failed')]]} />
        <div className="vfy-face"><div className="vfy-face-h"><span>Face match with ID photo</span><b className="t-money num">{`${v.selfie.faceMatch}%`}</b></div>
          <div className="vfy-bar" role="img" aria-label={`Face match ${v.selfie.faceMatch} percent; 85 percent needed`}><i style={{ width: v.selfie.faceMatch + '%' }}></i><s style={{ left: '85%' }}></s></div>
          <p className="t-cap muted">85% needed. The selfie itself is never shown here or to brands.</p></div></section>
      <section className="vfy-card" aria-labelledby="vfySoc"><header><span className="vfy-ci"><Icon n="link" /></span><h2 className="t-h3" id="vfySoc">Social accounts</h2></header>
        <ul className="vfy-socs">{v.socials.map(x => <li key={x.p + x.handle}><span className="vfy-soc-ic"><Icon n={x.p === 'youtube' ? 'yt' : 'ig'} /></span>
          <span className="vfy-soc-t"><b>{x.handle}</b><span>{`${x.p === 'youtube' ? 'YouTube' : 'Instagram'} · ${x.age} old`}</span></span>
          <span className="vfy-soc-n"><b className="t-money">{L.compact(x.followers)}</b><span>{x.p === 'youtube' ? 'subscribers' : 'followers'}</span></span>
          {x.linked ? <span className="pill pill-ok"><Icon n="check" />Linked</span> : <span className="pill pill-err"><Icon n="alert" />Not linked</span>}</li>)}</ul>
        {acc && acc.followers ? <p className="vfy-note">{`On Linkloom since ${L.fmtDate(acc.joined, { year: true })}: ${L.compact(acc.followers)} followers, ${acc.jobs} jobs, rated ${acc.rating}. `}<a className="btn-q" href={`#creator-${acc.id}`}>Account</a></p> : null}</section>
    </>
  );
}
function BrandBody({ v }) {
  const b = v.business, p = v.person, g = b.gstin, cin = b.cin;
  const cinT = cin ? `${cin[0] === 'U' ? 'Unlisted' : 'Listed'} · ${cin.slice(12, 15) === 'PTC' ? 'private limited' : 'company'} · incorporated ${cin.slice(8, 12)}` : '';
  const dom = (p.mail || '').split('@')[1] || '', bdom = (v.billing.email || '').split('@')[1] || '';
  return (
    <>
      <section className="vfy-card" aria-labelledby="vfyBiz"><header><span className="vfy-ci"><Icon n="brief" /></span><h2 className="t-h3" id="vfyBiz">Business</h2></header>
        <Kvs rows={[['Legal name', b.legal ? b.legal : <None />],
          ['GSTIN', g ? <Mono t={g} /> : <None />, g ? (b.gstinStatus === 'Active' ? ok(`Active on the GST portal · ${gstState(g)}`) : bad(b.gstinStatus)) : bad('Missing')],
          ['Company PAN', b.pan ? <Mono t={mask(b.pan)} /> : <None />, b.pan ? (b.panFromGstin && g.slice(2, 12) === b.pan ? ok('Same as characters 3 to 12 of the GSTIN') : bad('Does not match the GSTIN')) : bad('Missing')],
          ['CIN', cin ? <Mono t={cin} /> : <None />, cin ? ok(cinT) : warn('Needed for companies; LLPs give an LLPIN')]]} /></section>
      <section className="vfy-card" aria-labelledby="vfyPer"><header><span className="vfy-ci"><Icon n="user" /></span><h2 className="t-h3" id="vfyPer">Authorised person</h2></header>
        <Kvs rows={[['Name', p.name && p.name !== '—' ? p.name : <None t="Not named" />], ['Designation', p.designation && p.designation !== '—' ? p.designation : <None t="—" />],
          ['Business mail', p.mail, freeMail(p.mail) ? bad('Free mailbox') : p.mailVerified ? ok('Verified by link') : bad('Not verified')]]} /></section>
      <section className="vfy-card" aria-labelledby="vfyBill"><header><span className="vfy-ci"><Icon n="wallet" /></span><h2 className="t-h3" id="vfyBill">Billing</h2></header>
        <Kvs rows={[['Address', v.billing.address ? v.billing.address : <None />],
          ['Invoices to', v.billing.email ? v.billing.email : <None />, v.billing.email ? (bdom === dom ? ok('Same domain as the person') : warn('Different domain')) : null]]} />
        <p className="vfy-note">Brands pay the agreed price into escrow. No platform fee; GST on invoices as per confirmed rules.</p></section>
    </>
  );
}

function Detail({ id }) {
  const root = useRef(null);
  const s = S(), v = s.verifications.find(x => x.id === id);
  useLayoutEffect(() => {
    if (!v) return;
    mo('stagger', [...root.current.querySelectorAll('.vfy-card,.vfy-sigs--lg>li')]);
    const res = root.current.querySelector('.vfy-result-i'); if (res && v.status === 'approved' && v._fresh) { mo('check', res); v._fresh = false; }
  }, []);
  if (!v) return <div className="view-in"><div className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h2">No request with that link.</p><p className="muted">It may have been withdrawn by the applicant.</p><Lq className="lq-p" data-go="#verify">Back to the desk</Lq></div></div>;

  const c = checks(v), pr = problems(v), block = pr.some(x => x.block), sl = sla(v), pending = v.status === 'pending';
  const clear = c.filter(x => x.ok === 'ok').length;
  const next = s.verifications.filter(x => x.status === 'pending' && x.id !== v.id).sort(bySla)[0];
  const acc = v.account ? (v.kind === 'brand' ? L.brand(v.account) : L.creator(v.account)) : null;

  const target = `${v.name} (${v.account || v.id})`;
  const decide = (status, action, detailTxt) => {
    L.store.set(st => {
      const x = st.verifications.find(y => y.id === v.id);
      Object.assign(x, { status, decision: detailTxt, decidedAt: new Date(L.today().getTime() + st.audit.length * 1000).toISOString(), decidedBy: st.me.name, _fresh: true });
      if (x.account) {
        if (x.kind === 'creator') { const a = st.creators.find(y => y.id === x.account); if (a) a.kyc = status === 'approved' ? 'verified' : status === 'rejected' ? 'rejected' : 'action_needed'; }
        else { const a = st.brands.find(y => y.id === x.account); if (a) { a.verify = status === 'approved' ? 'verified' : status === 'rejected' ? 'rejected' : 'action_needed'; if (status === 'approved') a.regVerified = true; } }
      }
    }, 'verify');
    L.audit(action, target, detailTxt);
    L.route();
  };

  const ITEMS = v.kind === 'creator'
    ? [['id', 'A clearer photo of the ID, both sides'], ['pan', 'PAN card photo'], ['bank', 'Payout account in their own name (bank letter or cancelled cheque)'], ['selfie', 'A new selfie in good light'], ['soc', 'Connect Instagram or YouTube by login']]
    : [['gst', 'GSTIN and the GST registration certificate'], ['pan', 'Company PAN'], ['cin', 'Certificate of incorporation (CIN or LLPIN)'], ['per', 'Name and designation of the authorised person, with a board or partner letter'], ['mail', 'A work email on the company domain'], ['bill', 'Billing address and accounts email']];
  const preset = new Set(c.filter(x => x.ok !== 'ok').map(x => ({ id: 'id', pan: 'pan', bank: 'bank', face: 'selfie', soc: 'soc', gst: 'gst', cin: 'cin', per: 'per', mail: 'mail', bill: 'bill' }[x.k])));
  const first = v.kind === 'brand' ? (v.person.name && v.person.name !== '—' ? v.person.name.split(' ')[0] : 'there') : v.name.split(' ')[0];
  const compose = keys => `Hi ${first}, thanks for sending your details. To finish ${v.kind === 'brand' ? 'verifying ' + (v.business.legal || v.name) : 'your verification'}, please share:\n${ITEMS.filter(i => keys.includes(i[0])).map(i => '• ' + i[1]).join('\n')}\nYou can upload these from the same verification page. We will review within ${SLA_H[v.kind]} hours of your reply. – Linkloom Trust team`;

  const act = a => () => {
    const sum = <ul className="adm-sum">{c.map(x => <li className={`is-${x.ok}`} key={x.k}><Icon n={sigIcon(x.ok)} /><b>{x.n}</b><span>{x.t}</span></li>)}</ul>;
    if (a === 'approve') confirm({
      title: `Approve ${v.name}`, cta: 'Approve and notify',
      lead: v.kind === 'creator' ? `${first} can bid and get paid once approved. Brands see a verified tick; KYC details stay private.` : `${v.name} can post campaigns and fund escrow once approved.`,
      summary: sum, noteLabel: 'Note for the log', placeholder: 'For example: all documents match', note: c.every(x => x.ok === 'ok') ? (v.kind === 'creator' ? 'ID, PAN, payout and socials match' : 'GSTIN active, PAN and CIN match, mail verified') : '',
      onConfirm: ({ note }) => { decide('approved', 'verification.approve', note); }
    });
    else if (a === 'reject') confirm({
      title: `Reject ${v.name}`, cta: 'Reject request', danger: true,
      lead: `${first} is told the reason and can apply again${v.kind === 'creator' && L.ageFrom(v.id_doc.dob) < 18 ? ' after turning 18' : ' with new documents'}. Nothing is deleted.`,
      reasons: v.kind === 'creator' ? ['Under 18', 'Payout account is not theirs', 'Documents do not match', 'Edited or fake document', 'Duplicate account'] : ['No business details', 'GSTIN inactive or not theirs', 'Not a real business', 'Suspected scam'],
      preset: v.kind === 'creator' && L.ageFrom(v.id_doc.dob) < 18 ? 'Under 18' : !v.business || v.business.gstin ? null : 'No business details',
      noteLabel: 'Note for the log', summary: sum,
      onConfirm: ({ reason, note }) => { decide('rejected', 'verification.reject', reason === 'Other' ? note : reason + (note ? ': ' + note : '')); }
    });
    else if (a === 'info') {
      const keys = () => [...document.querySelectorAll('.adm-items input:checked')].map(i => i.value);
      confirm({
        title: `Ask ${first} for more`, cta: 'Send request',
        lead: 'Pick what is missing. The message below is what they get by email and in the app; edit it if you like.',
        extra: <fieldset className="adm-fs"><legend className="t-label">What to send</legend><div className="adm-items">{ITEMS.map(([k, t]) => <label className="check" key={k}><input type="checkbox" value={k} defaultChecked={preset.has(k)} /><span>{t}</span></label>)}</div></fieldset>,
        noteLabel: 'Message', placeholder: 'Message to the applicant', note: compose([...preset]),
        /* the message follows the ticked items until the admin edits it by hand */
        mount(body) { let touched = false; const ta = body.querySelector('textarea'); ta.rows = 8; ta.addEventListener('input', () => { touched = true; });
          body.querySelectorAll('.adm-items input').forEach(i => i.addEventListener('change', () => { if (!touched) ta.value = compose(keys()); })); },
        validate: () => keys().length ? '' : 'Pick at least one thing to ask for.',
        onConfirm: () => { const k = keys(); decide('info_requested', 'verification.request_info', 'Asked for: ' + ITEMS.filter(i => k.includes(i[0])).map(i => i[1].split(' (')[0].split(',')[0]).join('; ')); }
      });
    }
  };

  return (
    <div className="view-in vfy vfy-d" ref={root}>
      <a className="btn-q vfy-back" href="#verify"><Icon n="back" />Verification desk</a>
      <header className="vfy-mast">
        <Av kind={v.kind} name={v.name} cls="vfy-av" />
        <div className="vfy-mast-t">
          <p className="vfy-mast-k"><Kind k={v.kind} /><span>{v.kind === 'brand' ? 'Brand verification' : 'Creator KYC'}</span>{acc ? <a className="btn-q" href={`#${v.kind}-${acc.id}`}>View account</a> : <span>No account yet</span>}</p>
          <h1 className="t-h1">{v.name}</h1>
          <p className="muted num">{`Sent ${L.fmtDate(v.submitted)}, ${L.ago(v.submitted)}${v.note ? ' · ' + v.note : ''} `}<span className="sample">Sample</span></p>
        </div>
        <div className="vfy-mast-s">{pending ? <span className={`pill ${sl.cls}`}><Icon n={sl.ic} />{sl.t}</span> : <Pill st={v.status} />}
          <p className="vfy-score"><b className="t-money num">{clear}</b><span>{`of ${c.length} checks clear`}</span></p></div>
      </header>
      {!pending ? <div className={`vfy-result is-${v.status}`} role="status"><span className="vfy-result-i"><Icon n={v.status === 'approved' ? 'check' : v.status === 'rejected' ? 'alert' : 'send'} /></span>
        <div><p className="t-h3">{v.status === 'approved' ? 'Approved' : v.status === 'rejected' ? 'Rejected' : 'Waiting on the applicant'}</p><p className="muted">{`${v.decision || ''} · ${v.decidedBy}, ${L.ago(v.decidedAt)}. Logged to audit.`}</p></div>
        {next ? <Lq as="a" className="lq-p lq-sm" href={`#verify-${next.id}`}>{`Next: ${next.name}`}</Lq> : <Lq as="a" className="lq-s lq-sm" href="#verify">Back to the desk</Lq>}</div> : null}
      {pr.length ? <section className="vfy-probs" aria-label="Needs your attention">{pr.map((x, i) => <div className={'vfy-prob' + (x.block ? ' is-block' : '')} key={i}><span className="vfy-prob-i"><Icon n={x.block ? 'alert' : 'info'} /></span><div><p className="vfy-prob-h">{x.h}</p><p>{x.d}{x.go ? <> <a className="btn-q" href={x.go}>Open brand</a></> : null}</p></div></div>)}</section> : null}
      <ul className="vfy-sigs vfy-sigs--lg" aria-label="Checks">{c.map(x => <li className={`vfy-sig is-${x.ok}`} key={x.k}><span className="vfy-sig-i"><Icon n={sigIcon(x.ok)} /></span><span className="vfy-sig-t"><b>{x.n}</b><span>{x.t}</span></span></li>)}</ul>
      <div className="vfy-cards">{v.kind === 'creator' ? <CreatorBody v={v} /> : <BrandBody v={v} />}</div>
      {pending ? <div className="vfy-dock" role="region" aria-label="Decision">
        <p className="vfy-dock-t">{block ? <><Icon n="alert" /><span>{`Approve is off: ${pr.find(x => x.block).h.replace(/:.*/, '').toLowerCase()}.`}</span></> : <><Icon n="shield" /><span>Your decision is logged and the applicant is told by SMS and email.</span></>}</p>
        <div className="vfy-dock-b">
          <Lq className="lq-s lq-sm" data-act="reject" onClick={act('reject')}><Icon n="close" className="ic" />Reject</Lq>
          <Lq className="lq-s lq-sm" data-act="info" onClick={act('info')}><Icon n="chat" className="ic" />Ask for more info</Lq>
          <Lq className="lq-p lq-sm" data-act="approve" onClick={act('approve')} disabled={block} aria-disabled={block ? 'true' : undefined}><Icon n="check" className="ic" />Approve</Lq>
        </div></div> : null}
    </div>
  );
}

const Verify = ({ param }) => (param ? <Detail id={param} /> : <Queue />);

L.register('verify', {
  title: id => { if (!id) return 'Verification'; const v = S().verifications.find(x => x.id === id); return v ? v.name + ' · Verification' : 'Verification'; },
  nav: 'verify',
  Component: Verify
});
