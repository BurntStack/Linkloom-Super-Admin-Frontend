/* Audit log (#audit). Every admin action, with its reason, sealed in a SHA-256 hash chain. super_admin only.
   - GET /v1/admin/system/audit-log/?q=&action=&actor=&from=&to=&limit=&cursor=
   - GET /v1/admin/system/audit-log/verify/     checks the chain end to end
   - GET /v1/admin/system/audit-log/export/     CSV export (same filters) */
import { useRef, useState } from 'react';
import L, { data } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { api, str, pick, nameOf, label } from '../lib/admin.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { usePaged, useStagger, Failed, Loading, Empty, More, Fields, RoleNote, Head, errText, when } from '../components/Admin.jsx';

const ui = () => (data.ui.audit = data.ui.audit || { q: '', action: '', from: '', to: '' });

function Chain() {
  const [st, setSt] = useState({ busy: false, r: null, err: null });
  const run = async () => {
    setSt({ busy: true, r: null, err: null });
    try { setSt({ busy: false, r: await api.verifyAudit(), err: null }); } catch (e) { setSt({ busy: false, r: null, err: e }); }
  };
  const r = st.r, ok = r && (typeof r === 'boolean' ? r : r.valid ?? r.ok ?? r.intact ?? (typeof r.status === 'string' ? /ok|valid|intact/i.test(r.status) : null));
  return (
    <section className={`adm-chain ${st.err || ok === false ? 'is-err' : ok ? 'is-ok' : 'is-idle'}`} aria-live="polite">
      <Icon n={st.err || ok === false ? 'alert' : 'shield'} />
      <div className="stack" style={{ gap: 8, flex: 1 }}>
        <b>{st.busy ? 'Checking every entry…' : st.err ? 'The check did not run.' : ok === true ? 'The hash chain is intact.' : ok === false ? 'The hash chain is broken.' : 'Check that nothing in the log was changed after the fact.'}</b>
        {st.err ? <span>{errText(st.err)}</span> : r && typeof r === 'object' ? <Fields obj={r} /> : null}
      </div>
      <Lq className="lq-s lq-sm" onClick={run} disabled={st.busy}>{st.busy ? 'Checking…' : 'Verify chain'}</Lq>
    </section>
  );
}

function Entry({ e }) {
  const [open, setOpen] = useState(false);
  const actor = nameOf(pick(e.actor, e.admin, e.user, e.performedBy)) || 'System';
  const action = str(pick(e.action, e.event, e.type, e.verb));
  const target = [str(pick(e.targetType, e.entityType, e.resourceType)), str(pick(e.targetId, e.entityId, e.resourceId))].filter(Boolean).join(' ');
  return (
    <li>
      <button className="adm-row" type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <span className="adm-row-t"><b>{label(action || 'action')}</b><span>{[actor, target, str(pick(e.reason, e.note))].filter(Boolean).join(' · ')}</span></span>
        <span className="adm-row-r t-small muted">{when(pick(e.createdAt, e.at, e.timestamp))}</span>
        <span className="adm-row-go"><Icon n={open ? 'down' : 'chevron'} /></span>
      </button>
      {open ? <div className="card adm-card" style={{ marginTop: 8 }}><Fields obj={e} /></div> : null}
    </li>
  );
}

function Audit() {
  const root = useRef(null);
  const rerender = useRerender();
  const u = ui();
  const [f, setF] = useState({ ...u });
  const [busy, setBusy] = useState(false);
  const query = { q: u.q, action: u.action, from: u.from, to: u.to };
  const p = usePaged(api.auditLog, query);
  useStagger(root, '.adm-row', [p.loading, JSON.stringify(query)]);
  const apply = e => { e.preventDefault(); Object.assign(u, f); rerender(); };
  const exp = async () => { setBusy(true); try { await api.exportAudit(query); L.toast('Export downloaded', 'download'); } catch (er) { L.toast(errText(er), 'alert'); } setBusy(false); };
  const inp = (k, lbl, type = 'text', ph) => <div className="field" style={{ flex: '1 1 160px' }}><label htmlFor={'au-' + k}>{lbl}</label><input className="input" id={'au-' + k} type={type} placeholder={ph} value={f[k]} onChange={e => setF(s => ({ ...s, [k]: e.target.value }))} /></div>;
  return (
    <div className="view-in adm" ref={root}>
      <Head eyebrow="Platform financials & audit" title="Audit log" lede="Every admin action and its reason, sealed in a SHA-256 hash chain.">
        <Lq className="lq-s lq-sm" onClick={exp} disabled={busy}><Icon n="download" className="ic" />{busy ? 'Exporting…' : 'Export CSV'}</Lq>
      </Head>
      <RoleNote area="audit" doing="Reading the audit log" />
      <Chain />
      <form className="row wrap" style={{ alignItems: 'flex-end', gap: 12 }} onSubmit={apply}>
        {inp('q', 'Search', 'search', 'Admin, target or reason')}{inp('action', 'Action', 'text', 'e.g. order.refund')}{inp('from', 'From', 'date')}{inp('to', 'To', 'date')}
        <Lq type="submit" className="lq-p lq-sm">Apply</Lq>
      </form>
      {p.err ? <Failed err={p.err} retry={p.reload} what="The audit log" /> : p.loading ? <Loading what="the audit log" />
        : p.rows.length ? <ul className="adm-list no-anchor">{p.rows.map((e, i) => <Entry e={e} key={e.id || i} />)}</ul>
        : <Empty title="No entries match." />}
      <More p={p} />
    </div>
  );
}

L.register('audit', { title: 'Audit log', nav: 'audit', Component: Audit });
