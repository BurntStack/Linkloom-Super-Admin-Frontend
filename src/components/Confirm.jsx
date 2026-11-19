/* The confirm sheet every admin decision goes through, as designed (artifact verify.js `confirm`, auth.js `adminConfirm`):
   a lead, an optional summary, reason chips with "Other", a note (required when there are no reasons or "Other" is picked,
   8 characters or more), the audit-log line, then the call to the backend. The sheet stays open and shows the backend's
   message if the call fails.

   confirm({ title, cta, danger, lead, summary, reasons, preset, reasonLabel, noteLabel, placeholder, note, noteOptional,
             extra: ({ x, set }) => node, init: {}, validate: ({ reason, note, x }) => msg, run: ({ reason, note, x }) => Promise,
             toast, done }) */
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { errText } from './Admin.jsx';
import Icon from './Icon.jsx';
import Lq from './Lq.jsx';

let uid = 0;
export const LogLine = () => <p className="adm-log"><Icon n="shield" /><span>This is saved to the audit log with your name and the time. Entries cannot be edited or deleted.</span></p>;

function Sheet({ o, close }) {
  const id = useRef('adm' + (++uid)).current;
  const reasons = o.reasons || [];
  const [reason, setReason] = useState(o.preset || '');
  const [note, setNote] = useState(o.note || '');
  const [x, setX] = useState(o.init || {});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const errEl = useRef(null);
  const set = (k, v) => setX(s => ({ ...s, [k]: typeof v === 'function' ? v(s[k]) : v }));
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const n = note.trim();
    let msg = '';
    if (reasons.length && !reason) msg = 'Choose a reason. It goes into the audit log.';
    else if (!o.noteOptional && (!reasons.length || reason === 'Other') && n.length < 8) msg = 'Add a short note (8 characters or more) so the log explains this.';
    else if (o.validate) msg = o.validate({ reason, note: n, x }) || '';
    if (msg) { flushSync(() => setErr(msg)); mo('shake', errEl.current); return; }
    flushSync(() => { setBusy(true); setErr(''); });
    try {
      const r = await o.run({ reason, note: n, x, text: reason && reason !== 'Other' ? reason + (n ? ': ' + n : '') : n });
      close();
      L.toast(o.toast || 'Logged to audit', 'check');
      o.done && o.done(r, { reason, note: n, x });
    } catch (er) { flushSync(() => { setBusy(false); setErr(errText(er)); }); mo('shake', errEl.current); }
  };
  return (
    <form className="adm-form" noValidate onSubmit={submit}>
      {o.lead ? <div className="adm-lead">{o.lead}</div> : null}
      {o.summary || null}
      {reasons.length ? <fieldset className="adm-fs"><legend className="t-label">{o.reasonLabel || 'Reason'}</legend>
        <div className="adm-reasons" role="radiogroup">{[...reasons, 'Other'].map(r => <label className="adm-r" key={r}><input type="radio" name={id + 'r'} value={r} checked={reason === r} onChange={() => { setReason(r); setErr(''); }} /><span>{r}</span></label>)}</div></fieldset> : null}
      {o.extra ? o.extra({ x, set, note, setNote }) : null}
      <div className="field"><label htmlFor={id + 'n'}>{o.noteLabel || 'Note for the log'} <span className="adm-opt">{o.noteOptional ? 'Optional' : reasons.length ? 'Needed for Other' : 'Required'}</span></label>
        <textarea className="textarea" id={id + 'n'} rows={o.rows || 3} maxLength={o.max || 280} placeholder={o.placeholder || 'What you saw and why you are doing this'} value={note} onChange={e => { setNote(e.target.value); setErr(''); o.onNote && o.onNote(); }} /></div>
      <p className="err" role="alert" aria-live="polite" ref={errEl} hidden={!err}>{err}</p>
      <LogLine />
      <div className="adm-btns"><Lq type="submit" className={o.danger ? 'lq-ink adm-danger' : 'lq-p'} disabled={busy}>{busy ? 'Working…' : o.cta}</Lq><Lq className="lq-s" onClick={() => close()}>Cancel</Lq></div>
    </form>
  );
}

export const confirm = o => L.openSheet({ title: o.title, wide: o.wide, body: s => <Sheet o={o} close={s.close} /> });
