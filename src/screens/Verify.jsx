/* Verification desk (#verify, #verify-<id>), as designed (artifact screens/verify.js).
   Creator KYC (ID, PAN, payout, selfie, socials) and brand verification (GSTIN, company PAN, CIN, authorised person,
   billing) in one queue, ordered by time left on the SLA (creators 24 h, brands 48 h). Decisions: Approve / Reject (reason)
   / Ask for more info (items + message), each through the confirm sheet.
   - GET  /v1/admin/verifications/?status=pending|decided&kind=     queue (meta.counts for the tabs)
   - GET  /v1/admin/verifications/<id>/                             detail, masked values, signed document links, `checks`
   - POST /v1/admin/verifications/<id>/approve/       { note }      409 VERIFICATION_BLOCKED while a check blocks
   - POST /v1/admin/verifications/<id>/reject/        { reason, note }
   - POST /v1/admin/verifications/<id>/request-info/  { items: [...], message }
   Classes are .vfy-* (and .adm-*). */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import L, { data } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import { api, can, num, pick, str } from '../lib/admin.js';
import { refreshCounts } from '../lib/live.js';
import { toVerification, toCreator, toBrand, fieldsOf } from '../lib/model.js';
import Av, { photoOf, mediaUrl } from '../components/Av.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { confirm } from '../components/Confirm.jsx';
import { useLoad, Failed, Loading, RoleNote, errText } from '../components/Admin.jsx';

const ui = () => (data.ui.verify = data.ui.verify || { tab: 'all' });

/* ---------- the design's admin kit: name match, masks, mail and GSTIN helpers ---------- */
const norm = n => String(n || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean);
export function nameMatch(a, b) {
  const x = norm(a), y = norm(b);
  if (!x.length || !y.length) return { k: 'none', t: 'Not provided' };
  if (x.join(' ') === y.join(' ')) return { k: 'ok', t: 'Same as the ID' };
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  if (s.every(t => l.includes(t))) { const extra = l.filter(t => !s.includes(t)); return { k: 'close', t: `Close: adds ${extra.length === 1 && extra[0].length === 1 ? 'a middle initial “' + extra[0] + '”' : '“' + extra.join(' ') + '”'}` }; }
  if (x[x.length - 1] === y[y.length - 1]) return { k: 'bad', t: 'Different person, same surname' };
  return { k: 'bad', t: 'Different name' };
}
export const mask = (v, keepS = 5, keepE = 1) => { v = String(v || ''); return v.length <= keepS + keepE || /•/.test(v) ? v : v.slice(0, keepS) + '••••' + v.slice(-keepE); };
export const mailMask = m => { const [u, d] = String(m || '').split('@'); return d ? u.slice(0, 2) + '•••@' + d : m; };
const FREE = ['gmail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'hotmail.com', 'rediffmail.com', 'proton.me', 'icloud.com'];
export const freeMail = m => FREE.includes((String(m || '').split('@')[1] || '').toLowerCase());
const STATES = { '01': 'Jammu & Kashmir', '03': 'Punjab', '04': 'Chandigarh', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '19': 'West Bengal',
  '21': 'Odisha', '23': 'Madhya Pradesh', '24': 'Gujarat', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '32': 'Kerala', '33': 'Tamil Nadu', '36': 'Telangana', '37': 'Andhra Pradesh' };
export const gstState = g => STATES[String(g || '').slice(0, 2)] || '';
const ageFrom = dob => { const b = new Date(dob); if (!dob || !Number.isFinite(b.getTime())) return null; const t = new Date(); let a = t.getFullYear() - b.getFullYear(); const m = t.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--; return a; };

/* ---------- checks: one list per request (queue row, summary, problem band) ---------- */
const SLA_H = { creator: 24, brand: 48 };
const ageH = v => { const t = Date.parse(v.submitted); return Number.isFinite(t) ? (Date.now() - t) / 36e5 : 0; };
const leftH = v => (v.slaDueAt && Number.isFinite(Date.parse(v.slaDueAt)) ? (Date.parse(v.slaDueAt) - Date.now()) / 36e5 : SLA_H[v.kind] - ageH(v));
const sla = v => {
  const left = leftH(v), h = Math.abs(left), t = h < 1 ? Math.round(h * 60) + ' min' : Math.round(h) + ' h';
  return left < 0 ? { k: 'over', t: 'Over SLA by ' + t, cls: 'pill-err', ic: 'alert' } : left < 6 ? { k: 'soon', t: 'Due in ' + t, cls: 'pill-warn', ic: 'clock' } : { k: 'ok', t: 'Due in ' + t, cls: 'pill-paper', ic: 'clock' };
};
const NOT_SENT = n => ({ k: n.toLowerCase(), n, ok: 'warn', t: 'Not sent by the API' });
function checks(v) {
  const out = [];
  if (v.kind === 'creator') {
    const d = v.id_doc, age = d ? ageFrom(d.dob) : null;
    if (d) out.push({ k: 'id', n: 'ID', ok: (d.match === 'ok' || (!d.match && d.done)) && (age == null || age >= 18) && d.match !== 'under18' ? 'ok' : 'bad', t: age != null && age < 18 || d.match === 'under18' ? `Under 18${age != null ? ` (age ${age})` : ''}` : [d.type, age != null ? `age ${age}` : ''].filter(Boolean).join(' · ') || 'Submitted' });
    else out.push(NOT_SENT('ID'));
    if (v.pan) { const pm = nameMatch(d && d.name, v.pan.name); out.push({ k: 'pan', n: 'PAN', ok: v.pan.match === 'mismatch' || pm.k === 'bad' ? 'bad' : pm.k === 'close' ? 'warn' : 'ok', t: pm.k === 'none' ? (v.pan.done ? 'Submitted' : 'Not provided') : pm.t }); }
    else out.push(NOT_SENT('PAN'));
    if (v.bank) { const bm = nameMatch(d && d.name, v.bank.holder); out.push({ k: 'bank', n: v.bank.kind === 'UPI' ? 'UPI' : 'Bank', ok: v.bank.match === 'ok' ? 'ok' : v.bank.match === 'mismatch' ? (bm.k === 'close' ? 'warn' : 'bad') : bm.k === 'ok' ? 'ok' : bm.k === 'close' ? 'warn' : bm.k === 'none' ? (v.bank.done ? 'ok' : 'warn') : 'bad', t: v.bank.match === 'ok' ? 'Holder matches' : bm.k === 'none' ? (v.bank.done ? 'Submitted' : 'Not provided') : bm.t }); }
    else out.push(NOT_SENT('Bank'));
    if (v.selfie) out.push({ k: 'face', n: 'Selfie', ok: v.selfie.liveness === 'passed' && (v.selfie.faceMatch == null || v.selfie.faceMatch >= 85) ? 'ok' : 'bad', t: `${v.selfie.liveness === 'passed' ? 'Live' : 'Liveness ' + (v.selfie.liveness || 'not run')}${v.selfie.faceMatch != null ? ` · ${v.selfie.faceMatch}% face match` : ''}` });
    else out.push({ k: 'face', n: 'Selfie', ok: 'warn', t: 'Not sent by the API' });
    const unl = v.socials.filter(x => !x.linked);
    out.push({ k: 'soc', n: 'Socials', ok: !v.socials.length ? 'warn' : unl.length ? 'warn' : 'ok', t: !v.socials.length ? 'None sent' : unl.length ? `${unl.length} not linked by login` : `${v.socials.length} linked by login` });
  } else {
    const b = v.business || {}, p = v.person || {}, bill = v.billing || {};
    out.push({ k: 'gst', n: 'GSTIN', ok: b.gstin && /active/i.test(b.gstinStatus || 'active') ? 'ok' : 'bad', t: b.gstin ? [b.gstinStatus || 'Given', gstState(b.gstin)].filter(Boolean).join(' · ') : 'Not provided' });
    out.push({ k: 'pan', n: 'Company PAN', ok: b.pan && (b.panFromGstin || (b.gstin && b.gstin.slice(2, 12) === b.pan)) ? 'ok' : 'bad', t: b.pan ? (b.panFromGstin || (b.gstin && b.gstin.slice(2, 12) === b.pan) ? 'Matches the GSTIN' : 'Does not match the GSTIN') : 'Not provided' });
    out.push({ k: 'cin', n: 'CIN', ok: b.cin ? 'ok' : 'warn', t: b.cin ? 'Registered company' : 'Not provided' });
    out.push({ k: 'per', n: 'Authorised person', ok: p.name && p.name !== '—' ? 'ok' : 'bad', t: p.name && p.name !== '—' ? [p.name, p.designation].filter(Boolean).join(', ') : 'Not named' });
    const mail = p.mail || v.email;
    out.push({ k: 'mail', n: 'Business mail', ok: mail && p.mailVerified !== false && !freeMail(mail) ? 'ok' : 'bad', t: freeMail(mail) ? 'Free mail, not a company domain' : p.mailVerified ? 'Verified' : p.mailVerified === false ? 'Not verified' : mail ? 'Given' : 'Not provided' });
    out.push({ k: 'bill', n: 'Billing', ok: bill.address ? 'ok' : 'warn', t: bill.address ? 'Address on file' : 'Missing' });
  }
  /* the backend's own automated checks that block approval */
  v.checks.forEach((c, i) => { const s = str(pick(c.status, c.result)).toLowerCase(); if (c.blocking && !/pass|ok|match|clear/.test(s)) out.push({ k: 'api' + i, n: str(pick(c.label, c.name, c.key, 'Check')), ok: 'bad', t: str(pick(c.message, c.detail, 'Blocks approval')), api: true }); });
  return out;
}
/* problem band: what blocks approval, in words an admin can act on */
function problems(v) {
  const p = [];
  if (v.kind === 'creator') {
    const d = v.id_doc || {}, age = ageFrom(d.dob);
    if ((age != null && age < 18) || d.match === 'under18') p.push({ block: true, h: `Under 18: ${v.name.split(' ')[0]} is ${age != null ? age : 'under 18'}`, d: 'Linkloom accounts are 18+. This cannot be approved. Reject it and say they can apply again after their 18th birthday.' });
    if (v.bank && v.bank.match && v.bank.match !== 'ok') { const bm = nameMatch(d.name, v.bank.holder); p.push({ block: bm.k === 'bad', h: bm.k === 'close' ? 'Payout holder name is close, not exact' : 'Payout account belongs to someone else', d: bm.k === 'close' ? `The account is in the name “${v.bank.holder}”; the ID reads “${d.name}”. ${v.note ? v.note + '. ' : ''}Usually fine; ask for a bank letter if unsure.` : `The ${v.bank.kind === 'UPI' ? 'UPI ID' : 'account'} is held by “${v.bank.holder}”. Payouts must go to the creator’s own account.` }); }
    if (v.socials.some(x => !x.linked)) p.push({ block: false, h: 'Instagram not linked by login', d: 'Follower numbers are self-reported until they connect the account.' });
  } else {
    const b = v.business || {}, per = v.person || {}, mail = per.mail || v.email;
    if (!b.gstin && !b.legal) p.push({ block: true, soft: true, h: 'No business details at all', d: 'No legal name, GSTIN, PAN or CIN, and no named person. Ask for them, or reject if the account looks like a scam.' });
    if (mail && (freeMail(mail) || per.mailVerified === false)) p.push({ block: true, soft: true, h: 'Business mail is not a company address', d: `${mail} is ${freeMail(mail) ? 'a free mailbox' : 'not a company domain'}${per.mailVerified === false ? ' and is not verified' : ''}.` });
    const acc = v.raw.brand && typeof v.raw.brand === 'object' ? toBrand(v.raw.brand) : null;
    if (acc && acc.reports) p.push({ block: false, h: `${acc.reports} open reports on this brand`, d: `Its campaigns are reported in moderation.${acc.postsLast30 != null ? ` Posted ${acc.postsLast30} campaigns in the last 30 days.` : ''}`, go: '#brand-' + acc.id });
  }
  v.checks.forEach(c => { const s = str(pick(c.status, c.result)).toLowerCase(); if (c.blocking && !/pass|ok|match|clear/.test(s)) p.push({ block: true, h: `${str(pick(c.label, c.name, 'A check'))}: blocks approval`, d: str(pick(c.message, c.detail, 'The backend will refuse approval until this check passes.')) }); });
  return p;
}

const STATUS = { pending: ['pill-info', 'clock', 'Waiting'], approved: ['pill-ok', 'check', 'Approved'], rejected: ['pill-err', 'alert', 'Rejected'], info: ['pill-warn', 'send', 'More info asked'] };
const Pill = ({ st }) => { const m = STATUS[st] || STATUS.pending; return <span className={`pill ${m[0]}`}><Icon n={m[1]} />{m[2]}</span>; };
const Kind = ({ k }) => <span className={`vfy-kind vfy-kind--${k}`}><i className="dot"></i>{k === 'brand' ? 'Brand' : 'Creator'}</span>;
const sigIc = ok => (ok === 'ok' ? 'check' : ok === 'warn' ? 'info' : 'alert');
const Sig = ({ c }) => <li className={`vfy-sig is-${c.ok}`} title={c.n + ': ' + c.t}><span className="vfy-sig-i"><Icon n={sigIc(c.ok)} /></span><span className="vfy-sig-n">{c.n}</span><span className="sr-only">: {c.t}</span></li>;

/* ---------- queue ---------- */
function Row({ v }) {
  const c = checks(v), sl = sla(v), bad = c.filter(x => x.ok === 'bad').length, pr = problems(v).filter(x => x.block), pending = v.status === 'pending';
  return (
    <li className={'vfy-row' + (!pending ? ' is-done' : '')} data-kind={v.kind}>
      <a className="vfy-row-a" href={`#verify-${v.id}`} aria-label={`${v.name}, ${v.kind}. ${pending ? sl.t : (STATUS[v.status] || STATUS.pending)[2]}. Open`}>
        <Av kind={v.kind} name={v.name} src={photoOf(v.raw) || photoOf(v.raw && (v.raw.creator || v.raw.brand || v.raw.profile))} />
        <span className="vfy-row-id"><b>{v.name}</b><span><Kind k={v.kind} /><span className="num">{v.submitted ? `Sent ${L.ago(v.submitted)}` : v.email}</span></span></span>
        <ul className="vfy-sigs" aria-label="Checks">{c.filter(x => !x.api).map(x => <Sig c={x} key={x.k} />)}</ul>
        <span className="vfy-row-flag">{!pending ? <Pill st={v.status} /> : pr.length ? <span className="vfy-flag"><Icon n="alert" />{pr[0].h.replace(/:.*/, '')}</span> : bad ? <span className="vfy-flag"><Icon n="alert" />{`${bad} check${bad > 1 ? 's' : ''} failed`}</span> : <span className="vfy-clear"><Icon n="check" />All checks clear</span>}</span>
        <span className="vfy-row-sla">{pending ? <span className={`pill ${sl.cls}`}><Icon n={sl.ic} />{sl.t}</span> : <span className="t-cap muted">{[v.decidedBy, v.decidedAt && L.ago(v.decidedAt)].filter(Boolean).join(' · ')}</span>}</span>
        <span className="vfy-row-go"><Icon n="chevron" /></span>
      </a></li>
  );
}

function Queue() {
  const root = useRef(null);
  const rerender = useRerender();
  const u = ui();
  const r = useLoad(() => Promise.all([api.verifications({ status: 'pending' }), api.verifications({ status: 'decided' }).catch(() => api.verifications({}).catch(() => ({ rows: [] })))]), []);
  const all = r.data ? r.data[0].rows.map(toVerification) : [], meta = r.data ? r.data[0].meta || {} : {};
  const done = r.data ? r.data[1].rows.map(toVerification).filter(v => v.status !== 'pending').slice(0, 20) : [];
  const pend = all.filter(v => v.status === 'pending').sort((a, b) => leftH(a) - leftH(b));
  const mc = meta.counts || {};
  const cnt = k => { const m = mc[k]; const n = num(m && typeof m === 'object' ? pick(m.pending, m.total) : m); return n != null ? n : pend.filter(v => k === 'all' || v.kind === k).length; };
  const over = pend.filter(v => sla(v).k === 'over').length;
  const f = v => u.tab === 'all' || v.kind === u.tab;
  const P = pend.filter(f), D = done.filter(f);
  useLayoutEffect(() => { if (root.current) mo('stagger', [...root.current.querySelectorAll('.vfy-row')]); }, [!!r.data]);
  const setTab = k => { const rows = root.current ? [...root.current.querySelectorAll('.vfy-row')] : []; u.tab = k; mo('flip', () => {}, rows); rerender(); };
  return (
    <div className="view-in vfy" ref={root}>
      <header className="page-h vfy-head">
        <div className="t"><p className="t-eyebrow">Verification desk</p><h1 className="t-h1">{!r.data ? 'Verification desk' : pend.length ? `${cnt('all') || pend.length} waiting for a decision` : 'Queue is clear'}</h1>
          <p className="muted">Creators within 24 hours, brands within 48. Oldest first by time left.{over ? <> <b className="vfy-over">{over} over SLA.</b></> : null}</p></div>
        <div className="seg vfy-seg" role="group" aria-label="Show">
          {[['creator', 'Creators'], ['brand', 'Brands'], ['all', 'All']].map(([k, t]) => <button type="button" key={k} aria-pressed={u.tab === k} onClick={() => setTab(k)}>{t} <span className="vfy-seg-n num">{r.data ? cnt(k) : ''}</span></button>)}
        </div>
      </header>
      <RoleNote area="verify" doing="Deciding verifications" />
      {r.err ? <Failed err={r.err} retry={r.reload} what="The verification queue" /> : !r.data ? <Loading what="the verification queue" /> : <>
        <section aria-labelledby="vfyQ"><h2 className="sr-only" id="vfyQ">Waiting</h2>
          <ol className="vfy-list no-anchor" id="vfyList">{P.length ? P.map(v => <Row v={v} key={v.id} />)
            : <li className="empty"><img src="assets/step-05-stamp.svg" width="160" height="117" alt="" /><p className="t-h3">Nothing waiting here</p><p className="muted">{`New ${u.tab === 'brand' ? 'brand ' : u.tab === 'creator' ? 'creator ' : ''}requests show up the minute they are sent.`}</p></li>}</ol></section>
        {D.length ? <section className="vfy-done" aria-labelledby="vfyD"><h2 className="t-h3" id="vfyD">Decided</h2><ol className="vfy-list vfy-list--done">{D.map(v => <Row v={v} key={v.id} />)}</ol></section> : null}
      </>}
    </div>
  );
}

/* ---------- detail ---------- */
const Kvs = ({ rows }) => <dl className="vfy-kv">{rows.filter(Boolean).map(([k, v, s]) => <div key={k}><dt>{k}</dt><dd>{v}{s ? <span className={`vfy-m is-${s.k}`}><Icon n={s.k === 'ok' ? 'check' : s.k === 'close' || s.k === 'warn' ? 'info' : 'alert'} />{s.t}</span> : null}</dd></div>)}</dl>;
const Mono = ({ t }) => <span className="vfy-mono num">{t}</span>;
const None = ({ t = 'Not provided' }) => <span className="muted">{t}</span>;
const ok = t => ({ k: 'ok', t }), bad = t => ({ k: 'bad', t }), warn = t => ({ k: 'warn', t });
const Card = ({ id, ic, title, children }) => <section className="vfy-card" aria-labelledby={id}><header><span className="vfy-ci"><Icon n={ic} /></span><h2 className="t-h3" id={id}>{title}</h2></header>{children}</section>;
const matchOf = (m, s) => (m === 'ok' || s.k === 'ok' ? ok('Matches ID') : s.k === 'close' ? warn(s.t) : s.k === 'none' ? null : bad(s.t));

function CreatorBody({ v }) {
  const d = v.id_doc || {}, age = ageFrom(d.dob), pan = v.pan || {}, bank = v.bank || {}, pm = nameMatch(d.name, pan.name), bm = nameMatch(d.name, bank.holder);
  const acc = v.raw.creator && typeof v.raw.creator === 'object' ? toCreator(v.raw.creator) : null;
  return <>
    <Card id="vfyId" ic="user" title="Identity">
      {v.id_doc ? <Kvs rows={[['Document', d.type || <None />], ['Number', d.masked ? <Mono t={d.masked} /> : <None />], ['Name on ID', d.name || <None />],
        ['Date of birth', d.dob ? L.fmtDate(d.dob, { year: true }) : <None />, age == null ? (d.match === 'under18' ? bad('Under 18') : null) : age >= 18 ? ok(`Age ${age}`) : bad(`Age ${age}, under 18`)]]} /> : <p className="muted">The API sent no ID details for this request.</p>}</Card>
    <Card id="vfyPan" ic="file" title="PAN and payout">
      <Kvs rows={[['PAN', pan.masked ? <Mono t={pan.masked} /> : <None />], ['Name on PAN', pan.name || <None />, pan.name ? matchOf(pan.match, pm) : null],
        [bank.kind === 'UPI' ? 'UPI ID' : 'Bank account', bank.masked ? <Mono t={bank.masked} /> : <None />], bank.ifsc ? ['IFSC', <Mono t={bank.ifsc} />] : null,
        ['Account holder', bank.holder || <None />, bank.holder ? matchOf(bank.match, bm) : null]]} />
      <p className="vfy-note">Penny-drop check returned the holder name above. Full numbers stay encrypted; only the last digits are shown.</p></Card>
    <Card id="vfySelf" ic="camera" title="Selfie">
      {v.selfie ? <>
        <Kvs rows={[['Liveness', v.selfie.liveness === 'passed' ? 'Passed, blink and turn' : (v.selfie.liveness || 'Not run'), v.selfie.liveness === 'passed' ? ok('Live') : bad('Failed')]]} />
        {v.selfie.faceMatch != null ? <div className="vfy-face"><div className="vfy-face-h"><span>Face match with ID photo</span><b className="t-money num">{v.selfie.faceMatch}%</b></div>
          <div className="vfy-bar" role="img" aria-label={`Face match ${v.selfie.faceMatch} percent; 85 percent needed`}><i style={{ width: v.selfie.faceMatch + '%' }}></i><s style={{ left: '85%' }}></s></div>
          <p className="t-cap muted">85% needed. The selfie itself is never shown here or to brands.</p></div> : null}
      </> : <p className="muted">The API sent no selfie or liveness result for this request.</p>}</Card>
    <Card id="vfySoc" ic="link" title="Social accounts">
      {v.socials.length ? <ul className="vfy-socs">{v.socials.map((x, i) => <li key={i}><span className="vfy-soc-ic"><Icon n={x.p === 'youtube' ? 'yt' : 'ig'} /></span>
        <span className="vfy-soc-t"><b>{x.handle}</b><span>{x.p === 'youtube' ? 'YouTube' : 'Instagram'}{x.age ? ` · ${x.age} old` : ''}</span></span>
        <span className="vfy-soc-n"><b className="t-money">{x.followers != null ? L.compact(x.followers) : '—'}</b><span>{x.p === 'youtube' ? 'subscribers' : 'followers'}</span></span>
        {x.linked ? <span className="pill pill-ok"><Icon n="check" />Linked</span> : <span className="pill pill-err"><Icon n="alert" />Not linked</span>}</li>)}</ul> : <p className="muted">No social accounts sent with this request.</p>}
      {acc && acc.followers ? <p className="vfy-note">{`On Linkloom since ${L.fmtDate(acc.joined, { year: true })}: ${L.compact(acc.followers)} followers, ${acc.jobs} jobs${acc.rating ? `, rated ${acc.rating}` : ''}.`} <a className="btn-q" href={`#creator-${acc.id}`}>Account</a></p> : null}</Card>
  </>;
}
function BrandBody({ v }) {
  const b = v.business || {}, p = v.person || {}, bill = v.billing || {}, g = b.gstin, cin = b.cin, mail = p.mail || v.email;
  const cinT = cin ? `${cin[0] === 'U' ? 'Unlisted' : 'Listed'} · ${cin.slice(12, 15) === 'PTC' ? 'private limited' : 'company'} · incorporated ${cin.slice(8, 12)}` : '';
  const dom = (mail || '').split('@')[1] || '', bdom = (bill.email || '').split('@')[1] || '';
  const panOk = b.pan && (b.panFromGstin || (g && g.slice(2, 12) === b.pan));
  return <>
    <Card id="vfyBiz" ic="brief" title="Business">
      <Kvs rows={[['Legal name', b.legal || <None />],
        ['GSTIN', g ? <Mono t={g} /> : <None />, g ? (/active/i.test(b.gstinStatus || '') ? ok(`Active on the GST portal${gstState(g) ? ' · ' + gstState(g) : ''}`) : b.gstinStatus ? bad(b.gstinStatus) : warn('Status not checked')) : bad('Missing')],
        ['Company PAN', b.pan ? <Mono t={mask(b.pan)} /> : <None />, b.pan ? (panOk ? ok('Same as characters 3 to 12 of the GSTIN') : bad('Does not match the GSTIN')) : bad('Missing')],
        ['CIN', cin ? <Mono t={cin} /> : <None />, cin ? ok(cinT) : warn('Needed for companies; LLPs give an LLPIN')]]} /></Card>
    <Card id="vfyPer" ic="user" title="Authorised person">
      <Kvs rows={[['Name', p.name && p.name !== '—' ? p.name : <None t="Not named" />], ['Designation', p.designation && p.designation !== '—' ? p.designation : <None t="—" />],
        ['Business mail', mail || <None />, !mail ? null : freeMail(mail) ? bad('Free mailbox') : p.mailVerified ? ok('Verified by link') : p.mailVerified === false ? bad('Not verified') : null]]} /></Card>
    <Card id="vfyBill" ic="wallet" title="Billing">
      <Kvs rows={[['Address', bill.address || <None />], ['Invoices to', bill.email || <None />, bill.email ? (bdom === dom ? ok('Same domain as the person') : warn('Different domain')) : null]]} />
      <p className="vfy-note">Brands pay the agreed price into escrow. No platform fee; GST on invoices as per confirmed rules.</p></Card>
  </>;
}

function Docs({ v, reload }) {
  if (!v.docs.length) return null;
  const open = async d => {
    if (d.url && (!d.expiresAt || Date.parse(d.expiresAt) > Date.now())) { window.open(d.url, '_blank', 'noopener'); return; }
    L.toast('That link has expired. Getting a fresh one…', 'clock');
    try { const fresh = toVerification(await api.verification(v.id), v.acc); reload(fresh); const n = fresh.docs.find(x => x.key === d.key); n && n.url ? window.open(n.url, '_blank', 'noopener') : L.toast('The API gave no link for this document.', 'alert'); }
    catch (e) { L.toast(errText(e), 'alert'); }
  };
  return <Card id="vfyDoc" ic="paperclip" title="Documents">
    <div className="stack">{v.docs.map(d => <Lq className="lq-s lq-sm" key={d.key} onClick={() => open(d)}><Icon n="eye" className="ic" />{d.name}</Lq>)}
      <p className="vfy-note">Links are signed and last 5 minutes; an expired one is fetched again.</p></div></Card>;
}

/* uploaded files (ID, PAN, bank proof...): an uploadId is turned into a signed link through /v1/uploads/<id>/download-url/ */
function Thumb({ x, retry }) {
  const [bad, setBad] = useState(false);
  const pdf = /pdf/i.test(x.type || '') || /\.pdf(\?|$)/i.test(x.url || '');
  if (x.err) return <li className="vfy-img is-err"><span className="vfy-img-f"><span className="vfy-img-doc"><Icon n="alert" />Not available</span></span><span className="vfy-img-c"><b>{x.label}</b><span className="muted">{x.err}</span></span></li>;
  return <li className="vfy-img"><a href={x.url} target="_blank" rel="noopener noreferrer" className="vfy-img-f" aria-label={`Open ${x.label}`}>
    {pdf || bad ? <span className="vfy-img-doc"><Icon n="file" />{pdf ? 'PDF' : 'Open file'}</span> : <img src={x.url} alt={x.label} loading="lazy" decoding="async" onError={() => setBad(true)} />}</a>
    <span className="vfy-img-c"><b>{x.label}</b>{bad ? <button type="button" className="btn-q" onClick={retry}>Get a fresh link</button> : null}</span></li>;
}
function Images({ v }) {
  const list = v.images.filter(x => !x.selfie), selfies = v.images.length - list.length;
  const r = useLoad(() => Promise.all(list.map(x => (x.uploadId
    ? api.fileUrl(x.uploadId).then(d => {
      const url = mediaUrl(typeof d === 'string' ? d : str(d && pick(d.url, d.downloadUrl, d.signedUrl)));
      return url ? { ...x, url, type: str(d && pick(d.contentType, d.mimeType, d.mime)) } : { ...x, err: 'The API gave no link for this file.' };
    }, e => ({ ...x, err: errText(e) }))
    : Promise.resolve(mediaUrl(x.url) ? { ...x, url: mediaUrl(x.url) } : { ...x, err: 'The link is not one the browser can open.' })))), [v.id, list.map(x => x.key).join('|')]);
  if (v.kind === 'brand' && !list.length) return null;
  return <Card id="vfyImg" ic="eye" title="Uploaded images">
    {!list.length ? <p className="muted">The API sent no uploaded images for this request.</p>
      : r.err ? <p className="muted">{errText(r.err)}</p>
      : !r.data ? <p className="muted">Loading images…</p>
      : <ul className="vfy-imgs">{r.data.map(x => <Thumb key={x.key + (x.url || '')} x={x} retry={r.reload} />)}</ul>}
    {selfies ? <p className="vfy-note">The selfie photo stays private and is not shown here.</p> : null}
    {list.length ? <p className="vfy-note">Links are signed and short-lived; reopen the request if one has expired.</p> : null}
  </Card>;
}
/* everything the API sent for this request, so nothing the applicant entered is hidden by a field name the screen does not know */
function AllFields({ v }) {
  const rows = fieldsOf(v.raw);
  if (!rows.length) return null;
  return <Card id="vfyRaw" ic="info" title="Everything the API sent">
    <details className="vfy-raw"><summary>{`Show all ${rows.length} fields`}</summary><Kvs rows={rows} /></details>
    <p className="vfy-note">Full ID, PAN and account numbers are masked to the last 4 characters.</p></Card>;
}

const ITEMS = {
  creator: [['id', 'A clearer photo of the ID, both sides'], ['pan', 'PAN card photo'], ['bank', 'Payout account in their own name (bank letter or cancelled cheque)'], ['selfie', 'A new selfie in good light'], ['soc', 'Connect Instagram or YouTube by login']],
  brand: [['gst', 'GSTIN and the GST registration certificate'], ['pan', 'Company PAN'], ['cin', 'Certificate of incorporation (CIN or LLPIN)'], ['per', 'Name and designation of the authorised person, with a board or partner letter'], ['mail', 'A work email on the company domain'], ['bill', 'Billing address and accounts email']]
};
const KEYMAP = { id: 'id', pan: 'pan', bank: 'bank', face: 'selfie', soc: 'soc', gst: 'gst', cin: 'cin', per: 'per', mail: 'mail', bill: 'bill' };

function Detail({ id }) {
  const root = useRef(null);
  /* the request, plus the applicant's account record for whatever the request leaves out (details, photo, uploads) */
  const r = useLoad(async () => {
    const raw = await api.verification(id);
    let v = toVerification(raw);
    if (v && v.account) {
      const acc = await (v.kind === 'brand' ? api.brand(v.account) : api.creator(v.account)).catch(() => null);
      if (acc) v = toVerification(raw, acc);
    }
    return v;
  }, [id]);
  const nx = useLoad(() => api.verifications({ status: 'pending' }).then(p => p.rows.map(toVerification)).catch(() => []), [id]);
  const v = r.data;
  useEffect(() => { if (v) document.title = v.name + ' · Verification · Linkloom'; }, [v && v.name]);
  useLayoutEffect(() => { if (v && root.current) mo('stagger', [...root.current.querySelectorAll('.vfy-card,.vfy-sigs--lg>li')]); }, [!!v]);
  const back = <a className="btn-q vfy-back" href="#verify"><Icon n="back" />Verification desk</a>;
  if (r.err) return <div className="view-in">{r.err.status === 404 ? <div className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h2">No request with that link.</p><p className="muted">It may have been withdrawn by the applicant.</p><Lq as="a" className="lq-p" href="#verify">Back to the desk</Lq></div> : <>{back}<Failed err={r.err} retry={r.reload} what="This request" /></>}</div>;
  if (!v) return <div className="view-in">{back}<Loading what="this request" /></div>;

  const c = checks(v), pr = problems(v), sl = sla(v), pending = v.status === 'pending';
  /* hard blocks (under 18, payout to someone else, a backend check) stop approval; soft ones (missing brand details)
     a Super admin can approve past, with a note in the audit log */
  const hard = pr.filter(x => x.block && !x.soft), soft = pr.filter(x => x.block && x.soft);
  const override = !hard.length && soft.length > 0 && can('verifyOverride');
  const block = hard.length > 0 || (soft.length > 0 && !override);
  const clear = c.filter(x => x.ok === 'ok').length;
  const next = (nx.data || []).filter(x => x.status === 'pending' && x.id !== v.id).sort((a, b) => leftH(a) - leftH(b))[0];
  const first = v.kind === 'brand' ? (v.person && v.person.name && v.person.name !== '—' ? v.person.name.split(' ')[0] : 'there') : v.name.split(' ')[0];
  const items = ITEMS[v.kind];
  const preset = [...new Set(c.filter(x => x.ok !== 'ok' && KEYMAP[x.k]).map(x => KEYMAP[x.k]))];
  const compose = keys => `Hi ${first}, thanks for sending your details. To finish ${v.kind === 'brand' ? 'verifying ' + ((v.business && v.business.legal) || v.name) : 'your verification'}, please share:\n${items.filter(i => keys.includes(i[0])).map(i => '• ' + i[1]).join('\n')}\nYou can upload these from the same verification page. We will review within ${SLA_H[v.kind]} hours of your reply. – Linkloom Trust team`;
  const age = v.id_doc ? ageFrom(v.id_doc.dob) : null;
  const after = () => { refreshCounts(); r.reload(); nx.reload(); };
  const sum = <ul className="adm-sum">{c.map(x => <li className={`is-${x.ok}`} key={x.k}><Icon n={sigIc(x.ok)} /><b>{x.n}</b><span>{x.t}</span></li>)}</ul>;

  const softWhy = soft.map(x => x.h.replace(/:.*/, '').toLowerCase()).join('; ');
  const approve = () => override ? confirm({
    title: `Approve ${v.name} anyway`, cta: 'Approve anyway', danger: true,
    lead: <p>{`Approving without: ${softWhy}. ${v.name} can post campaigns and fund escrow once approved. Say why in the note; it is kept in the audit log.`}</p>,
    summary: sum, placeholder: 'For example: small business without GST, confirmed on a call', note: '',
    run: ({ note }) => api.approveVerification(v.id, { note: `Approved past: ${softWhy}. ${note}` }), toast: 'Approved · Logged to audit', done: after
  }) : confirm({
    title: `Approve ${v.name}`, cta: 'Approve and notify',
    lead: <p>{v.kind === 'creator' ? `${first} can bid and get paid once approved. Brands see a verified tick; KYC details stay private.` : `${v.name} can post campaigns and fund escrow once approved.`}</p>,
    summary: sum, placeholder: 'For example: all documents match',
    note: c.every(x => x.ok === 'ok') ? (v.kind === 'creator' ? 'ID, PAN, payout and socials match' : 'GSTIN active, PAN and CIN match, mail verified') : '',
    run: ({ note }) => api.approveVerification(v.id, { note }), toast: 'Approved · Logged to audit', done: after
  });
  const reject = () => confirm({
    title: `Reject ${v.name}`, cta: 'Reject request', danger: true,
    lead: <p>{`${first} is told the reason and can apply again${v.kind === 'creator' && age != null && age < 18 ? ' after turning 18' : ' with new documents'}. Nothing is deleted.`}</p>,
    reasons: v.kind === 'creator' ? ['Under 18', 'Payout account is not theirs', 'Documents do not match', 'Edited or fake document', 'Duplicate account'] : ['No business details', 'GSTIN inactive or not theirs', 'Not a real business', 'Suspected scam'],
    preset: v.kind === 'creator' && ((age != null && age < 18) || (v.id_doc && v.id_doc.match === 'under18')) ? 'Under 18' : v.kind === 'brand' && !(v.business && v.business.gstin) ? 'No business details' : '',
    summary: sum,
    run: ({ reason, note }) => api.rejectVerification(v.id, { reason: reason === 'Other' ? note : reason, note }), toast: 'Rejected · Logged to audit', done: after
  });
  const ask = () => {
    let touched = false;
    confirm({
      title: `Ask ${first} for more`, cta: 'Send request', rows: 8, max: 2000,
      lead: <p>Pick what is missing. The message below is what they get by email and in the app; edit it if you like.</p>,
      init: { keys: preset }, noteLabel: 'Message', placeholder: 'Message to the applicant', note: compose(preset), onNote: () => { touched = true; },
      extra: ({ x, set, setNote }) => <fieldset className="adm-fs"><legend className="t-label">What to send</legend><div className="adm-items">{items.map(([k, t]) => <label className="check" key={k}>
        <input type="checkbox" value={k} checked={x.keys.includes(k)} onChange={e => { const keys = e.target.checked ? [...x.keys, k] : x.keys.filter(y => y !== k); set('keys', keys); if (!touched) setNote(compose(keys)); }} /><span>{t}</span></label>)}</div></fieldset>,
      validate: ({ x }) => (x.keys.length ? '' : 'Pick at least one thing to ask for.'),
      run: ({ note, x }) => api.requestInfo(v.id, { items: x.keys, message: note }), toast: 'Request sent · Logged to audit', done: after
    });
  };

  const accHref = v.account ? `#${v.kind}-${v.account}` : '';
  const dec = !pending;
  return (
    <div className="view-in vfy vfy-d" ref={root}>
      {back}
      <header className="vfy-mast">
        <Av kind={v.kind} name={v.name} cls="vfy-av" src={photoOf(v.raw) || photoOf(v.raw && (v.raw.creator || v.raw.brand || v.raw.profile)) || photoOf(v.acc)} />
        <div className="vfy-mast-t">
          <p className="vfy-mast-k"><Kind k={v.kind} /><span>{v.kind === 'brand' ? 'Brand verification' : 'Creator KYC'}</span>{accHref ? <a className="btn-q" href={accHref}>View account</a> : <span>No account yet</span>}</p>
          <h1 className="t-h1">{v.name}</h1>
          <p className="muted num">{v.submitted ? `Sent ${L.fmtDate(v.submitted)}, ${L.ago(v.submitted)}` : 'Submission time not given'}{v.note ? ' · ' + v.note : ''}</p>
        </div>
        <div className="vfy-mast-s">{pending ? <span className={`pill ${sl.cls}`}><Icon n={sl.ic} />{sl.t}</span> : <Pill st={v.status} />}
          <p className="vfy-score"><b className="t-money num">{clear}</b><span>of {c.length} checks clear</span></p></div>
      </header>
      {dec ? <div className={`vfy-result is-${v.status === 'info' ? 'info_requested' : v.status}`} role="status"><span className="vfy-result-i"><Icon n={v.status === 'approved' ? 'check' : v.status === 'rejected' ? 'alert' : 'send'} /></span>
        <div><p className="t-h3">{v.status === 'approved' ? 'Approved' : v.status === 'rejected' ? 'Rejected' : 'Waiting on the applicant'}</p><p className="muted">{[v.reason, v.decidedBy, v.decidedAt && L.ago(v.decidedAt)].filter(Boolean).join(' · ')}{' · Logged to audit.'}</p></div>
        {next ? <Lq as="a" className="lq-p lq-sm" href={`#verify-${next.id}`}>{`Next: ${next.name}`}</Lq> : <Lq as="a" className="lq-s lq-sm" href="#verify">Back to the desk</Lq>}</div> : null}
      {pr.length ? <section className="vfy-probs" aria-label="Needs your attention">{pr.map((x, i) => <div className={'vfy-prob' + (x.block ? ' is-block' : '')} key={i}><span className="vfy-prob-i"><Icon n={x.block ? 'alert' : 'info'} /></span><div><p className="vfy-prob-h">{x.h}</p><p>{x.d}{x.go ? <> <a className="btn-q" href={x.go}>Open brand</a></> : null}</p></div></div>)}</section> : null}
      <ul className="vfy-sigs vfy-sigs--lg" aria-label="Checks">{c.map(x => <li className={`vfy-sig is-${x.ok}`} key={x.k}><span className="vfy-sig-i"><Icon n={sigIc(x.ok)} /></span><span className="vfy-sig-t"><b>{x.n}</b><span>{x.t}</span></span></li>)}</ul>
      <div className="vfy-cards">{v.kind === 'creator' ? <CreatorBody v={v} /> : <BrandBody v={v} />}<Images v={v} /><Docs v={v} reload={d => r.set(d)} /><AllFields v={v} /></div>
      {pending ? <div className="vfy-dock" role="region" aria-label="Decision">
        <p className="vfy-dock-t">{!can('verify') ? <><Icon n="lock" /><span>Deciding needs the Super admin or Trust &amp; safety role.</span></>
          : block ? <><Icon n="alert" /><span>{`Approve is off: ${(hard[0] || soft[0]).h.replace(/:.*/, '').toLowerCase()}.${!hard.length ? ' Only a Super admin can approve past this.' : ''}`}</span></>
          : override ? <><Icon n="alert" /><span>{`Missing: ${softWhy}. You can still approve as Super admin; say why in the note.`}</span></>
          : <><Icon n="shield" /><span>Your decision is logged and the applicant is told by SMS and email.</span></>}</p>
        <div className="vfy-dock-b">
          <Lq className="lq-s lq-sm" onClick={reject} disabled={!can('verify')}><Icon n="close" className="ic" />Reject</Lq>
          <Lq className="lq-s lq-sm" onClick={ask} disabled={!can('verify')}><Icon n="chat" className="ic" />Ask for more info</Lq>
          <Lq className="lq-p lq-sm" onClick={approve} disabled={block || !can('verify')} aria-disabled={block || !can('verify') ? 'true' : undefined}><Icon n="check" className="ic" />{override ? 'Approve anyway' : 'Approve'}</Lq>
        </div></div> : null}
    </div>
  );
}

const Verify = ({ param }) => (param ? <Detail id={param} key={param} /> : <Queue />);
L.register('verify', { title: id => (id ? 'Verification' : 'Verification'), nav: 'verify', Component: Verify });
