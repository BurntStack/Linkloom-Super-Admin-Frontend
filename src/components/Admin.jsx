/* Shared pieces for the admin screens: loading a resource or a paged list, showing records whose exact shape the
   API guide does not give, status pills, and the decision sheet every admin action goes through (reason, note,
   confirm; errors from the backend shown as they come). Classes are .adm-*. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { can, whoCan, role, ROLE_NAME, isMoneyKey, isDateKey, label, str, nameOf } from '../lib/admin.js';
import { paise } from '../lib/api.js';
import Icon from './Icon.jsx';
import Lq from './Lq.jsx';

/* ---------- errors, in words an admin can act on ---------- */
export function errText(e) {
  if (!e) return '';
  const c = e.code, st = e.status;
  if (c === 'TIMEOUT' || c === 'NETWORK' || !st) return e.message || 'Could not reach the Linkloom API.';
  if (c === 'ACCOUNT_SUSPENDED') return 'Your admin account has been suspended.';
  if (st === 403) return `Your role${role() ? ` (${ROLE_NAME[role()] || role()})` : ''} cannot do this. ${e.message && e.message !== 'You do not have permission to perform this action.' ? e.message : ''}`.trim();
  if (c === 'ALREADY_DECIDED') return e.message || 'Someone has already decided this. Reload to see the new state.';
  if (c === 'VERIFICATION_BLOCKED') return e.message || 'An automated check is blocking approval.';
  if (st === 409) return e.message || 'This cannot be done in its current state. Reload to see the latest.';
  if (st === 404) return 'Not found. It may have been removed.';
  const d = e.details;
  if (d && typeof d === 'object') {
    const first = Object.entries(d).map(([k, v]) => `${label(k)}: ${Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? JSON.stringify(v) : v}`)[0];
    if (first) return `${e.message || 'Invalid input.'} ${first}`;
  }
  return e.message || 'That did not go through. Try again.';
}

/* ---------- data hooks ---------- */
/* one resource: { data, meta, err, loading, reload, set } */
export function useLoad(fn, deps = []) {
  const [st, setSt] = useState({ data: null, err: null, loading: true });
  const seq = useRef(0);
  const run = useCallback(() => {
    const n = ++seq.current;
    setSt(s => ({ ...s, loading: true, err: null }));
    Promise.resolve().then(fn).then(d => n === seq.current && setSt({ data: d, err: null, loading: false }), e => n === seq.current && setSt({ data: null, err: e, loading: false }));
  }, deps);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); return () => { seq.current++; }; }, [run]);
  return { ...st, reload: run, set: d => setSt(s => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

/* a cursor-paged list: fetcher(query, cursor) -> { rows, meta, next } */
export function usePaged(fetcher, query = {}) {
  const key = JSON.stringify(query);
  const [st, setSt] = useState({ rows: [], meta: {}, next: null, err: null, loading: true, more: false });
  const seq = useRef(0);
  const load = useCallback((cursor) => {
    const n = ++seq.current;
    setSt(s => ({ ...s, err: null, ...(cursor ? { more: true } : { loading: true }) }));
    fetcher(JSON.parse(key), cursor).then(
      r => n === seq.current && setSt(s => ({ rows: cursor ? [...s.rows, ...r.rows] : r.rows, meta: r.meta || {}, next: r.next, err: null, loading: false, more: false })),
      e => n === seq.current && setSt(s => ({ ...s, err: e, loading: false, more: false })));
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(null); return () => { seq.current++; }; }, [load]);
  return { ...st, reload: () => load(null), loadMore: () => st.next && load(st.next),
    patch: (id, fn) => setSt(s => ({ ...s, rows: s.rows.map(r => (str(r.id) === str(id) ? fn(r) : r)) })),
    drop: id => setSt(s => ({ ...s, rows: s.rows.filter(r => str(r.id) !== str(id)) })) };
}

/* stagger rows in when they change */
export function useStagger(ref, sel, deps) {
  useLayoutEffect(() => { if (ref.current) mo('stagger', [...ref.current.querySelectorAll(sel)]); }, deps);   // eslint-disable-line react-hooks/exhaustive-deps
}

/* ---------- states ---------- */
export const Loading = ({ what = 'this' }) => <div className="empty adm-state"><p className="t-h3">{`Loading ${what}`}</p><p className="muted">The Linkloom server can take up to a minute to wake up.</p></div>;
export const Failed = ({ err, retry, what = 'This' }) => (
  <div className="empty adm-state"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h3">{err && err.status === 403 ? 'Not available for your role' : `${what} did not load.`}</p>
    <p className="muted">{errText(err)}</p>{retry && !(err && err.status === 403) ? <Lq className="lq-s lq-sm" onClick={retry}>Try again</Lq> : null}</div>
);
export const Empty = ({ title, text, img = 'step-05-stamp' }) => <div className="empty adm-state"><img src={`assets/${img}.svg`} width="160" height="117" alt="" /><p className="t-h3">{title}</p>{text ? <p className="muted">{text}</p> : null}</div>;
/* a resource's three states in one */
export function Gate({ r, what, children }) {
  if (r.err) return <Failed err={r.err} retry={r.reload} what={what} />;
  if (r.loading && r.data == null) return <Loading what={what.toLowerCase()} />;
  return children(r.data);
}

export const RoleNote = ({ area, doing }) => (can(area) ? null
  : <p className="adm-role"><Icon n="lock" /><span>{`${doing} needs the ${whoCan(area)} role. You can look, not change.`}</span></p>);

/* ---------- page head ---------- */
export const Head = ({ eyebrow, title, lede, children }) => (
  <header className="page-h adm-head"><div className="t">{eyebrow ? <p className="t-eyebrow">{eyebrow}</p> : null}<h1 className="t-h1">{title}</h1>{lede ? <p className="muted">{lede}</p> : null}</div>
    {children ? <div className="row wrap adm-head-a">{children}</div> : null}</header>
);
export const Back = ({ href, children }) => <a className="btn-q adm-back" href={href}><Icon n="back" />{children}</a>;

/* segmented filter: opts [[value, label, count?]] */
export const Seg = ({ value, opts, onChange, label: aria }) => (
  <div className="chips adm-seg" role="group" aria-label={aria}>{opts.map(([v, t, n]) => <button className="chip" type="button" aria-pressed={value === v} key={v} onClick={() => onChange(v)}>{t}{n != null ? <span className="adm-n num">{n}</span> : null}</button>)}</div>
);
export const More = ({ p }) => (p.next ? <div className="adm-more"><Lq className="lq-s lq-sm" onClick={p.loadMore} disabled={p.more}>{p.more ? 'Loading…' : 'Load more'}</Lq></div> : null);

/* ---------- values ---------- */
export const inr = v => { const p = paise(v); return p == null ? '—' : L.inr(p, { dec: p % 100 !== 0 }); };
export const when = s => { if (!s) return ''; const t = Date.parse(s); if (!Number.isFinite(t)) return String(s); return new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }); };
export const ago = s => { const t = Date.parse(s); if (!Number.isFinite(t)) return ''; const m = Math.max(0, Math.round((Date.now() - t) / 6e4)); if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; const d = Math.round(h / 24); return d === 1 ? 'yesterday' : d + ' days ago'; };

export function fmt(k, v) {
  if (v == null || v === '') return <span className="muted">—</span>;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number' && isMoneyKey(k)) return <span className="num">{inr(v)}</span>;
  if (v && typeof v === 'object' && !Array.isArray(v) && 'amount' in v) return <span className="num">{inr(v)}</span>;
  if (typeof v === 'string' && isDateKey(k) && Number.isFinite(Date.parse(v))) return <span className="num">{when(v)}</span>;
  if (Array.isArray(v)) return v.length ? v.map(x => (x && typeof x === 'object' ? nameOf(x) : String(x))).join(', ') : <span className="muted">None</span>;
  if (typeof v === 'object') return nameOf(v) || <span className="muted">—</span>;
  if (typeof v === 'number') return <span className="num">{v.toLocaleString('en-IN')}</span>;
  return String(v);
}

/* every field of a record, primitives first; nested objects one level down as "Parent · field" */
export function Fields({ obj, skip = [], only }) {
  if (!obj || typeof obj !== 'object') return null;
  const rows = [];
  const add = (k, v, prefix) => {
    if (skip.includes(k) && !prefix) return;
    if (v && typeof v === 'object' && !Array.isArray(v) && !('amount' in v)) {
      if (prefix) { rows.push([prefix + ' · ' + label(k), nameOf(v)]); return; }
      Object.entries(v).forEach(([k2, v2]) => add(k2, v2, label(k)));
      return;
    }
    if (Array.isArray(v) && v.some(x => x && typeof x === 'object') && !prefix) return;   // lists get their own section
    rows.push([(prefix ? prefix + ' · ' : '') + label(k), v, k]);
  };
  Object.entries(obj).filter(([k]) => !only || only.includes(k)).forEach(([k, v]) => add(k, v, ''));
  if (!rows.length) return <p className="muted">Nothing to show.</p>;
  return <dl className="adm-kv">{rows.map(([k, v, raw], i) => <div key={k + i}><dt>{k}</dt><dd>{fmt(raw || k, v)}</dd></div>)}</dl>;
}
/* the record's lists of objects (orders, reports, sessions, ...) as small tables */
export function Lists({ obj, skip = [] }) {
  if (!obj || typeof obj !== 'object') return null;
  const lists = Object.entries(obj).filter(([k, v]) => !skip.includes(k) && Array.isArray(v) && v.some(x => x && typeof x === 'object'));
  return lists.map(([k, v]) => <section className="card adm-card" key={k}><h2 className="t-h3">{label(k)}<span className="adm-n num">{v.length}</span></h2><Table rows={v} /></section>);
}
export function Table({ rows, cols, max = 8 }) {
  if (!rows || !rows.length) return <p className="muted">None.</p>;
  const keys = cols || [...new Set(rows.flatMap(r => Object.keys(r || {}).filter(k => r[k] == null || typeof r[k] !== 'object' || 'amount' in r[k] || !Array.isArray(r[k]))))].slice(0, max);
  return (
    <div className="adm-table-w"><table className="adm-table"><thead><tr>{keys.map(k => <th key={k} scope="col">{label(k)}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={(r && r.id) || i}>{keys.map(k => <td key={k}>{fmt(k, r && r[k])}</td>)}</tr>)}</tbody></table></div>
  );
}

/* ---------- statuses ---------- */
const TONE = {
  ok: /^(approved|verified|live|active|released|completed|complete|paid|resolved|kept|visible|ok|valid|intact|healthy|delivered|success|succeeded|closed)$/,
  warn: /^(pending|pending_review|review|under_review|in_review|submitted|info_requested|action_needed|flagged|hidden|open|in_escrow|escrow|held|processing|disputed|warned|queued|scheduled|in_progress|frozen)$/,
  err: /^(rejected|removed|suspended|refunded|failed|blocked|broken|invalid|cancelled|canceled|banned|deleted|tampered|expired)$/
};
export function Status({ s, text }) {
  const v = str(s).toLowerCase();
  if (!v) return null;
  const cls = TONE.ok.test(v) ? 'pill-ok' : TONE.err.test(v) ? 'pill-err' : TONE.warn.test(v) ? 'pill-warn' : 'pill-paper';
  return <span className={`pill ${cls}`}>{text || label(v)}</span>;
}

/* a list row: link or button, title, subtitle, right side */
export function Row({ href, onClick, kind, title, sub, right, pills }) {
  const inner = <>
    {kind ? <span className={`avatar ${kind === 'brand' ? 'v' : ''} adm-av`} aria-hidden="true">{L.initials(title)}</span> : null}
    <span className="adm-row-t"><b>{title}</b>{sub ? <span>{sub}</span> : null}</span>
    {pills ? <span className="adm-row-p">{pills}</span> : null}
    {right != null ? <span className="adm-row-r">{right}</span> : null}
    {href || onClick ? <span className="adm-row-go"><Icon n="chevron" /></span> : null}
  </>;
  return <li>{href ? <a className="adm-row" href={href}>{inner}</a> : onClick ? <button className="adm-row" type="button" onClick={onClick}>{inner}</button> : <div className="adm-row">{inner}</div>}</li>;
}

/* ---------- the decision sheet ----------
   decide({ title, intro, fields, confirm, tone, run, done })
   fields: [{ k, label, type: 'textarea'|'input'|'checks'|'select', min, required, help, options: [[value, label]], value }]
   run(values) does the call; done(result, values) runs after it succeeds. The sheet stays open on errors. */
function Decision({ o, close }) {
  const [vals, setVals] = useState(() => Object.fromEntries((o.fields || []).map(f => [f.k, f.value ?? (f.type === 'checks' ? [] : '')])));
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState('');
  const form = useRef(null);
  const set = (k, v) => { setVals(s => ({ ...s, [k]: v })); setErrs(s => ({ ...s, [k]: '' })); };
  const submit = async ev => {
    ev.preventDefault();
    if (busy) return;
    const bad = {};
    (o.fields || []).forEach(f => {
      const v = vals[f.k];
      if (f.type === 'checks') { if (f.required && !v.length) bad[f.k] = 'Pick at least one.'; return; }
      const t = String(v || '').trim();
      if (f.required && !t) bad[f.k] = `Enter ${f.label.toLowerCase()}.`;
      else if (f.min && t && t.length < f.min) bad[f.k] = `At least ${f.min} characters (${t.length} so far).`;
      else if (f.min && f.required && t.length < f.min) bad[f.k] = `At least ${f.min} characters.`;
    });
    if (Object.values(bad).some(Boolean)) { flushSync(() => setErrs(bad)); const i = form.current.querySelector('.field.is-err input, .field.is-err textarea'); i && i.focus(); return; }
    const clean = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length && !(o.fields.find(f => f.k === k) || {}).keepEmpty)));
    flushSync(() => { setBusy(true); setApiErr(''); });
    try {
      const r = await o.run(clean);
      close();
      L.toast(o.toast || 'Done', 'check');
      o.done && o.done(r, clean);
    } catch (e) { flushSync(() => { setBusy(false); setApiErr(errText(e)); }); }
  };
  return (
    <form className="adm-sheet stack" noValidate ref={form} onSubmit={submit}>
      {o.intro ? <div className="adm-intro">{typeof o.intro === 'string' ? <p>{o.intro}</p> : o.intro}</div> : null}
      {(o.fields || []).map(f => {
        const id = 'adm-f-' + f.k, v = vals[f.k];
        if (f.type === 'checks') return (
          <fieldset className={'field adm-checks' + (errs[f.k] ? ' is-err' : '')} key={f.k}><legend className="lab">{f.label}</legend>
            {f.options.map(([ov, ot]) => <label className="check" key={ov}><input type="checkbox" checked={v.includes(ov)} onChange={e => set(f.k, e.target.checked ? [...v, ov] : v.filter(x => x !== ov))} /><span>{ot}</span></label>)}
            <p className="err" aria-live="polite">{errs[f.k] || ''}</p></fieldset>);
        const common = { id, value: v, 'aria-invalid': errs[f.k] ? 'true' : undefined, 'aria-describedby': id + '-e', onChange: e => set(f.k, e.target.value) };
        return (
          <div className={'field' + (errs[f.k] ? ' is-err' : '')} key={f.k}><label htmlFor={id}>{f.label + (f.required ? '' : ' (optional)')}</label>
            {f.type === 'textarea' ? <textarea className="textarea" rows={3} maxLength={f.max || 2000} {...common} />
              : f.type === 'select' ? <select className="select" data-native="" {...common}>{f.options.map(([ov, ot]) => <option value={ov} key={ov}>{ot}</option>)}</select>
              : <input className="input" type="text" autoComplete="off" maxLength={f.max || 500} {...common} />}
            {f.help ? <p className="help">{f.help}</p> : null}
            <p className="err" id={id + '-e'} aria-live="polite">{errs[f.k] || ''}</p></div>);
      })}
      {apiErr ? <p className="adm-apierr" role="alert"><Icon n="alert" /><span>{apiErr}</span></p> : null}
      <div className="row wrap adm-sheet-a">
        <Lq type="submit" className={o.tone === 'danger' ? 'lq-coral' : 'lq-p'} disabled={busy}>{busy ? 'Working…' : (o.confirm || 'Confirm')}</Lq>
        <button className="btn-q" type="button" onClick={() => close()}>Cancel</button>
      </div>
    </form>
  );
}
export const decide = o => L.openSheet({ title: o.title, wide: o.wide, body: s => <Decision o={o} close={s.close} /> });

/* a reason field, the shape most admin actions take */
export const reason = (min = 4, lbl = 'Reason', help) => ({ k: 'reason', label: lbl, type: 'textarea', required: true, min, help: help || `Recorded in the audit log. At least ${min} characters.` });
export const note = () => ({ k: 'note', label: 'Internal note', type: 'textarea', help: 'Only admins see this.' });

/* action button that opens a decision, switched off when the role cannot */
export const ActBtn = ({ area, ic, children, onClick, tone = 's', disabled }) => {
  const ok = can(area) && !disabled;
  return <Lq className={`lq-${tone} lq-sm`} onClick={ok ? onClick : undefined} disabled={!ok} aria-disabled={!ok ? 'true' : undefined} title={!can(area) ? `Needs the ${whoCan(area)} role` : undefined}>{ic ? <Icon n={ic} className="ic" /> : null}{children}</Lq>;
};
