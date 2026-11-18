/* Accounts (#accounts, #creator-<id>, #brand-<id>).
   - GET   /v1/admin/users/creators/?q=&status=&kyc=&badge=&featured=&hasReports=   creators
   - GET   /v1/admin/users/creators/<id>/      profile, fulfilment metrics, orders, abuse reports
   - PATCH /v1/admin/users/creators/<id>/      { badges, tags, featured }
   - GET   /v1/admin/users/brands/?q=&status=&verified=&postingSpike=&hasReports=
   - GET   /v1/admin/users/brands/<id>/        brand profile, statutory fields (PAN, CIN), campaign stats
   - POST  /v1/admin/users/<user_id>/suspend/ { reason, note }, /reactivate/ { reason }, /password-reset/,
     GET /v1/admin/users/<user_id>/sessions/, POST /v1/admin/users/<user_id>/sessions/revoke/
   Classes are .acc-* and .adm-*. */
import { useEffect, useRef, useState } from 'react';
import L, { data } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { api, can, str, pick, num, arr, nameOf, userIdOf } from '../lib/admin.js';
import Av from '../components/Av.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { usePaged, useLoad, useStagger, Failed, Loading, Empty, More, Row, Status, Fields, Lists, Table, RoleNote, ActBtn, Seg, decide, reason, note, errText } from '../components/Admin.jsx';

const ui = () => (data.ui.accounts = data.ui.accounts || { tab: 'creator', q: '', status: '', kyc: '', featured: '', hasReports: '', verified: '', postingSpike: '' });

/* ---------- reading a creator or brand record ---------- */
export const acct = r => ({
  id: str(r.id), userId: userIdOf(r), uidKnown: !!userIdOf(r),
  name: str(pick(r.displayName, r.brandName, r.fullName, r.name, r.user && nameOf(r.user), 'Unnamed')),
  handle: str(pick(r.handle, r.instagram && '@' + r.instagram, r.youtube && '@' + r.youtube, r.username)),
  email: str(pick(r.email, r.user && r.user.email)), city: str(pick(r.city, r.location)),
  status: str(pick(r.status, r.accountStatus, r.user && r.user.status, r.isSuspended ? 'suspended' : '', r.suspended ? 'suspended' : '')).toLowerCase(),
  kyc: str(pick(r.kycStatus, r.kyc && typeof r.kyc === 'object' ? r.kyc.status : r.kyc)).toLowerCase(),
  verified: !!(r.verified ?? r.isVerified), featured: !!(r.featured ?? r.isFeatured),
  badges: arr(r.badges).map(nameOf), tags: arr(pick(r.tags, r.categories)).map(nameOf),
  reports: num(pick(r.reportCount, r.abuseReportCount, r.openReports, r.reports && typeof r.reports === 'object' && !Array.isArray(r.reports) ? r.reports.open : null, Array.isArray(r.abuseReports) ? r.abuseReports.length : null)),
  spike: !!(r.postingSpike ?? r.hasPostingSpike)
});
const suspended = a => /suspend|banned|disabled/.test(a.status);

/* ---------- list ---------- */
function List() {
  const root = useRef(null);
  const rerender = useRerender();
  const u = ui(), isC = u.tab === 'creator';
  const [q, setQ] = useState(u.q);
  useEffect(() => { const t = setTimeout(() => { if (u.q !== q) { u.q = q; rerender(); } }, 350); return () => clearTimeout(t); }, [q]);
  const query = isC ? { q: u.q, status: u.status, kyc: u.kyc, featured: u.featured, hasReports: u.hasReports } : { q: u.q, status: u.status, verified: u.verified, postingSpike: u.postingSpike, hasReports: u.hasReports };
  const p = usePaged(isC ? api.creators : api.brands, { tab: u.tab, ...query });
  useStagger(root, '.adm-row', [p.loading, u.tab]);
  const set = (k, v) => { u[k] = v; rerender(); };
  const toggle = k => set(k, u[k] ? '' : 'true');
  const rows = p.rows.map(acct);
  const total = num(p.meta && (p.meta.total ?? p.meta.count));
  return (
    <div className="view-in acc adm" ref={root}>
      <header className="page-h acc-head">
        <div className="t"><p className="t-eyebrow">Accounts</p><h1 className="t-h1">People and brands on Linkloom</h1>
          <p className="muted">{total != null ? `${total} ${isC ? 'creator' : 'brand'}${total === 1 ? '' : 's'} match.` : 'Search, check and act on accounts.'}</p></div>
        <div className="adm-search"><Icon n="search" /><label className="sr-only" htmlFor="accQ">Search</label>
          <input className="input" id="accQ" type="search" autoComplete="off" spellCheck="false" placeholder={isC ? 'Name, @handle, email or city' : 'Brand name, email, PAN or CIN'} value={q} onChange={e => setQ(e.target.value)} /></div>
      </header>
      <div className="adm-bar">
        <div className="seg acc-seg" role="group" aria-label="Account type">
          <button type="button" aria-pressed={isC} onClick={() => set('tab', 'creator')}><i className="dot acc-dot-c"></i>Creators</button>
          <button type="button" aria-pressed={!isC} onClick={() => set('tab', 'brand')}><i className="dot acc-dot-b"></i>Brands</button>
        </div>
        <Seg label="Status" value={u.status} onChange={v => set('status', v)} opts={[['', 'Any status'], ['active', 'Active'], ['suspended', 'Suspended']]} />
      </div>
      <div className="chips" role="group" aria-label="Filters">
        {isC ? <>
          {[['verified', 'KYC verified'], ['pending', 'KYC pending'], ['action_needed', 'KYC action needed'], ['rejected', 'KYC rejected']].map(([k, t]) => <button className="chip" type="button" key={k} aria-pressed={u.kyc === k} onClick={() => set('kyc', u.kyc === k ? '' : k)}>{t}</button>)}
          <button className="chip" type="button" aria-pressed={!!u.featured} onClick={() => toggle('featured')}>Featured</button>
        </> : <>
          <button className="chip" type="button" aria-pressed={u.verified === 'true'} onClick={() => set('verified', u.verified === 'true' ? '' : 'true')}>Verified</button>
          <button className="chip" type="button" aria-pressed={u.verified === 'false'} onClick={() => set('verified', u.verified === 'false' ? '' : 'false')}>Not verified</button>
          <button className="chip" type="button" aria-pressed={!!u.postingSpike} onClick={() => toggle('postingSpike')}>Posting spike</button>
        </>}
        <button className="chip" type="button" aria-pressed={!!u.hasReports} onClick={() => toggle('hasReports')}>Has reports</button>
      </div>
      {p.err ? <Failed err={p.err} retry={p.reload} what={isC ? 'Creators' : 'Brands'} />
        : p.loading ? <Loading what={isC ? 'creators' : 'brands'} />
        : rows.length ? <ul className="adm-list no-anchor">{rows.map(a => <Row key={a.id} href={`#${u.tab}-${a.id}`} kind={u.tab} title={a.name}
            sub={[a.handle, a.email, a.city].filter(Boolean).join(' · ')}
            pills={<>{suspended(a) ? <Status s="suspended" /> : null}{a.kyc ? <Status s={a.kyc} text={'KYC ' + a.kyc.replace(/_/g, ' ')} /> : a.verified ? <Status s="verified" /> : null}
              {a.featured ? <span className="pill pill-butter"><Icon n="star" />Featured</span> : null}{a.spike ? <span className="pill pill-warn"><Icon n="chart" />Posting spike</span> : null}
              {a.reports ? <span className="pill pill-err"><Icon n="flag" />{`${a.reports} report${a.reports === 1 ? '' : 's'}`}</span> : null}</>} />)}</ul>
        : <Empty title={`No ${isC ? 'creators' : 'brands'} match`} text="Try another search, or clear the filters." img="step-04-orbit" />}
      <More p={p} />
    </div>
  );
}

/* ---------- account actions (both kinds) ---------- */
function Sessions({ userId }) {
  const r = useLoad(() => api.sessions(userId), [userId]);
  const revoke = () => decide({
    title: 'Sign this account out everywhere?', confirm: 'Revoke all sessions', tone: 'danger', toast: 'Sessions revoked',
    intro: 'Every session and token for this account is blacklisted at once. They need to sign in again.',
    fields: [{ k: 'reason', label: 'Reason', type: 'textarea', min: 4, help: 'Recorded in the audit log.' }],
    run: b => api.revokeSessions(userId, b), done: () => r.reload()
  });
  return (
    <section className="card adm-card" aria-labelledby="accSes"><h2 className="t-h3" id="accSes">Sessions</h2>
      {r.err ? <p className="muted">{errText(r.err)}</p> : r.loading ? <p className="muted">Loading sessions.</p>
        : r.data.rows.length ? <Table rows={r.data.rows} cols={pickCols(r.data.rows, ['device', 'userAgent', 'ip', 'ipAddress', 'location', 'city', 'createdAt', 'lastSeenAt', 'lastUsedAt', 'expiresAt', 'current'])} />
        : <p className="muted">No active sessions.</p>}
      <div className="adm-acts"><ActBtn area="accounts" ic="logout" onClick={revoke}>Revoke all sessions</ActBtn></div>
    </section>
  );
}
const pickCols = (rows, pref) => { const have = new Set(rows.flatMap(r => Object.keys(r || {}))); const c = pref.filter(k => have.has(k)); return c.length ? c : undefined; };

/* a 404 on an account action means the backend has no user with that id: say which id, not "removed" */
const onUser = (a, p) => p.catch(e => { if (e && e.status === 404) { e.status = 0; e.code = "USER_NOT_FOUND"; e.message = `The backend has no user account with id ${a.userId}${a.uidKnown ? "" : " (the API did not send this profile's user id, so its profile id was tried)"}.`; } throw e; });
function Enforce({ a, reload }) {
  const sus = suspended(a);
  const suspend = () => decide({
    title: `Suspend ${a.name}?`, confirm: 'Suspend account', tone: 'danger', toast: 'Account suspended',
    intro: 'Their tokens stop working at once and they cannot sign in until reactivated.',
    fields: [reason(4), note()], run: b => onUser(a, api.suspend(a.userId, b)), done: reload
  });
  const reactivate = () => decide({
    title: `Reactivate ${a.name}?`, confirm: 'Reactivate', toast: 'Account reactivated',
    fields: [reason(4)], run: b => onUser(a, api.reactivate(a.userId, b)), done: reload
  });
  const reset = () => decide({
    title: 'Send a password reset?', confirm: 'Send reset', toast: 'Password reset sent',
    intro: 'This creates a secure reset challenge that lasts 30 minutes. Their current password keeps working until they use it.',
    run: () => onUser(a, api.passwordReset(a.userId))
  });
  return (
    <section className="card adm-card" aria-labelledby="accAct"><h2 className="t-h3" id="accAct">Account</h2>
      <RoleNote area="accounts" doing="Changing accounts" />
      <dl className="adm-kv"><div><dt>Status</dt><dd>{a.status ? <Status s={a.status} /> : 'Active'}</dd></div><div><dt>User id</dt><dd className="num">{a.userId || <span className="err">Not sent by the API: the backend must include userId in this record, so account actions are off</span>}</dd></div>{a.email ? <div><dt>Email</dt><dd>{a.email}</dd></div> : null}</dl>
      <div className="adm-acts">
        {sus ? <ActBtn area="accounts" ic="check" tone="p" disabled={!a.userId} onClick={reactivate}>Reactivate</ActBtn> : <ActBtn area="accounts" ic="lock" disabled={!a.userId} onClick={suspend}>Suspend</ActBtn>}
        <ActBtn area="accounts" ic="send" disabled={!a.userId} onClick={reset}>Password reset</ActBtn>
      </div>
    </section>
  );
}

const csv = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
function Curate({ id, a, reload }) {
  const edit = () => decide({
    title: 'Badges, tags and featured', confirm: 'Save', toast: 'Saved',
    fields: [
      { k: 'badges', label: 'Badges', value: a.badges.join(', '), help: 'Comma-separated, e.g. top_rated, fast_delivery.', keepEmpty: true },
      { k: 'tags', label: 'Tags', value: a.tags.join(', '), help: 'Comma-separated.', keepEmpty: true },
      { k: 'featured', label: 'Featured', type: 'select', value: a.featured ? 'true' : 'false', options: [['true', 'Featured'], ['false', 'Not featured']] }
    ],
    run: v => api.updateCreator(id, { badges: csv(v.badges), tags: csv(v.tags), featured: v.featured === 'true' }), done: reload
  });
  return (
    <section className="card adm-card" aria-labelledby="accCur"><h2 className="t-h3" id="accCur">Curation</h2>
      <dl className="adm-kv">
        <div><dt>Badges</dt><dd>{a.badges.length ? a.badges.join(', ') : <span className="muted">None</span>}</dd></div>
        <div><dt>Tags</dt><dd>{a.tags.length ? a.tags.join(', ') : <span className="muted">None</span>}</dd></div>
        <div><dt>Featured</dt><dd>{a.featured ? 'Yes' : 'No'}</dd></div>
      </dl>
      <div className="adm-acts"><ActBtn area="catalog" ic="edit" onClick={edit}>Edit</ActBtn></div>
    </section>
  );
}

/* ---------- detail ---------- */
function Detail({ kind, id }) {
  const root = useRef(null);
  const r = useLoad(() => (kind === 'creator' ? api.creator(id) : api.brand(id)), [kind, id]);
  useStagger(root, '.adm-card', [!!r.data]);
  const back = <a className="btn-q acc-back" href="#accounts"><Icon n="back" />Accounts</a>;
  if (r.err) return <div className="view-in adm">{back}{r.err.status === 404 ? <Empty title={`No ${kind} with that link.`} text="Search the accounts list instead." img="step-04-orbit" /> : <Failed err={r.err} retry={r.reload} what={kind === 'creator' ? 'This creator' : 'This brand'} />}</div>;
  if (!r.data) return <div className="view-in">{back}<Loading what={`this ${kind}`} /></div>;
  const d = r.data, prof = d.profile && typeof d.profile === 'object' ? { ...d, ...d.profile } : d;
  const a = acct(prof);
  document.title = a.name + ' · Linkloom';
  if (ui().tab !== kind) ui().tab = kind;
  const reload = () => r.reload();
  return (
    <div className="view-in acc acc-d adm" ref={root}>
      {back}
      <header className="adm-mast">
        <Av kind={kind} name={a.name} />
        <div className="adm-mast-t"><p className={`acc-kind acc-kind--${kind === 'brand' ? 'b' : 'c'}`}><i className="dot"></i>{kind === 'brand' ? 'Brand' : 'Creator'}{a.city ? ' · ' + a.city : ''}</p>
          <h1 className="t-h1">{a.name}</h1>
          <p className="row wrap">{a.handle ? <span className="acc-handle">{a.handle}</span> : null}{suspended(a) ? <Status s="suspended" /> : null}{a.kyc ? <Status s={a.kyc} text={'KYC ' + a.kyc.replace(/_/g, ' ')} /> : a.verified ? <Status s="verified" /> : null}{a.featured ? <span className="pill pill-butter"><Icon n="star" />Featured</span> : null}</p></div>
      </header>
      <div className="adm-grid">
        <div className="adm-col">
          <section className="card adm-card"><h2 className="t-h3">{kind === 'brand' ? 'Brand profile' : 'Profile'}</h2><Fields obj={d} skip={['id']} /></section>
          <Lists obj={d} />
        </div>
        <div className="adm-col">
          <Enforce a={a} reload={reload} />
          {kind === 'creator' ? <Curate id={id} a={a} reload={reload} /> : null}
          {a.userId ? <Sessions userId={a.userId} /> : null}
          {kind === 'creator' ? <Lq as="a" className="lq-s lq-sm" href={`#marketplace-featured`}>Featured order</Lq> : null}
        </div>
      </div>
    </div>
  );
}

L.register('accounts', { title: 'Accounts', nav: 'accounts', Component: List });
L.register('creator', { title: 'Creator', nav: 'accounts', Component: ({ param }) => <Detail kind="creator" id={param} key={param} /> });
L.register('brand', { title: 'Brand', nav: 'accounts', Component: ({ param }) => <Detail kind="brand" id={param} key={param} /> });
