/* Sign-in (#login, #login-out, #login-expired, #login-ended) for the Super Admin console. Focus shell, no auth needed.
   Two steps: work email + password, then a 6-digit code from an authenticator app (no SMS for admins).
   Rules shown in the UI (the server enforces them in production):
   - only @linkloom.in staff accounts; a wrong email and a wrong password get the same message
   - 5 wrong passwords pause sign-in for 15 minutes and alert the security team; 5 wrong codes send you back to step 1
   - "Trust this device" is off by default and lasts 7 days; leave it off on shared computers
   Two ways in: the sample account (shown on the screen) opens the console on sample data with the two-step flow;
   any other email and password is sent to the real Linkloom API (POST /v1/auth/login/), and only an account whose role
   is "admin" gets in. The backend has no authenticator step yet, so a live sign-in is one step.
   Also exports:
   - signOut({ reason })       ends this session, logs it, lands on #login-out
   - adminConfirm({...})       the confirm sheet every destructive admin action uses (reason required, logged) */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { login as apiLogin, logout as apiLogout, whenSessionEnds } from '../lib/api.js';
import { LIVE, forgetSession, ensureVerifications } from '../lib/live.js';

const now = () => Date.now();
const EMAIL = 'kavya@linkloom.in', PW = 'Loom#Admin26', CODE = '582044', PW_TRIES = 5, CODE_TRIES = 5, LOCK = 15 * 60;
export const SAMPLE = { email: EMAIL, pw: PW, code: CODE };
/* the email domain admins must use; VITE_ADMIN_EMAIL_DOMAIN="" lets any address try */
const DOMAIN = import.meta.env.VITE_ADMIN_EMAIL_DOMAIN ?? 'linkloom.in';
const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const maskEmail = e => { const [u, d] = String(e).split('@'); return d ? u.slice(0, 2) + '••••@' + d : e; };

/* ---------- shared: confirm sheet for destructive admin actions ----------
   adminConfirm({ title, lead (node), verb, action, target, reasons:[...], tone:'danger'|'plain', onConfirm(reason) → detail?, after() })
   It always asks for a reason, says the action will be logged, calls L.audit(action, target, detail) and toasts "Logged to audit". */
function ConfirmForm({ o, close }) {
  const reasons = o.reasons || [];
  const ta = useRef(null);
  const [len, setLen] = useState(0);
  const [picked, setPicked] = useState(-1);
  const [err, setErr] = useState('');
  const upd = () => { setLen(ta.current.value.length); setErr(''); };
  const pick = (r, i) => { setPicked(i); ta.current.value = r; upd(); ta.current.focus(); };
  const submit = e => {
    e.preventDefault();
    const why = ta.current.value.trim();
    if (why.length < 6) { flushSync(() => setErr('Add a reason of a few words. It goes into the audit log.')); ta.current.focus(); mo('shake', ta.current); return; }
    let detail = why;
    try { const d = o.onConfirm && o.onConfirm(why); if (typeof d === 'string') detail = d; } catch (er) { console.error(er); }
    L.audit(o.action, o.target, detail);
    close();
    L.toast('Logged to audit', 'check');
    o.after && o.after();
  };
  return (
    <form className="auth-cf" noValidate onSubmit={submit}>
      {o.lead ? <div className="auth-cf-lead">{o.lead}</div> : null}
      {reasons.length ? <div className="field"><span className="lab" id="auth-cf-rl">Common reasons</span><div className="chips" role="group" aria-labelledby="auth-cf-rl">{reasons.map((r, i) => <button key={i} className="chip" type="button" data-r="" aria-pressed={picked === i} onClick={() => pick(r, i)}>{r}</button>)}</div></div> : null}
      <div className={'field' + (err ? ' is-err' : '')} data-f="why"><label htmlFor="auth-cf-why">Reason <span className="muted">(required)</span></label>
        <textarea className="textarea" id="auth-cf-why" maxLength={240} aria-describedby="auth-cf-h auth-cf-e" aria-invalid={err ? 'true' : undefined} placeholder="Say what you saw. Another admin should understand it without asking you." ref={ta} onInput={upd}></textarea>
        <p className="help" id="auth-cf-h"><span data-n="">{len}</span>/240</p><p className="err" id="auth-cf-e" aria-live="polite">{err}</p></div>
      <p className="auth-cf-log"><Icon n="shield" /><span>This will be logged as <code>{o.action}</code>{` under ${store.s.me.name}, with your reason. Audit entries can't be edited or deleted.`}</span></p>
      <div className="auth-cf-acts"><Lq type="submit" className={o.tone === 'plain' ? 'lq-p' : 'lq-p auth-cf-danger'}>{o.verb}</Lq><button className="btn-q" type="button" data-cancel="" onClick={() => close()}>Cancel</button></div>
    </form>
  );
}
export function adminConfirm(o) {
  L.openSheet({ title: o.title, body: <ConfirmForm o={o} close={L.closeSheet} /> });
}

/* the console signed in to the real API: the admin's own name, and nothing from the sample account */
const SAMPLE_ME = { ...store.s.me };
export function enterLive(user) {
  const name = user.fullName || user.displayName || user.email || 'Admin';
  store.set(s => {
    s.session.signedIn = true; s.session.live = true; s.session.mfa = false; s.session.since = new Date().toISOString();
    s.me = { ...s.me, name, email: user.email || '', role: 'Admin', photo: null };
  }, 'signed-in');
  ensureVerifications();                                   // so the side menu counts the real queue at once
}
function endLive() {
  forgetSession();
  store.set(s => { s.session.signedIn = false; s.session.live = false; s.me = { ...SAMPLE_ME }; }, 'signed-out');
}
/* the API refused the admin's token and could not refresh it: back to sign-in */
whenSessionEnds(() => { if (store.s.session.live) { endLive(); L.closeSheet(true); L.go('#login-expired'); } });

export function signOut(opts = {}) {
  if (store.s.session.live) {
    apiLogout();
    endLive();
    L.closeSheet(true);
    L.go('#login-' + (opts.param || 'out'));
    return;
  }
  L.audit('auth.logout', 'Admin console', opts.reason || 'Signed out on this device');
  store.set(s => { s.session.signedIn = false; }, 'signed-out');
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
      <li><Icon n="file" /><span>Every action is sealed in the audit log</span></li>
      <li><Icon n="lock" /><span>Escrow moves only with a reason on record</span></li>
    </ul>
    <img className="auth-rings" src="assets/admin-rings.svg" width="420" height="310" alt="" />
    <p className="auth-art-foot">Restricted to Linkloom staff. Each sign-in is logged with device, IP and city.</p>
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

/* sign-in state that outlives the screen (tries and the lock survive leaving and coming back) */
const LS = { step: 'pw', email: '', tries: 0, lockEnd: 0, codeTries: 0, remember: false };

/* step 1: email + password */
function PwStep({ flash, online, say, next, life }) {
  const email = useRef(null), pw = useRef(null), go = useRef(null), head = useRef(null), form = useRef(null);
  const [errs, setErrs] = useState({});
  const [show, setShow] = useState(false);
  const [lockLeft, setLockLeft] = useState(0);
  const [codes, setCodes] = useState(() => { const c = !!LS.codeFail; LS.codeFail = false; return c; });
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState('');
  const [showFlash] = useState(() => !!flash && !LS.tries);
  const clr = id => setErrs(e => (e[id] ? { ...e, [id]: null } : e));

  const lockTick = () => {
    if (!life.alive) return;
    const left = Math.ceil((LS.lockEnd - now()) / 1000);
    if (left > 0) { setLockLeft(left); life.timer = setTimeout(lockTick, 1000); }
    else if (LS.lockEnd) { LS.lockEnd = 0; LS.tries = 0; setLockLeft(0); setCodes(false); }
  };
  useLayoutEffect(() => {
    LS.step = 'pw';
    lockTick();
    if (LS.focusHead) { head.current.focus({ preventScroll: true }); LS.focusHead = false; }
  }, []);

  const fillSample = () => { email.current.value = EMAIL; pw.current.value = PW; LS.email = EMAIL; setErrs({}); say('Sample details filled'); go.current.focus(); };
  const wrong = () => {
    LS.tries++;
    const left = PW_TRIES - LS.tries;
    if (left <= 0) { LS.lockEnd = now() + LOCK * 1000; pw.current.value = ''; flushSync(lockTick); say('Sign-in paused for 15 minutes'); return; }
    flushSync(() => setErrs({ pw: `That email and password don't match. ${left} ${left === 1 ? 'try' : 'tries'} left before a 15-minute pause.` }));
    pw.current.value = ''; pw.current.focus(); mo('shake', pw.current.parentElement);
  };
  /* any account but the sample one: ask the real API */
  const signInLive = async (ev, pv) => {
    flushSync(() => { setBusy(true); setApiErr(''); });
    try {
      const user = await apiLogin(ev, pv);
      if (!life.alive) return;
      LS.tries = 0; LS.email = ev;
      enterLive(user);
      say('Signed in. Opening the console.');
      L.go('#home');
    } catch (err) {
      if (!life.alive) return;
      flushSync(() => setBusy(false));
      const code = err && err.code, st = err && err.status;
      if (code === 'NOT_ADMIN') { flushSync(() => setErrs({ email: 'This Linkloom account is not an admin account.' })); email.current.focus(); return; }
      if (code === 'RATE_LIMITED' || st === 429) { flushSync(() => setApiErr('Too many sign-in attempts. Wait a minute, then try again.')); return; }
      if (code === 'NETWORK' || !st || st >= 500) { flushSync(() => setApiErr('Could not reach Linkloom. Check your connection, then try again in a minute.')); return; }
      wrong();
    }
  };
  const submit = e => {
    e.preventDefault();
    if (LS.lockEnd > now() || busy) return;
    if (!navigator.onLine) return;
    const ev = email.current.value.trim().toLowerCase(), pv = pw.current.value;
    const sample = ev === EMAIL && pv === PW;
    const bad = {};
    if (!ev) bad.email = 'Enter your work email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ev)) bad.email = 'That email looks incomplete.';
    else if (DOMAIN && !ev.endsWith('@' + DOMAIN)) bad.email = <>Admin accounts use a <b>{'@' + DOMAIN}</b> address.</>;
    if (!pv) bad.pw = 'Enter your password.';
    if (bad.email || bad.pw) { flushSync(() => setErrs(bad)); const i = form.current.querySelector('.field.is-err input'); i && i.focus(); return; }
    if (!sample) { if (LIVE) signInLive(ev, pv); else wrong(); return; }
    LS.tries = 0; LS.email = ev;
    setBusy(true);
    life.timer = setTimeout(next, 380);
  };
  const locked = lockLeft > 0;
  return (
    <>
      <div className="auth-head"><p className="t-eyebrow">Step 1 of 2</p><h1 className="t-h1" tabIndex={-1} data-h="" ref={head}>Admin sign-in</h1>
        <p className="muted">Use your Linkloom staff account. You'll confirm with your authenticator app next.</p></div>
      {showFlash ? <Note kind={flash[0]} ic={flash[1]} role="status"><p>{flash[2]}</p></Note> : null}
      <Offline online={online} />
      <form className="auth-stack" noValidate data-form="" onSubmit={submit} ref={form}>
        <div className={'field' + (errs.email ? ' is-err' : '')} data-f="email"><label htmlFor="auth-email">Work email</label>
          <input className="input" id="auth-email" type="email" autoComplete="username" spellCheck="false" autoCapitalize="off" placeholder="name@linkloom.in" defaultValue={LS.email} aria-describedby="auth-email-e" aria-invalid={errs.email ? 'true' : undefined} ref={email} onInput={e => { clr('email'); LS.email = e.currentTarget.value; }} />
          <p className="err" id="auth-email-e" aria-live="polite">{errs.email || null}</p></div>
        <div className={'field' + (errs.pw ? ' is-err' : '')} data-f="pw"><label htmlFor="auth-pw">Password</label>
          <div className="auth-pw"><input className="input" id="auth-pw" type={show ? 'text' : 'password'} autoComplete="current-password" spellCheck="false" autoCapitalize="off" maxLength={64} aria-describedby="auth-pw-e auth-lock-h" aria-invalid={errs.pw ? 'true' : undefined} ref={pw} onInput={() => clr('pw')} />
            <button type="button" className={'auth-eye' + (show ? ' is-on' : '')} data-eye="" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(v => !v)}><Icon n="eye" /></button></div>
          <p className="err" id="auth-pw-e" aria-live="polite">{errs.pw || null}</p></div>
        <div data-status="">
          {locked
            ? <Note kind="warn" ic="lock" role="status"><p className="t-label">Sign-in paused for <span className="num" data-cd="">{mmss(lockLeft)}</span></p><p>{`${PW_TRIES} wrong attempts on ${maskEmail(LS.email || EMAIL)}. We've alerted the security team. If this wasn't you, tell them on #security.`}</p></Note>
            : codes ? <Note kind="warn" ic="shield" role="status"><p className="t-label">Too many wrong codes</p><p>We've sent you back to step 1 and told the security team. One more wrong password pauses sign-in for 15 minutes.</p></Note>
            : apiErr ? <Note kind="err" ic="alert" role="status"><p>{apiErr}</p></Note> : null}
        </div>
        <div className="auth-acts"><Lq type="submit" className="lq-p auth-go" data-submit="" ref_={go} disabled={locked || busy} aria-disabled={locked ? 'true' : undefined}>{busy ? 'Checking…' : <>Continue <Icon n="arrow" className="ic" /></>}</Lq></div>
        <p className="auth-lockh" id="auth-lock-h"><Icon n="lock" /><span>{`${PW_TRIES} wrong attempts pause sign-in for 15 minutes and alert the security team.`}</span></p>
      </form>
      <div className="auth-sample">
        <span className="sample">Sample account</span>
        <p className="auth-hint"><b>{EMAIL}</b> · <b className="num">{PW}</b></p>
        <button className="btn-q auth-samplebtn" type="button" data-fill="" onClick={fillSample}>Fill sample details</button>
      </div>
      <p className="auth-legal">Forgot your password or lost your phone? Ask another super admin to reset it from Security. Linkloom staff never ask for your code.</p>
    </>
  );
}

/* step 2: authenticator code */
function CodeStep({ online, say, back, life }) {
  const otp = useRef(null), host = useRef(null), go = useRef(null), head = useRef(null), tb = useRef(null), tt = useRef(null);
  const [full, setFull] = useState(false);
  const [oerr, setOerr] = useState('');
  const [isErr, setIsErr] = useState(false);
  const [done, setDone] = useState(false);
  const [remember, setRemember] = useState(LS.remember);

  useLayoutEffect(() => {
    LS.step = 'code'; LS.codeTries = 0;
    /* the 30-second authenticator window, so a late code makes sense */
    const win = () => { if (!life.alive || LS.step !== 'code') return; const left = 30 - Math.floor(now() / 1000) % 30; tt.current.textContent = `New code in ${left} s`; tb.current.style.transform = `scaleX(${(left / 30).toFixed(3)})`; tb.current.parentElement.classList.toggle('is-low', left <= 5); life.totp = setTimeout(win, 1000); };
    win();
    head.current.focus({ preventScroll: true });
    const t = setTimeout(() => life.alive && otp.current && LS.step === 'code' && otp.current.focus(), 60);
    return () => { clearTimeout(life.totp); clearTimeout(t); };
  }, []);

  const submit = e => {
    e.preventDefault();
    if (otp.current.code().length < 6) return;
    if (!navigator.onLine) return;
    if (otp.current.code() !== CODE) {
      LS.codeTries++;
      const left = CODE_TRIES - LS.codeTries;
      if (left <= 0) { clearTimeout(life.totp); LS.tries = PW_TRIES - 1; LS.focusHead = true; LS.codeFail = true; back(); return; }
      flushSync(() => { setOerr(`That code didn't match. Codes change every 30 seconds; check your phone's clock is set automatically. ${left} ${left === 1 ? 'try' : 'tries'} left.`); setIsErr(true); setFull(false); });
      otp.current.bad(host.current.querySelector('[data-otp]'));
      return;
    }
    otp.current.disable(true);
    flushSync(() => setDone(true));
    mo('check', go.current.querySelector('.t svg'), { color: 'butter' });
    say('Code accepted. Signing you in.');
    const at = L.today().toISOString();
    store.set(s => {
      s.session.signedIn = true; s.session.mfa = true; s.session.since = at; s.session.trusted = LS.remember;
      const cur = s.sessions.find(x => x.current); if (cur) cur.since = at;
      else s.sessions.unshift({ id: 's' + (s.sessions.length + 1), who: s.me.name + ' (you)', device: 'Chrome · macOS', ip: '49.207.••.18 · Bengaluru', since: at, current: true });
    }, 'signed-in');
    L.audit('auth.login', 'Admin console', 'Password + authenticator code' + (LS.remember ? ' · device trusted for 7 days' : ''));
    LS.step = 'pw'; LS.tries = 0;
    life.timer = setTimeout(() => L.go('#home'), 520);
  };
  return (
    <>
      <button className="btn-q auth-back" type="button" data-back="" onClick={() => { clearTimeout(life.totp); LS.focusHead = true; back(); }}><Icon n="back" />Use a different account</button>
      <div className="auth-head"><p className="t-eyebrow">Step 2 of 2</p><h1 className="t-h1" tabIndex={-1} data-h="" ref={head}>Enter your code</h1>
        <p className="muted">Open your authenticator app and type the 6-digit code for <b className="auth-who">{`Linkloom Admin · ${maskEmail(LS.email)}`}</b>.</p></div>
      <Offline online={online} />
      <form className="auth-stack" noValidate data-form="" onSubmit={submit} ref={host}>
        <OtpBoxes api={otp} isErr={isErr} onFull={f => { setOerr(''); setIsErr(false); setFull(f); }} />
        <div className="auth-totp" aria-hidden="true"><span className="auth-totp-bar"><i data-tb="" ref={tb}></i></span><span className="num" data-tt="" ref={tt}></span></div>
        <p className="err" data-oerr="" aria-live="polite">{oerr}</p>
        <label className="check auth-remember"><input type="checkbox" data-remember="" checked={remember} onChange={e => { LS.remember = e.target.checked; setRemember(e.target.checked); }} aria-describedby="auth-rem-h" /><span><b>Trust this device for 7 days</b><span className="help" id="auth-rem-h">Off by default. Leave it off on shared or office computers.</span></span></label>
        <div className="auth-acts"><Lq type="submit" className="lq-p auth-go" data-submit="" ref_={go} disabled={!full || done} aria-disabled={!full && !done ? 'true' : undefined}>{done ? <><Icon n="check" className="ic" /> Signed in</> : <>Verify and sign in <Icon n="arrow" className="ic" /></>}</Lq></div>
      </form>
      <div className="auth-sample"><span className="sample">Sample code</span><p className="auth-hint">Your authenticator shows <b className="num">{`${CODE.slice(0, 3)} ${CODE.slice(3)}`}</b> for this account.</p></div>
      <p className="auth-legal">No access to your app? Another super admin can reset your MFA from Security after confirming it's you on a call.</p>
    </>
  );
}

const FLASH = {
  out: ['info', 'logout', 'You\'re signed out on this device. Other admins\' sessions are unchanged.'],
  expired: ['info', 'clock', 'Your session ended after 30 minutes without activity. Sign in again to continue.'],
  ended: ['warn', 'shield', 'Another super admin ended this session. If you didn\'t expect that, tell the security team before signing in.']
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
