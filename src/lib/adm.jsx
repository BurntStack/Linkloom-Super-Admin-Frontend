/* The small admin kit shared by the Verification desk and Accounts: the confirm sheet with a reason, name matching, masks. */
import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L from './core.js';
import { mo } from './mo.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';

export const LogLine = () => <p className="adm-log"><Icon n="shield" /><span>This is saved to the audit log with your name and the time. Entries cannot be edited or deleted.</span></p>;

/* confirm sheet: a reason is required (chip choice; "Other" needs a note).
   o: { title, lead, summary, reasons, reasonLabel, preset, extra, noteLabel, placeholder, note, cta, danger,
        mount(body), validate(body) → message, onConfirm({ reason, note, body }) → false to stay open }
   lead, summary and extra are React nodes. mount, validate and onConfirm get the sheet's body element. */
function ConfirmForm({ o, el, close }) {
  const [id] = useState(() => 'adm' + Math.random().toString(36).slice(2, 7));
  const [msg, setMsg] = useState('');
  const form = useRef(null), er = useRef(null);
  const reasons = o.reasons || [];
  useLayoutEffect(() => { o.mount && o.mount(el); }, []);
  const submit = e => {
    e.preventDefault();
    const f = form.current, r = f.querySelector(`input[name="${id}r"]:checked`), note = el.querySelector('textarea').value.trim();
    let m = '';
    if (reasons.length && !r) m = 'Choose a reason. It goes into the audit log.';
    else if ((!reasons.length || (r && r.value === 'Other')) && note.length < 8) m = 'Add a short note (8 characters or more) so the log explains this.';
    else if (o.validate) m = o.validate(el) || '';
    if (m) { flushSync(() => setMsg(m)); mo('shake', er.current); return; }
    const reason = r ? r.value : '';
    const detail = o.onConfirm({ reason, note, body: el });
    if (detail === false) return;
    close();
    L.toast('Logged to audit', 'check');
  };
  return (
    <form className="adm-form" noValidate ref={form} onSubmit={submit}>
      {o.lead ? <p className="adm-lead">{o.lead}</p> : null}
      {o.summary || null}
      {reasons.length ? <fieldset className="adm-fs"><legend className="t-label">{o.reasonLabel || 'Reason'}</legend>
        <div className="adm-reasons" role="radiogroup">{reasons.map(r => <label className="adm-r" key={r}><input type="radio" name={id + 'r'} value={r} defaultChecked={o.preset === r} /><span>{r}</span></label>)}
          <label className="adm-r"><input type="radio" name={id + 'r'} value="Other" /><span>Other</span></label></div></fieldset> : null}
      {o.extra || null}
      <div className="field"><label htmlFor={id + 'n'}>{(o.noteLabel || 'Note for the log') + ' '}<span className="adm-opt">{reasons.length ? 'Needed for Other' : 'Required'}</span></label>
        <textarea className="textarea" id={id + 'n'} rows={3} maxLength={280} placeholder={o.placeholder || 'What you saw and why you are doing this'} defaultValue={o.note || ''}></textarea></div>
      <p className="err" role="alert" aria-live="polite" hidden={!msg} ref={er}>{msg}</p>
      <LogLine />
      <div className="adm-btns"><Lq type="submit" className={o.danger ? 'lq-ink adm-danger' : 'lq-p'}>{o.cta}</Lq><Lq className="lq-s" data-cancel="" onClick={() => close()}>Cancel</Lq></div>
    </form>
  );
}
export function confirm(o) {
  L.openSheet({ title: o.title, body: s => <ConfirmForm o={o} el={s.el} close={s.close} /> });
}

const norm = n => String(n || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean);
/* explains a name comparison in plain words: same / close (extra initial) / different */
export function nameMatch(a, b) {
  const x = norm(a), y = norm(b);
  if (!x.length || !y.length) return { k: 'none', t: 'Not provided' };
  if (x.join(' ') === y.join(' ')) return { k: 'ok', t: 'Same as the ID' };
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  if (s.every(t => l.includes(t))) { const extra = l.filter(t => !s.includes(t)); return { k: 'close', t: `Close: adds ${extra.length === 1 && extra[0].length === 1 ? 'a middle initial “' + extra[0] + '”' : '“' + extra.join(' ') + '”'}` }; }
  if (x[x.length - 1] === y[y.length - 1]) return { k: 'bad', t: 'Different person, same surname' };
  return { k: 'bad', t: 'Different name' };
}
export const mask = (v, keepS = 5, keepE = 1) => { v = String(v || ''); return v.length <= keepS + keepE ? v : v.slice(0, keepS) + '••••' + v.slice(-keepE); };
export const mailMask = m => { const [u, d] = String(m || '').split('@'); return d ? u.slice(0, 2) + '•••@' + d : m; };
const FREE = ['gmail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'hotmail.com', 'rediffmail.com', 'proton.me'];
export const freeMail = m => FREE.includes(String(m || '').split('@')[1] || '');
const STATES = { '07': 'Delhi', '27': 'Maharashtra', '29': 'Karnataka', '33': 'Tamil Nadu', '32': 'Kerala', '24': 'Gujarat', '06': 'Haryana' };
export const gstState = g => STATES[String(g || '').slice(0, 2)] || '';
export const Av = ({ kind, name, cls = '' }) => <span className={`avatar ${kind === 'brand' ? 'v' : ''} ${cls}`} aria-hidden="true">{L.initials(name)}</span>;
