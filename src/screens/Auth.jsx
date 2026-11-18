/* Sign-in (#login, #login-out, #login-expired) for the Super Admin console. Focus shell, no auth needed.
   An admin signs in with the email and password of their Linkloom account, through the website's own
   POST /v1/auth/login/. Only an account whose role is "admin" gets in; any other account's tokens are thrown away.
   The backend has no authenticator (second) step for admins yet, so sign-in is one step.
   Also exports:
   - signOut({ param })     ends this session on the API, lands on #login-out
   - enterLive(user)        opens the console as that admin */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { login as apiLogin, logout as apiLogout, whenSessionEnds } from '../lib/api.js';
import { forgetSession, ensureVerifications } from '../lib/live.js';

/* the email domain admins must use; VITE_ADMIN_EMAIL_DOMAIN="" lets any address try */
const DOMAIN = import.meta.env.VITE_ADMIN_EMAIL_DOMAIN ?? 'linkloom.in';

/* ---------- session ---------- */
export function enterLive(user) {
  const name = user.fullName || user.displayName || user.email || 'Admin';
  store.set(s => {
    s.session.signedIn = true; s.session.live = true; s.session.since = new Date().toISOString();
    s.me = { id: String(user.id || ''), name, email: user.email || '', role: 'Admin' };
  }, 'signed-in');
  ensureVerifications();                                   // so the side menu counts the real queue at once
}
function endLive() {
  forgetSession();
  store.set(s => { s.session.signedIn = false; s.session.live = false; s.me = { id: '', name: '', email: '', role: '' }; }, 'signed-out');
}
/* the API refused the admin's token and could not refresh it: back to sign-in */
whenSessionEnds(() => { if (store.s.session.signedIn) { endLive(); L.closeSheet(true); L.go('#login-expired'); } });

export function signOut(opts = {}) {
  apiLogout();
  endLive();
  L.closeSheet(true);
  L.go('#login-' + (opts.param || 'out'));
}

/* ---------- pieces ---------- */
const Note = ({ kind, ic, children, ...attrs }) => <div className={`auth-note auth-note-${kind}`} {...attrs}><Icon n={ic} /><div>{children}</div></div>;
const Offline = ({ online }) => <Note kind="err" ic="alert" data-offline="" role="status" hidden={online}><p>You're offline. Check your connection, then try again.</p></Note>;
const Art = () => (
  <section className="focus-art dark auth-art" aria-label="Linkloom admin console">
    <p className="auth-brand"><img src="assets/logo-mark.svg" width="28" height="28" alt="" /><span>linkloom</span><span className="auth-for">Admin</span></p>
    <h2 className="t-display auth-line">Keep the marketplace honest.</h2>
    <ul className="auth-facts" aria-label="How this console works">
      <li><Icon n="shield" /><span>Only Linkloom admin accounts can sign in</span></li>
      <li><Icon n="verified" /><span>Creators and brands are verified here first</span></li>
      <li><Icon n="lock" /><span>Closing the tab signs you out</span></li>
    </ul>
    <img className="auth-rings" src="assets/admin-rings.svg" width="420" height="310" alt="" />
    <p className="auth-art-foot">Restricted to Linkloom staff.</p>
  </section>
);

const FLASH = {
  out: ['info', 'logout', 'You\'re signed out on this device.'],
  expired: ['info', 'clock', 'Your session ended. Sign in again to continue.']
};

function Login({ param }) {
  const [signedIn] = useState(() => store.s.session.signedIn);     // already in: go straight to the console
  const [online, setOnline] = useState(() => navigator.onLine);
  const [errs, setErrs] = useState({});
  const [apiErr, setApiErr] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showFlash] = useState(() => !!FLASH[param]);
  const email = useRef(null), pw = useRef(null), form = useRef(null), live = useRef(null);
  const alive = useRef(true);
  useLayoutEffect(() => { if (signedIn) location.replace('#home'); }, []);
  useEffect(() => {
    alive.current = true;
    const onNet = () => setOnline(navigator.onLine);
    addEventListener('online', onNet); addEventListener('offline', onNet);
    return () => { alive.current = false; removeEventListener('online', onNet); removeEventListener('offline', onNet); };
  }, []);
  if (signedIn) return null;
  const say = t => { live.current.textContent = t; };
  const clr = id => setErrs(e => (e[id] ? { ...e, [id]: null } : e));

  const signIn = async (ev, pv) => {
    flushSync(() => { setBusy(true); setApiErr(''); });
    try {
      const user = await apiLogin(ev, pv);
      if (!alive.current) return;
      enterLive(user);
      say('Signed in. Opening the console.');
      L.go('#home');
    } catch (err) {
      if (!alive.current) return;
      flushSync(() => setBusy(false));
      const code = err && err.code, st = err && err.status;
      if (code === 'NOT_ADMIN') { flushSync(() => setErrs({ email: 'This Linkloom account is not an admin account.' })); email.current.focus(); return; }
      if (code === 'RATE_LIMITED' || st === 429) { flushSync(() => setApiErr('Too many sign-in attempts. Wait a minute, then try again.')); return; }
      if (code === 'NETWORK' || !st || st >= 500) { flushSync(() => setApiErr('Could not reach Linkloom. Check your connection, then try again in a minute.')); return; }
      flushSync(() => setErrs({ pw: 'That email and password don\'t match.' }));
      pw.current.value = ''; pw.current.focus(); mo('shake', pw.current.parentElement);
    }
  };
  const submit = e => {
    e.preventDefault();
    if (busy || !navigator.onLine) return;
    const ev = email.current.value.trim().toLowerCase(), pv = pw.current.value;
    const bad = {};
    if (!ev) bad.email = 'Enter your work email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ev)) bad.email = 'That email looks incomplete.';
    else if (DOMAIN && !ev.endsWith('@' + DOMAIN)) bad.email = <>Admin accounts use a <b>{'@' + DOMAIN}</b> address.</>;
    if (!pv) bad.pw = 'Enter your password.';
    if (bad.email || bad.pw) { flushSync(() => setErrs(bad)); const i = form.current.querySelector('.field.is-err input'); i && i.focus(); return; }
    signIn(ev, pv);
  };

  return (
    <div className="focus auth">
      <Art />
      <section className="focus-form light auth-form">
        <div className="auth-in" data-host="">
          <div className="auth-head"><h1 className="t-h1" tabIndex={-1} data-h="">Admin sign-in</h1>
            <p className="muted">Use the email and password of your Linkloom admin account.</p></div>
          {showFlash ? <Note kind={FLASH[param][0]} ic={FLASH[param][1]} role="status"><p>{FLASH[param][2]}</p></Note> : null}
          <Offline online={online} />
          <form className="auth-stack" noValidate data-form="" onSubmit={submit} ref={form}>
            <div className={'field' + (errs.email ? ' is-err' : '')} data-f="email"><label htmlFor="auth-email">Work email</label>
              <input className="input" id="auth-email" type="email" autoComplete="username" spellCheck="false" autoCapitalize="off" placeholder={DOMAIN ? 'name@' + DOMAIN : 'name@example.com'} aria-describedby="auth-email-e" aria-invalid={errs.email ? 'true' : undefined} ref={email} onInput={() => clr('email')} />
              <p className="err" id="auth-email-e" aria-live="polite">{errs.email || null}</p></div>
            <div className={'field' + (errs.pw ? ' is-err' : '')} data-f="pw"><label htmlFor="auth-pw">Password</label>
              <div className="auth-pw"><input className="input" id="auth-pw" type={show ? 'text' : 'password'} autoComplete="current-password" spellCheck="false" autoCapitalize="off" maxLength={128} aria-describedby="auth-pw-e" aria-invalid={errs.pw ? 'true' : undefined} ref={pw} onInput={() => clr('pw')} />
                <button type="button" className={'auth-eye' + (show ? ' is-on' : '')} data-eye="" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(v => !v)}><Icon n="eye" /></button></div>
              <p className="err" id="auth-pw-e" aria-live="polite">{errs.pw || null}</p></div>
            <div data-status="">{apiErr ? <Note kind="err" ic="alert" role="status"><p>{apiErr}</p></Note> : null}</div>
            <div className="auth-acts"><Lq type="submit" className="lq-p auth-go" data-submit="" disabled={busy}>{busy ? 'Signing in…' : <>Sign in <Icon n="arrow" className="ic" /></>}</Lq></div>
          </form>
          <p className="auth-legal">Forgot your password? Reset it from the Linkloom website's sign-in page.</p>
        </div>
        <p className="sr-only" aria-live="polite" data-live="" ref={live}></p>
      </section>
    </div>
  );
}

L.register('login', { title: 'Admin sign-in', shell: 'focus', auth: false, Component: Login });
