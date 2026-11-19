/* Support (#support, #ticket-<id>): tickets brands and creators open from "Help & support" on the website.
   - GET   /v1/admin/support/tickets/?status=&topic=&role=&priority=&assignee=&q=   the queue
   - GET   /v1/admin/support/tickets/<id>/                                          one ticket, with internal notes
   - POST  /v1/admin/support/tickets/<id>/reply/ { text }    the user sees it; status → waiting_on_user
   - POST  /v1/admin/support/tickets/<id>/notes/ { text }    admins only
   - POST  /v1/admin/support/tickets/<id>/assign/ { adminId | "me" | null }
   - PATCH /v1/admin/support/tickets/<id>/ { priority?, status? }
   Until the backend has these, the screen says it is not connected yet (404). */
import { useRef, useState } from 'react';
import L, { data } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { api, can, whoCan, str, pick, arr, nameOf, idOf, label } from '../lib/admin.js';
import { refreshCounts } from '../lib/live.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { NotConnectedNote } from '../components/NotConnected.jsx';
import { usePaged, useLoad, useStagger, Failed, Loading, Empty, More, Row, Seg, Head, inr, when, ago, errText } from '../components/Admin.jsx';

const TOPIC = { payments: 'Payments & escrow', deal: 'A deal or delivery', account: 'Account & KYC', marketplace: 'Briefs, bids & pitches', bug: "Something's broken", other: 'Something else' };
const STATUS = { open: 'Open', waiting_on_user: 'Waiting on user', resolved: 'Resolved', closed: 'Closed' };
const PRIORITY = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']];
const ui = () => (data.ui.support = data.ui.support || { status: 'open', role: '', assignee: '' });
const off = e => e && (e.status === 404 || e.status === 405 || e.status === 501);

const statusOf = s => { const v = str(s).toLowerCase(); return /waiting/.test(v) ? 'waiting_on_user' : /resolv/.test(v) ? 'resolved' : /clos/.test(v) ? 'closed' : 'open'; };
const tk = t => {
  const user = t.user && typeof t.user === 'object' ? t.user : {};
  const order = t.order && typeof t.order === 'object' ? t.order : null;
  const n = Number(t.number) || 0;
  return {
    id: str(t.id), ref: n ? `LL-${n}` : `LL-${str(t.id).slice(0, 6).toUpperCase()}`,
    topic: str(t.topic), subject: str(t.subject) || 'Support request', status: statusOf(t.status),
    priority: str(t.priority || 'normal').toLowerCase(),
    role: str(pick(t.role, user.role)).toLowerCase(), who: nameOf(pick(user.name, user.displayName, user.fullName, user.email, t.user)),
    email: str(user.email), userId: idOf(user), profileId: str(pick(user.profileId, user.creatorId, user.brandId)), accountStatus: str(user.accountStatus),
    order: order ? { id: str(order.id), title: str(order.title) || 'Order', status: str(order.status), amount: order.amount } : null,
    assignee: t.assignee ? nameOf(t.assignee) : '', assigneeId: t.assignee ? idOf(t.assignee) : '',
    waitingSince: str(t.waitingSince), updatedAt: str(pick(t.updatedAt, t.createdAt)), createdAt: str(t.createdAt),
    last: t.lastMessage ? str(t.lastMessage.text) : '',
    messages: arr(t.messages).map(m => ({
      id: str(m.id), author: /admin|support|staff/.test(str(m.author).toLowerCase()) ? 'admin' : /system/.test(str(m.author).toLowerCase()) ? 'system' : 'user',
      name: str(pick(m.adminName, m.authorName)), internal: !!m.internal, text: str(pick(m.text, m.body)), at: str(m.createdAt),
      files: arr(m.attachments).map(a => ({ id: str(pick(a.uploadId, a.id)), name: str(pick(a.fileName, a.name)) || 'Attachment' }))
    }))
  };
};
const StatusPill = ({ s }) => <span className={`pill ${s === 'resolved' ? 'pill-ok' : s === 'waiting_on_user' ? 'pill-warn' : s === 'closed' ? 'pill-paper' : 'pill-err'}`}>{STATUS[s]}</span>;
const PrioPill = ({ p }) => (p === 'high' || p === 'urgent' ? <span className={`pill ${p === 'urgent' ? 'pill-err' : 'pill-warn'}`}>{label(p)}</span> : null);
const profileHref = t => (!t.profileId ? '' : t.role === 'brand' ? `#brand-${t.profileId}` : `#creator-${t.profileId}`);

function Queue() {
  const root = useRef(null);
  const rerender = useRerender();
  const u = ui();
  const q = { ...(u.status ? { status: u.status } : {}), ...(u.role ? { role: u.role } : {}), ...(u.assignee ? { assignee: u.assignee } : {}) };
  const p = usePaged(api.supportTickets, q);
  useStagger(root, '.adm-row', [p.loading, u.status, u.role, u.assignee]);
  const rows = p.rows.map(tk);
  return (
    <div className="view-in adm" ref={root}>
      <Head eyebrow="Support" title="Support tickets" lede="Requests brands and creators send from Help & support. Replies reach them in the app and by email; internal notes stay here." />
      <Seg label="Status" value={u.status} onChange={v => { u.status = v; rerender(); }} opts={[['open', 'Open'], ['waiting_on_user', 'Waiting on user'], ['resolved', 'Resolved'], ['closed', 'Closed'], ['', 'All']]} />
      <div className="sup-filters">
        <Seg label="From" value={u.role} onChange={v => { u.role = v; rerender(); }} opts={[['', 'Everyone'], ['brand', 'Brands'], ['creator', 'Creators']]} />
        <Seg label="Assigned" value={u.assignee} onChange={v => { u.assignee = v; rerender(); }} opts={[['', 'Anyone'], ['me', 'Mine'], ['none', 'Unassigned']]} />
      </div>
      {p.err ? (off(p.err) ? <NotConnectedNote what="Support" needs={['GET /v1/admin/support/tickets/', 'GET /v1/admin/support/tickets/<id>/', 'POST …/reply/ · …/notes/ · …/assign/', 'PATCH /v1/admin/support/tickets/<id>/']} /> : <Failed err={p.err} retry={p.reload} what="Support tickets" />)
        : p.loading ? <Loading what="support tickets" />
        : rows.length ? <ul className="adm-list no-anchor">{rows.map(t => <Row key={t.id} href={`#ticket-${t.id}`} title={t.subject}
            sub={[t.ref, t.who && `${t.who}${t.role ? ` (${t.role})` : ''}`, TOPIC[t.topic] || label(t.topic || 'other'), t.assignee ? `with ${t.assignee}` : 'unassigned'].filter(Boolean).join(' · ')}
            pills={<><PrioPill p={t.priority} /><StatusPill s={t.status} /></>}
            right={t.status === 'open' && t.waitingSince ? `waiting ${ago(t.waitingSince).replace(' ago', '')}` : ago(t.updatedAt)} />)}</ul>
        : <Empty title="No tickets here." text="When a brand or creator writes to support, the request lands here." />}
      <More p={p} />
    </div>
  );
}

function Message({ m }) {
  const open = id => api.fileUrl(id).then(d => { const url = d && (d.url || d.downloadUrl || d.signedUrl); if (url) window.open(url, '_blank', 'noopener'); }, e => L.toast(errText(e), 'alert'));
  if (m.author === 'system') return <li className="sup-sys">{m.text}<span className="muted"> · {when(m.at)}</span></li>;
  return (
    <li className={`sup-msg${m.author === 'admin' ? ' is-admin' : ''}${m.internal ? ' is-note' : ''}`}>
      <p className="sup-msg-h"><b>{m.internal ? `Internal note · ${m.name || 'Admin'}` : m.author === 'admin' ? (m.name || 'Linkloom Support') : 'User'}</b><span className="muted">{when(m.at)}</span></p>
      {m.text ? <p className="sup-msg-t">{m.text}</p> : null}
      {m.files.length ? <div className="sup-files">{m.files.map(f => <button key={f.id} type="button" className="sup-file" onClick={() => open(f.id)}><Icon n="paperclip" />{f.name}</button>)}</div> : null}
    </li>
  );
}

function Composer({ t, done }) {
  const [mode, setMode] = useState('reply');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = () => {
    if (!text.trim()) { setErr(mode === 'reply' ? 'Write the reply first.' : 'Write the note first.'); return; }
    setBusy(true); setErr('');
    (mode === 'reply' ? api.supportReply(t.id, { text: text.trim() }) : api.supportNote(t.id, { text: text.trim() })).then(
      () => { setBusy(false); setText(''); L.toast(mode === 'reply' ? `Reply sent on ${t.ref}` : 'Note added'); refreshCounts(); done(); },
      e => { setBusy(false); setErr(errText(e)); });
  };
  const ok = can('support');
  return (
    <section className={`card adm-card sup-compose${mode === 'note' ? ' is-note' : ''}`}>
      <Seg label="Write" value={mode} onChange={setMode} opts={[['reply', 'Reply to user'], ['note', 'Internal note']]} />
      <textarea className="input" rows={5} maxLength={5000} value={text} onChange={e => setText(e.target.value)} disabled={!ok}
        placeholder={mode === 'reply' ? `Reply to ${t.who || 'the user'}. They see this in the app and by email.` : 'Only admins see notes.'} aria-label={mode === 'reply' ? 'Reply' : 'Internal note'} />
      {err ? <p className="err" role="alert">{err}</p> : null}
      <div className="adm-acts"><Lq className="lq-p lq-sm" onClick={send} disabled={busy || !ok} title={!ok ? `Needs the ${whoCan('support')} role` : undefined}><Icon n={mode === 'reply' ? 'send' : 'chat'} className="ic" />{busy ? 'Sending…' : mode === 'reply' ? 'Send reply' : 'Add note'}</Lq></div>
    </section>
  );
}

function Detail({ id }) {
  const root = useRef(null);
  const r = useLoad(() => api.supportTicket(id), [id]);
  useStagger(root, '.adm-card', [!!r.data]);
  const back = <a className="btn-q adm-back" href="#support"><Icon n="back" />Support tickets</a>;
  if (r.err) return <div className="view-in adm">{back}{off(r.err) ? <NotConnectedNote what="Support" needs={['GET /v1/admin/support/tickets/<id>/']} /> : <Failed err={r.err} retry={r.reload} what="This ticket" />}</div>;
  if (!r.data) return <div className="view-in">{back}<Loading what="this ticket" /></div>;
  const t = tk(r.data), me = data.me && data.me.id;
  const act = (p, msg) => p.then(() => { L.toast(msg); refreshCounts(); r.reload(); }, e => L.toast(errText(e), 'alert'));
  const setStatus = (s, msg) => act(api.supportUpdate(t.id, { status: s }), msg);
  const closeOk = can('supportClose');
  const hint = !closeOk ? `Needs the ${whoCan('supportClose')} role` : undefined;
  const href = profileHref(t);
  return (
    <div className="view-in adm" ref={root}>
      {back}
      <Head eyebrow={`${t.ref} · ${TOPIC[t.topic] || label(t.topic || 'other')}`} title={t.subject} lede={[t.who && `From ${t.who}${t.role ? ` (${t.role})` : ''}`, `opened ${when(t.createdAt)}`].filter(Boolean).join(' · ')}>
        <PrioPill p={t.priority} /><StatusPill s={t.status} />
      </Head>
      <div className="adm-grid">
        <div className="adm-col">
          <section className="card adm-card"><h2 className="t-h3">Conversation</h2>
            <ol className="sup-conv">{t.messages.map(m => <Message key={m.id} m={m} />)}</ol>
          </section>
          {t.status === 'closed' ? <section className="card adm-card"><p className="muted">This ticket is closed. The user can open a new one.</p></section> : <Composer t={t} done={r.reload} />}
        </div>
        <div className="adm-col">
          <section className="card adm-card"><h2 className="t-h3">Ticket</h2>
            <div className="adm-acts sup-acts">
              {t.status !== 'resolved' && t.status !== 'closed' ? <Lq className="lq-p lq-sm" disabled={!closeOk} title={hint} onClick={closeOk ? () => setStatus('resolved', `${t.ref} resolved`) : undefined}><Icon n="check" className="ic" />Mark resolved</Lq> : null}
              {t.status === 'open' ? <Lq className="lq-s lq-sm" disabled={!closeOk} title={hint} onClick={closeOk ? () => setStatus('waiting_on_user', 'Marked waiting on user') : undefined}>Waiting on user</Lq> : null}
              {t.status === 'resolved' || t.status === 'closed' || t.status === 'waiting_on_user' ? <Lq className="lq-s lq-sm" disabled={!closeOk} title={hint} onClick={closeOk ? () => setStatus('open', `${t.ref} reopened`) : undefined}>Reopen</Lq> : null}
              {t.status !== 'closed' ? <Lq className="lq-s lq-sm" disabled={!closeOk} title={hint} onClick={closeOk ? () => setStatus('closed', `${t.ref} closed`) : undefined}><Icon n="close" className="ic" />Close</Lq> : null}
            </div>
            <label className="sup-field"><span className="t-small muted">Priority</span>
              <select className="input" value={t.priority} disabled={!closeOk} onChange={e => act(api.supportUpdate(t.id, { priority: e.target.value }), `Priority set to ${label(e.target.value)}`)}>
                {PRIORITY.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <div className="sup-field"><span className="t-small muted">Assigned to</span>
              <div className="sup-assign"><b>{t.assignee || 'Nobody yet'}</b>
                {t.assigneeId && t.assigneeId === me ? <Lq className="lq-s lq-sm" disabled={!closeOk} onClick={closeOk ? () => act(api.supportAssign(t.id, null), 'Unassigned') : undefined}>Unassign</Lq>
                  : <Lq className="lq-s lq-sm" disabled={!closeOk} title={hint} onClick={closeOk ? () => act(api.supportAssign(t.id, 'me'), `${t.ref} assigned to you`) : undefined}><Icon n="user" className="ic" />Assign to me</Lq>}</div></div>
          </section>
          <section className="card adm-card"><h2 className="t-h3">From</h2>
            <p><b>{t.who || 'Unknown user'}</b>{t.role ? <span className="muted">{` · ${label(t.role)}`}</span> : null}</p>
            {t.email ? <p className="muted">{t.email}</p> : null}
            {t.accountStatus ? <p className="muted">{`Account: ${label(t.accountStatus)}`}</p> : null}
            {href ? <a className="btn-q" href={href}>Open their account</a> : null}
          </section>
          {t.order ? <section className="card adm-card"><h2 className="t-h3">Deal</h2>
            <p><b>{t.order.title}</b></p>
            <p className="muted">{[t.order.status && label(t.order.status), t.order.amount != null && inr(t.order.amount)].filter(Boolean).join(' · ')}</p>
            <a className="btn-q" href={`#order-${t.order.id}`}>Open in Orders &amp; escrow</a>
          </section> : null}
        </div>
      </div>
    </div>
  );
}

L.register('support', { title: 'Support', nav: 'support', Component: Queue });
L.register('ticket', { title: 'Support ticket', nav: 'support', Component: ({ param }) => <Detail id={param} key={param} /> });
