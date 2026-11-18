/* The kit shared by Marketplace and Moderation: people chips, pills, stars, and the reason sheet every action goes through.
   Creators read coral, brands violet. Money is integer paise. */
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { data } from './core.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { why } from './admin.js';

const S = () => data;
export const ui = k => { const s = S(); s.ui = s.ui || {}; return (s.ui[k] = s.ui[k] || {}); };
export const mo = (fn, ...a) => { try { return (L.motion[fn] && L.motion[fn](...a)) || null; } catch (e) { return null; } };
/* FLIP around a change: kept items glide from where they were, new ones arrive. mutate always runs, once. */
export const flip = (mutate, nodes) => { let done = false; const m = () => { done = true; mutate(); }; try { L.motion.flip(m, nodes); } catch (e) {} if (!done) mutate(); };
export const nowISO = () => L.today().toISOString();
export const time = s => L.D(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase());
export const when = s => `${L.fmtDate(s)}, ${time(s)}`;
export const plat = p => (p === 'youtube' ? 'YouTube' : 'Instagram');
export const Glyph = ({ p }) => <Icon n={p === 'youtube' ? 'yt' : 'ig'} />;
export const plural = (n, a, b) => `${n} ${n === 1 ? a : (b || a + 's')}`;

/* people: creators coral, brands violet, unknown accounts a quiet outline */
export function Who({ kind, name, sub = '', href = '' }) {
  const inner = <><span className={`avatar mx-av is-${kind}`} aria-hidden="true">{L.initials(name)}</span><span className="mx-who-t"><b>{name}</b>{sub ? <span>{sub}</span> : null}</span></>;
  return href ? <a className={`mx-who is-${kind}`} href={href}>{inner}</a> : <span className={`mx-who is-${kind}`}>{inner}</span>;
}
export const CrWho = ({ c, sub }) => <Who kind="c" name={c.name} sub={sub == null ? (c.handle || c.city) : sub} href={`#creator-${c.id}`} />;
export const BrWho = ({ b, sub }) => <Who kind="b" name={b.name} sub={sub == null ? (b.verify === 'verified' ? 'Verified brand · ' + b.city : 'Not verified') : sub} href={`#brand-${b.id}`} />;
export const Pill = ({ cls, icon, label }) => <span className={`pill ${cls}`}>{icon ? <Icon n={icon} /> : null}{label}</span>;
const SEV = { high: ['pill-err', 'alert', 'High'], medium: ['pill-warn', 'flag', 'Medium'], low: ['pill-paper', '', 'Low'] };
export const Sev = ({ s }) => { const m = SEV[s] || SEV.low; return <Pill cls={m[0]} icon={m[1]} label={m[2] + ' severity'} />; };
export const Stars = ({ n }) => <span className="mx-stars" role="img" aria-label={`${n} out of 5 stars`}>{[1, 2, 3, 4, 5].map(i => <span className={i <= n ? 'on' : ''} key={i}><Icon n="star" /></span>)}</span>;

/* the reason sheet: a mini of the target, plain consequences, a required reason, a note that it is logged.
   o: { title, mini (node), bullets, reasons, preset, action, target, yes, danger, onYes(reason) → promise (the API call) }
   The sheet stays open and busy until the promise settles; a failure is shown in the sheet. */
function ReasonForm({ o, close }) {
  const reasons = [...(o.reasons || []), 'Other'];
  const form = useRef(null), note = useRef(null), rcs = useRef(null);
  const [count, setCount] = useState(0);
  const [other, setOther] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const picked = () => (form.current.querySelector('input[name=mxr]:checked') || {}).value;
  const submit = e => {
    e.preventDefault();
    const pick = picked(), n = note.current.value.trim();
    let msg = '';
    if (!pick) msg = 'Pick a reason. It goes into the audit log with your name.';
    else if (pick === 'Other' && n.length < 4) msg = 'Add a short note so the log says why.';
    if (msg) { flushSync(() => setErr(msg)); mo('shake', pick ? note.current : rcs.current); (pick ? note.current : form.current.querySelector('input[name=mxr]')).focus(); return; }
    if (busy) return;
    const reason = pick === 'Other' ? n : pick + (n ? ' · ' + n : '');
    const p = o.onYes && o.onYes(reason);
    if (p && typeof p.then === 'function') {
      flushSync(() => { setBusy(true); setErr(''); });
      p.then(() => { close(); L.toast('Done · logged to audit', 'check'); }, e2 => { if (!form.current) return; flushSync(() => { setBusy(false); setErr(why(e2)); }); });
      return;
    }
    close();
    L.toast('Done', 'check');
  };
  return (
    <form className="stack mx-sheet" noValidate ref={form} onSubmit={submit} onChange={() => { setErr(''); setOther(picked() === 'Other'); }}>
      {o.mini || null}
      {o.bullets && o.bullets.length ? <ul className="mx-conseq">{o.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul> : null}
      <fieldset className="mx-rs"><legend className="t-label">Reason <span className="muted">· required</span></legend>
        <div className="mx-rcs" ref={rcs}>{reasons.map((r, i) => <label className="mx-rc" key={r}><input type="radio" name="mxr" value={r} defaultChecked={i === 0 && !!o.preset} /><span>{r}</span></label>)}</div>
      </fieldset>
      <div className="field"><label htmlFor="mxNote">Note for the log</label>
        <textarea className="textarea mx-note" id="mxNote" maxLength={240} rows={3} placeholder="What you saw, in a line. Other admins read this." ref={note} onInput={e => { setCount(e.currentTarget.value.length); setErr(''); }}></textarea>
        <p className="help mx-help"><span id="mxHint">{other ? 'Required: say what the reason is.' : 'Optional, unless you pick Other.'}</span><span className="num" id="mxCount">{`${count} / 240`}</span></p></div>
      <p className="err mx-err" id="mxErr" role="alert" hidden={!err}>{err}</p>
      <p className="mx-logged"><Icon n="shield" /><span>Logged as <code>{o.action}</code>{` by ${S().me.name}, with the time and your reason, by the server. Audit entries can’t be edited or deleted.`}</span></p>
      <div className="row wrap mx-sheet-acts"><Lq type="submit" className={'lq-p' + (o.danger ? ' mx-danger' : '')} disabled={busy}>{busy ? 'Saving…' : o.yes}</Lq><Lq className="lq-s" data-no="" onClick={() => close()}>Cancel</Lq></div>
    </form>
  );
}
export function reasonSheet(o) {
  L.openSheet({ title: o.title, body: s => <ReasonForm o={o} close={s.close} /> });
}

export const reportFor = link => S().reports.find(r => r.link === link) || null;
