/* Security (#security): the signed-in admin's own account.
   Connected: who you are (GET /v1/auth/me/), change password (POST /v1/auth/password/change/), sign out of this
   device (POST /v1/auth/logout/) and of every device (POST /v1/auth/logout-all/).
   Your sessions: GET /v1/admin/users/<you>/sessions/, revoke with POST .../sessions/revoke/.
   Not connected: the admin team list and authenticator (MFA) set-up, which have no endpoint yet. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { get, request, clearAuth } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { NotConnectedNote } from '../components/NotConnected.jsx';
import { useLoad, Table, decide, errText } from '../components/Admin.jsx';
import { api, ROLE_NAME } from '../lib/admin.js';
import { signOut } from './Auth.jsx';

const MIN = 8;                                             // the API's own minimum length

function PasswordForm({ close }) {
  const form = useRef(null), cur = useRef(null), nw = useRef(null), rep = useRef(null);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const clr = k => setErrs(e => (e[k] ? { ...e, [k]: '' } : e));
  const fail = bad => { flushSync(() => { setErrs(bad); setBusy(false); }); const i = form.current.querySelector('.field.is-err input'); i && i.focus(); };
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const c = cur.current.value, n = nw.current.value, bad = {};
    if (!c) bad.cur = 'Enter your current password.';
    if (n.length < MIN) bad.new = `Use at least ${MIN} characters.`;
    else if (n === c) bad.new = 'Pick a password you haven\'t used before.';
    if (!bad.cur && !bad.new && rep.current.value !== n) bad.rep = 'The two passwords don\'t match.';
    if (bad.cur || bad.new || bad.rep) { fail(bad); return; }
    flushSync(() => setBusy(true));
    try {
      await request('/v1/auth/password/change/', { method: 'POST', body: { currentPassword: c, password: n, confirmPassword: n } });
      close(); L.toast('Password changed', 'check');
    } catch (err) {
      const d = (err && err.details) || {};
      const msg = k => (Array.isArray(d[k]) ? d[k][0] : typeof d[k] === 'string' ? d[k] : '');
      if (msg('currentPassword')) fail({ cur: msg('currentPassword') });
      else if (msg('password') || msg('confirmPassword')) fail({ new: msg('password') || msg('confirmPassword') });
      else fail({ cur: (err && err.status >= 500) || !(err && err.status) ? 'Could not reach Linkloom. Try again in a minute.' : ((err && err.message) || 'That didn\'t work. Try again.') });
    }
  };
  const field = (k, id, label, ref, extra) => (
    <div className={'field' + (errs[k] ? ' is-err' : '')} data-f={k}><label htmlFor={id}>{label}</label>
      <input className="input" id={id} type="password" ref={ref} aria-invalid={errs[k] ? 'true' : undefined} aria-describedby={id + '-e'} onInput={() => clr(k)} {...extra} />
      <p className="err" id={id + '-e'} aria-live="polite">{errs[k] || ''}</p></div>
  );
  return (
    <form className="sec-pw" noValidate ref={form} onSubmit={submit}>
      {field('cur', 'sec-cur', 'Current password', cur, { autoComplete: 'current-password' })}
      {field('new', 'sec-new', 'New password', nw, { autoComplete: 'new-password', maxLength: 128 })}
      {field('rep', 'sec-rep', 'Type it again', rep, { autoComplete: 'new-password', maxLength: 128 })}
      <p className="sec-pw-n"><Icon n="info" /><span>{`At least ${MIN} characters. Your other devices may need to sign in again.`}</span></p>
      <div className="sec-acts"><Lq type="submit" className="lq-p" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</Lq><button className="btn-q" type="button" data-cancel="" onClick={() => close()}>Cancel</button></div>
    </form>
  );
}
const changePassword = () => L.openSheet({ title: 'Change password', body: o => <PasswordForm close={o.close} /> });

function SignOutAll({ close }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    flushSync(() => { setBusy(true); setErr(''); });
    try { await request('/v1/auth/logout-all/', { method: 'POST' }); clearAuth(); close(true); signOut(); }
    catch (e) { flushSync(() => { setBusy(false); setErr('That didn\'t go through. Try again in a minute.'); }); }
  };
  return (
    <div className="sec-pw">
      <p>Every device signed in to your Linkloom account is signed out, including this one, the website and the apps. You'll need your password to come back.</p>
      {err ? <p className="err" role="alert">{err}</p> : null}
      <div className="sec-acts"><Lq className="lq-p" onClick={go} disabled={busy}>{busy ? 'Signing out…' : 'Sign out everywhere'}</Lq><button className="btn-q" type="button" onClick={() => close()}>Cancel</button></div>
    </div>
  );
}
const signOutAll = () => L.openSheet({ title: 'Sign out of every device?', body: o => <SignOutAll close={o.close} /> });

const SES_COLS = ['device', 'userAgent', 'ip', 'ipAddress', 'location', 'createdAt', 'lastSeenAt', 'lastUsedAt', 'expiresAt', 'current'];
function MySessions({ id }) {
  const r = useLoad(() => (id ? api.sessions(id) : Promise.resolve({ rows: [] })), [id]);
  const others = () => decide({ title: 'Revoke your other sessions?', confirm: 'Revoke', tone: 'danger', toast: 'Sessions revoked',
    intro: 'Every session of your account is blacklisted, including this one; you will be signed out.',
    run: () => api.revokeSessions(id, { reason: 'Revoked by the account owner from Security' }), done: () => signOut() });
  const rows = r.data ? r.data.rows : [];
  const have = new Set(rows.flatMap(x => Object.keys(x || {})));
  const cols = SES_COLS.filter(k => have.has(k));
  return <>
    {r.err ? <p className="muted">{errText(r.err)}</p> : r.loading ? <p className="muted">Loading your sessions.</p>
      : rows.length ? <Table rows={rows} cols={cols.length ? cols : undefined} /> : <p className="muted">No active sessions listed.</p>}
    {id ? <button className="btn-q" type="button" onClick={others}>Revoke every session</button> : null}
  </>;
}

export default function Security() {
  const root = useRef(null);
  const me = store.s.me;
  const [acct, setAcct] = useState(null);                  // the account as the API has it now
  useEffect(() => {
    let on = true;
    get('/v1/auth/me/').then(d => on && setAcct((d && d.user) || d || null), () => {});
    return () => { on = false; };
  }, []);
  useLayoutEffect(() => { mo('stagger', L.$$('.sec-card, .sec-mfa', root.current)); }, []);
  const a = acct || {};
  const name = a.fullName || me.name, email = a.email || me.email;
  return (
    <div className="view-in sec no-anchor" ref={root}>
      <header className="page-h">
        <div className="t"><p className="t-eyebrow">Your admin account</p><h1 className="t-h1">Security</h1>
          <p className="muted sec-lede">Your account, your password, and where you are signed in.</p></div>
        <Lq className="lq-s sec-out-top" data-out="" onClick={() => signOut()}><Icon n="logout" className="ic" />Sign out</Lq>
      </header>

      <div className="sec-grid">
        <div className="sec-main">
          <section className="card sec-card" aria-labelledby="secMeH">
            <div className="sec-h"><div><h2 className="t-h3" id="secMeH">Your account</h2></div></div>
            <dl className="sec-kv">
              <div><dt>Name</dt><dd>{name || '—'}</dd></div>
              <div><dt>Email</dt><dd>{email || '—'}{a.emailVerified === false ? ' · not verified' : ''}</dd></div>
              {a.phone ? <div><dt>Phone</dt><dd className="num">{a.phone}</dd></div> : null}
              <div><dt>Role</dt><dd>{a.role ? a.role.charAt(0).toUpperCase() + a.role.slice(1) : 'Admin'}</dd></div>
              <div><dt>Admin role</dt><dd>{ROLE_NAME[a.adminRole || me.adminRole] || a.adminRole || me.adminRole || '—'}</dd></div>
            </dl>
          </section>
          <section className="card sec-card" aria-labelledby="secSesH">
            <div className="sec-h"><div><h2 className="t-h3" id="secSesH">Where you are signed in</h2></div></div>
            <MySessions id={me.id || a.id} />
          </section>
          <section className="card sec-card" aria-labelledby="secTeamH">
            <div className="sec-h"><div><h2 className="t-h3" id="secTeamH">Admin team</h2></div></div>
            <NotConnectedNote what="The admin team list" needs={['GET /v1/admin/team/']} />
          </section>
        </div>

        <aside className="sec-side">
          <section className="ink-card dark sec-mfa" aria-labelledby="secMfaH">
            <p className="t-eyebrow">Two-step sign-in</p>
            <h2 className="t-h2" id="secMfaH">On for every admin</h2>
            <p className="sec-mfa-f"><Icon n="info" /><span>You sign in with your password and then a 6-digit code from your authenticator app. Setting up or resetting an app has no endpoint yet.</span></p>
          </section>

          <section className="card sec-card sec-pol" aria-labelledby="secPolH">
            <div className="sec-h"><h2 className="t-h3" id="secPolH">Password</h2></div>
            <p className="muted t-small">{`Change the password of your Linkloom account. It must be at least ${MIN} characters.`}</p>
            <Lq className="lq-s lq-sm" data-pw="" onClick={changePassword}>Change password</Lq>
          </section>

          <section className="card sec-card sec-out" aria-labelledby="secOutH">
            <h2 className="t-h3" id="secOutH">Sign out</h2>
            <p className="muted t-small">Sign out of this tab, or of every device signed in to your account.</p>
            <Lq className="lq-p" data-out="" onClick={() => signOut()}><Icon n="logout" className="ic" />Sign out of this device</Lq>
            <button className="btn-q" type="button" data-outall="" onClick={signOutAll}>Sign out of every device</button>
          </section>
        </aside>
      </div>
    </div>
  );
}

L.register('security', { title: 'Security', nav: 'security', Component: Security });
