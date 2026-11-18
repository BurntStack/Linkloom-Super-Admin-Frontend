/* Sign-in (#login, #login-out, #login-expired) for the Super Admin console. Focus shell, no auth needed.
   Two steps, on the backend's admin endpoints:
   1. email + password       POST /v1/admin/auth/login/       gives an MFA challenge
   2. 6-digit code from the admin's authenticator app
                             POST /v1/admin/auth/mfa/verify/  gives the tokens (aal2)
   Only an account whose role is "admin" gets in. Wrong-attempt counting and lockout are the backend's: the screen
   shows what it says (ACCOUNT_LOCKED with retryAfter, MFA_INVALID, RATE_LIMITED).
   Also exports:
   - signOut({ param })     ends this session on the API (POST /v1/admin/auth/logout/), lands on #login-out
   - enterLive(user)        opens the console as that admin */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { adminLogin, verifyMfa, logout as apiLogout, whenSessionEnds } from '../lib/api.js';
import { forgetSession, startLive } from '../lib/live.js';
import { ROLE_NAME } from '../lib/admin.js';

/* the email domain admins must use; VITE_ADMIN_EMAIL_DOMAIN="" lets any address try */
const DOMAIN = import.meta.env.VITE_ADMIN_EMAIL_DOMAIN ?? 'linkloom.in';
const now = () => Date.now();
const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const maskEmail = e => { const [u, d] = String(e).split('@'); return d ? u.slice(0, 2) + '••••@' + d : e; };
/* seconds the backend asks us to wait, from error.details.retryAfter (or a Retry-After-like field) */
const waitOf = err => { const d = (err && err.details) || {}; const n = Number(d.retryAfter ?? d.retry_after ?? d.lockedFor); return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0; };
const triesOf = err => { const d = (err && err.details) || {}; const n = Number(d.attemptsRemaining ?? d.remainingAttempts ?? d.triesLeft); return Number.isFinite(n) && n >= 0 ? n : null; };
const isNet = err => { const c = err && err.code, st = err && err.status; return c === 'NETWORK' || !st || st >= 500; };

/* ---------- session ---------- */
export function enterLive(user) {
  const name = user.fullName || user.displayName || user.email || 'Admin';
  store.set(s => {
    s.session.signedIn = true; s.session.live = true; s.session.since = new Date().toISOString();
    s.me = { id: String(user.id || ''), name, email: user.email || '', role: ROLE_NAME[user.adminRole] || 'Admin', adminRole: user.adminRole || '' };
  }, 'signed-in');
  startLive();                                             // side-menu counts and the bell, at once
}
function endLive() {
  forgetSession();
  store.set(s => { s.session.signedIn = false; s.session.live = false; s.me = { id: '', name: '', email: '', role: '', adminRole: '' }; }, 'signed-out');
}
/* the API refused the admin's token and could not refresh it, or this account was suspended: back to sign-in */
whenSessionEnds(why => { if (store.s.session.signedIn) { endLive(); L.closeSheet(true); L.go(why === 'suspended' ? '#login-suspended' : '#login-expired'); } });

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
      <li><Icon n="shield" /><span>Two-step sign-in for every admin</span></li>
      <li><Icon n="verified" /><span>Creators and brands are verified here first</span></li>
      <li><Icon n="lock" /><span>Closing the tab signs you out</span></li>
    </ul>
    <img className="auth-rings" src="assets/admin-rings.svg" width="420" height="310" alt="" />
    <p className="auth-art-foot">Restricted to Linkloom staff.</p>
  </section>
);

/* the six code boxes: typing moves on, backspace moves back, a pasted code fills them all */
function OtpBoxes({ api, onFull, isErr }) {
  const boxes = useRef([]);
  const code = () => boxes.current.map(b => b.value).join('');
  const changed = () => { boxes.current.forEach(b => b.removeAttribute('aria-invalid')); onFull(code().length === 6, code()); };
  const fill = (str, from) => { String(str).replace(/\D/g, '').slice(0, 6 - from).split('').forEach((c, k) => { boxes.current[from + k].value = c; }); changed(); (boxes.current.find(x => !x.value) || boxes.current[5]).focus(); };
  api.current = {
    code,
    bad(host) { boxes.current.forEach(b => { b.setAttribute('aria-invalid', 'true'); b.value = ''; }); mo('shake', host.firstElementChild); boxes.current[0].focus(); },
    disable(on) { boxes.current.forEach(b => { b.disabled = on; }); },
    focus() { (boxes.current.find(x => !x.value) || boxes.current[0]).focus(); }
  };
  const onInput = i => e => { const b = e.currentTarget, d = b.value.replace(/\D/g, ''); if (d.length > 1) { fill(d, i); return; } b.value = d; if (d && i < 5) boxes.current[i + 1].focus(); changed(); };
  const onKeyDown = i => e => {
    const b = e.currentTarget, bs = boxes.current;
    if (e.key === 'Backspace' && !b.value && i > 0) { bs[i - 1].value = ''; bs[i - 1].focus(); e.preventDefault(); changed(); }
    else if (e.key === 'ArrowLeft' && i > 0) { bs[i - 1].focus(); e.preventDefault(); }
    else if (e.key === 'ArrowRight' && i < 5) { bs[i + 1].focus(); e.preventDefault(); }
  };
  return (
    <div data-otp="" className={isErr ? 'is-err' : undefined}>
      <div className="auth-boxes" role="group" aria-label="6-digit authenticator code">
        {[0, 1, 2, 3, 4, 5].map(i => <input key={i} ref={n => { boxes.current[i] = n; }} className={'auth-box' + (i === 2 ? ' is-gap' : '')} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder=" " autoComplete={i ? 'off' : 'one-time-code'} aria-label={`Digit ${i + 1} of 6`}
          onInput={onInput(i)} onKeyDown={onKeyDown(i)} onFocus={e => e.currentTarget.select()} onPaste={e => { e.preventDefault(); fill((e.clipboardData || window.clipboardData).getData('text'), 0); }} />)}
      </div>
    </div>
  );
}

/* sign-in state that outlives the screen (the lock and the challenge survive leaving and coming back) */
const LS = { step: 'pw', email: '', lockEnd: 0, challenge: '', challengeEnd: 0, remember: false, back: '' };

/* step 1: email + password */
function PwStep({ flash, online, say, next, life }) {
  const email = useRef(null), pw = useRef(null), head = useRef(null), form = useRef(null);
  const [errs, setErrs] = useState({});
  const [show, setShow] = useState(false);
  const [lockLeft, setLockLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState(() => { const b = LS.back; LS.back = ''; return b; });
  const [showFlash] = useState(() => !!flash);
  const clr = id => setErrs(e => (e[id] ? { ...e, [id]: null } : e));

  const lockTick = () => {
    if (!life.alive) return;
    const left = Math.ceil((LS.lockEnd - now()) / 1000);
    if (left > 0) { setLockLeft(left); life.timer = setTimeout(lockTick, 1000); }
    else if (LS.lockEnd) { LS.lockEnd = 0; setLockLeft(0); }
  };
  useLayoutEffect(() => {
    LS.step = 'pw';
    lockTick();
    if (LS.focusHead) { head.current.focus({ preventScroll: true }); LS.focusHead = false; }
  }, []);

  const failed = err => {
    flushSync(() => setBusy(false));
    const code = err && err.code, st = err && err.status;
    if (code === 'ACCOUNT_LOCKED' || st === 423) {
      LS.lockEnd = now() + (waitOf(err) || 15 * 60) * 1000; pw.current.value = '';
      flushSync(lockTick); say('Sign-in paused'); return;
    }
    if (code === 'RATE_LIMITED' || st === 429) { const w = waitOf(err); flushSync(() => setApiErr(`Too many sign-in attempts. Wait ${w ? mmss(w) : 'a minute'}, then try again.`)); return; }
    if (isNet(err)) { flushSync(() => setApiErr('Could not reach Linkloom. Check your connection, then try again in a minute.')); return; }
    if (code === 'ACCOUNT_SUSPENDED') { flushSync(() => setApiErr('This admin account has been suspended. Contact a super admin.')); return; }
    if (code === 'NOT_ADMIN' || st === 403) { flushSync(() => setErrs({ email: 'This Linkloom account is not an admin account.' })); email.current.focus(); return; }
    if (code === 'INVALID_CREDENTIALS' || code === 'AUTH_INVALID' || st === 400 || st === 401) {
      const left = triesOf(err);
      flushSync(() => setErrs({ pw: 'That email and password don\'t match.' + (left != null ? ` ${left} ${left === 1 ? 'try' : 'tries'} left before sign-in is paused.` : '') }));
      pw.current.value = ''; pw.current.focus(); mo('shake', pw.current.parentElement); return;
    }
    flushSync(() => setApiErr((err && err.message) || 'Sign-in didn\'t go through. Please try again.'));
  };
  const submit = async e => {
    e.preventDefault();
    if (LS.lockEnd > now() || busy || !navigator.onLine) return;
    const ev = email.current.value.trim().toLowerCase(), pv = pw.current.value;
    const bad = {};
    if (!ev) bad.email = 'Enter your work email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ev)) bad.email = 'That email looks incomplete.';
    else if (DOMAIN && !ev.endsWith('@' + DOMAIN)) bad.email = <>Admin accounts use a <b>{'@' + DOMAIN}</b> address.</>;
    if (!pv) bad.pw = 'Enter your password.';
    if (bad.email || bad.pw) { flushSync(() => setErrs(bad)); const i = form.current.querySelector('.field.is-err input'); i && i.focus(); return; }
    LS.email = ev;
    flushSync(() => { setBusy(true); setApiErr(''); });
    try {
      const ch = await adminLogin(ev, pv);
      if (!life.alive) return;
      LS.challenge = ch.challengeId; LS.challengeEnd = ch.expiresIn ? now() + ch.expiresIn * 1000 : 0;
      say('Password accepted. Enter your authenticator code.');
      next();
    } catch (err) { if (life.alive) failed(err); }
  };
  const locked = lockLeft > 0;
  return (
    <>
      <div className="auth-head"><p className="t-eyebrow">Step 1 of 2</p><h1 className="t-h1" tabIndex={-1} data-h="" ref={head}>Admin sign-in</h1>
        <p className="muted">Use your Linkloom admin account. You'll confirm with your authenticator app next.</p></div>
      {showFlash ? <Note kind={flash[0]} ic={flash[1]} role="status"><p>{flash[2]}</p></Note> : null}
      <Offline online={online} />
      <form className="auth-stack" noValidate data-form="" onSubmit={submit} ref={form}>
        <div className={'field' + (errs.email ? ' is-err' : '')} data-f="email"><label htmlFor="auth-email">Work email</label>
          <input className="input" id="auth-email" type="email" autoComplete="username" spellCheck="false" autoCapitalize="off" defaultValue={LS.email} aria-describedby="auth-email-e" aria-invalid={errs.email ? 'true' : undefined} ref={email} onInput={() => clr('email')} />
          <p className="err" id="auth-email-e" aria-live="polite">{errs.email || null}</p></div>
        <div className={'field' + (errs.pw ? ' is-err' : '')} data-f="pw"><label htmlFor="auth-pw">Password</label>
          <div className="auth-pw"><input className="input" id="auth-pw" type={show ? 'text' : 'password'} autoComplete="current-password" spellCheck="false" autoCapitalize="off" maxLength={128} aria-describedby="auth-pw-e" aria-invalid={errs.pw ? 'true' : undefined} ref={pw} onInput={() => clr('pw')} />
            <button type="button" className={'auth-eye' + (show ? ' is-on' : '')} data-eye="" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(v => !v)}><Icon n="eye" /></button></div>
          <p className="err" id="auth-pw-e" aria-live="polite">{errs.pw || null}</p></div>
        <div data-status="">
          {locked
            ? <Note kind="warn" ic="lock" role="status"><p className="t-label">Sign-in paused for <span className="num" data-cd="">{mmss(lockLeft)}</span></p><p>{`Too many wrong attempts on ${maskEmail(LS.email)}. If this wasn't you, tell the security team.`}</p></Note>
            : apiErr ? <Note kind="err" ic="alert" role="status"><p>{apiErr}</p></Note> : null}
        </div>
        <div className="auth-acts"><Lq type="submit" className="lq-p auth-go" data-submit="" disabled={locked || busy} aria-disabled={locked ? 'true' : undefined}>{busy ? 'Checking…' : <>Continue <Icon n="arrow" className="ic" /></>}</Lq></div>
      </form>
      <p className="auth-legal">Forgot your password or lost your phone? Ask another super admin to reset it. Linkloom staff never ask for your code.</p>
    </>
  );
}

/* step 2: authenticator code */
function CodeStep({ online, say, back, life }) {
  const otp = useRef(null), host = useRef(null), go = useRef(null), head = useRef(null), tb = useRef(null), tt = useRef(null);
  const [full, setFull] = useState(false);
  const [oerr, setOerr] = useState('');
  const [isErr, setIsErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useLayoutEffect(() => {
    LS.step = 'code';
    /* the 30-second authenticator window, so a late code makes sense */
    const win = () => { if (!life.alive || LS.step !== 'code') return; const left = 30 - Math.floor(now() / 1000) % 30; tt.current.textContent = `New code in ${left} s`; tb.current.style.transform = `scaleX(${(left / 30).toFixed(3)})`; tb.current.parentElement.classList.toggle('is-low', left <= 5); life.totp = setTimeout(win, 1000); };
    win();
    head.current.focus({ preventScroll: true });
    const t = setTimeout(() => life.alive && otp.current && LS.step === 'code' && otp.current.focus(), 60);
    return () => { clearTimeout(life.totp); clearTimeout(t); };
  }, []);

  /* the challenge is gone (expired, used up or locked): start again from the password */
  const restart = msg => { clearTimeout(life.totp); LS.challenge = ''; LS.back = msg; LS.focusHead = true; back(); };
  const submit = async e => {
    e.preventDefault();
    const code = otp.current.code();
    if (code.length < 6 || busy || done || !navigator.onLine) return;
    if (!LS.challenge || (LS.challengeEnd && LS.challengeEnd < now())) { restart('That sign-in took too long. Enter your password again.'); return; }
    otp.current.disable(true);
    flushSync(() => { setBusy(true); setOerr(''); setIsErr(false); });
    try {
      const user = await verifyMfa(LS.challenge, code);
      if (!life.alive) return;
      flushSync(() => { setBusy(false); setDone(true); });
      mo('check', go.current.querySelector('.t svg'), { color: 'butter' });
      say('Code accepted. Signing you in.');
      LS.step = 'pw'; LS.challenge = '';
      enterLive(user);
      life.timer = setTimeout(() => L.go('#home'), 520);
    } catch (err) {
      if (!life.alive) return;
      otp.current.disable(false);
      flushSync(() => setBusy(false));
      const c = err && err.code, st = err && err.status;
      if (c === 'ACCOUNT_LOCKED' || st === 423) { LS.lockEnd = now() + (waitOf(err) || 15 * 60) * 1000; restart(''); return; }
      if (c === 'NOT_ADMIN') { restart('This Linkloom account is not an admin account.'); return; }
      if (c === 'ACCOUNT_SUSPENDED') { restart('This admin account has been suspended. Contact a super admin.'); return; }
      if (c === 'RATE_LIMITED' || st === 429) { const w = waitOf(err); flushSync(() => setOerr(`Too many attempts. Wait ${w ? mmss(w) : 'a minute'}, then try again.`)); return; }
      if (isNet(err)) { flushSync(() => setOerr('Could not reach Linkloom. Check your connection, then try again.')); return; }
      if (c === 'MFA_CHALLENGE_EXPIRED' || c === 'MFA_CHALLENGE_INVALID' || c === 'CHALLENGE_EXPIRED' || st === 410 || /session|expired/i.test((err && err.message) || '')) { restart('That sign-in took too long. Enter your password again.'); return; }
      /* anything that is not a wrong code: say what the backend said, instead of blaming the code */
      if (c && !/^(MFA_INVALID|OTP_INVALID|INVALID_CODE|CODE_INVALID|INVALID_OTP)$/.test(c)) {
        const d = (err && err.details) || {}, first = Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)[0];
        flushSync(() => setOerr(`${(err && err.message) || 'Sign-in didn\'t go through.'}${first ? ' (' + first + ')' : ''}`)); return;
      }
      if (c === 'MFA_NOT_ENROLLED') { restart('This account has no authenticator app set up yet. Ask another super admin to set it up.'); return; }
      const left = triesOf(err);
      if (left === 0) { restart('Too many wrong codes. Enter your password again.'); return; }
      flushSync(() => { setOerr('That code didn\'t match. Codes change every 30 seconds; check your phone\'s clock is set automatically.' + (left != null ? ` ${left} ${left === 1 ? 'try' : 'tries'} left.` : '')); setIsErr(true); setFull(false); });
      otp.current.bad(host.current.querySelector('[data-otp]'));
    }
  };
  return (
    <>
      <button className="btn-q auth-back" type="button" data-back="" onClick={() => { clearTimeout(life.totp); LS.challenge = ''; LS.focusHead = true; back(); }}><Icon n="back" />Use a different account</button>
      <div className="auth-head"><p className="t-eyebrow">Step 2 of 2</p><h1 className="t-h1" tabIndex={-1} data-h="" ref={head}>Enter your code</h1>
        <p className="muted">Open your authenticator app and type the 6-digit code for <b className="auth-who">{`Linkloom Admin · ${maskEmail(LS.email)}`}</b>.</p></div>
      <Offline online={online} />
      <form className="auth-stack" noValidate data-form="" onSubmit={submit} ref={host}>
        <OtpBoxes api={otp} isErr={isErr} onFull={f => { setOerr(''); setIsErr(false); setFull(f); }} />
        <div className="auth-totp" aria-hidden="true"><span className="auth-totp-bar"><i data-tb="" ref={tb}></i></span><span className="num" data-tt="" ref={tt}></span></div>
        <p className="err" data-oerr="" aria-live="polite">{oerr}</p>
        <div className="auth-acts"><Lq type="submit" className="lq-p auth-go" data-submit="" ref_={go} disabled={!full || busy || done} aria-disabled={!full && !done ? 'true' : undefined}>{done ? <><Icon n="check" className="ic" /> Signed in</> : busy ? 'Checking…' : <>Verify and sign in <Icon n="arrow" className="ic" /></>}</Lq></div>
      </form>
      <p className="auth-legal">No access to your app? Another super admin can reset your authenticator after confirming it's you on a call.</p>
    </>
  );
}

const FLASH = {
  out: ['info', 'logout', 'You\'re signed out on this device.'],
  expired: ['info', 'clock', 'Your session ended. Sign in again to continue.'],
  suspended: ['err', 'lock', 'This admin account has been suspended, and its sessions were ended. Contact a super admin.']
};

function Login({ param }) {
  const [signedIn] = useState(() => store.s.session.signedIn);     // already in: go straight to the console
  const [step, setStep] = useState('pw');
  const [online, setOnline] = useState(() => navigator.onLine);
  const host = useRef(null), live = useRef(null);
  const life = useRef({ alive: true, timer: 0, totp: 0 }).current;
  useLayoutEffect(() => { if (signedIn) location.replace('#home'); }, []);
  useEffect(() => {
    life.alive = true;
    const onNet = () => setOnline(navigator.onLine);
    addEventListener('online', onNet); addEventListener('offline', onNet);
    return () => { life.alive = false; clearTimeout(life.timer); clearTimeout(life.totp); removeEventListener('online', onNet); removeEventListener('offline', onNet); };
  }, []);
  if (signedIn) return null;
  const say = t => { live.current.textContent = t; };
  /* step change: the new step renders at once, then slides in */
  const swap = (to, dir) => { const paint = () => flushSync(() => setStep(to)); if (life.alive) mo('swap', host.current, paint, { dir }); else paint(); };
  return (
    <div className="focus auth">
      <Art />
      <section className="focus-form light auth-form">
        <div className="auth-in" data-host="" ref={host}>
          {step === 'pw'
            ? <PwStep flash={FLASH[param]} online={online} say={say} life={life} next={() => swap('code', 1)} />
            : <CodeStep online={online} say={say} life={life} back={() => swap('pw', -1)} />}
        </div>
        <p className="sr-only" aria-live="polite" data-live="" ref={live}></p>
      </section>
    </div>
  );
}

L.register('login', { title: 'Admin sign-in', shell: 'focus', auth: false, Component: Login });
