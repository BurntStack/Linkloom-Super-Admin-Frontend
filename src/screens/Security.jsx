/* Security (#security): identity and security for the admin console.
   MFA status (and resetting another admin's MFA), active sessions with invalidate (one, or all others), the admin team,
   the password policy with change password, and sign out. Destructive actions go through adminConfirm (reason + audit). */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { adminConfirm, signOut, SAMPLE } from './Auth.jsx';

const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const nameOf = who => String(who || '').replace(/\s*\(you\)\s*$/, '');
const Av = ({ name, me }) => <span className={`sec-av ${me ? 'is-me' : ''}`} aria-hidden="true">{(String(name || '?').trim()[0] || '?').toUpperCase()}</span>;
const ROLES = {
  'Super admin': 'Everything, including escrow releases, refunds and other admins.',
  'Trust & safety': 'Verification, accounts, marketplace and moderation.',
  'Finance': 'Orders, payouts, financials and exports. No account actions.'
};
const POLICY = [
  ['Length', 'At least 12 characters, with a letter, a number and a symbol'],
  ['Reuse', 'The last 5 passwords can\'t be used again'],
  ['Lockout', '5 wrong attempts pause sign-in for 15 minutes and alert the team'],
  ['Two-step', 'Authenticator code on every sign-in; SMS is not accepted'],
  ['Sessions', 'End after 30 minutes idle, or 12 hours at most'],
  ['Trusted device', 'Off by default; lasts 7 days when turned on']
];
const PWR = [
  ['len', 'At least 12 characters', v => [...v].length >= 12],
  ['let', 'A letter', v => /\p{L}/u.test(v)],
  ['num', 'A number', v => /\d/.test(v)],
  ['sym', 'A symbol', v => /[^\p{L}\d\s]/u.test(v)]
];

function PasswordForm({ close }) {
  const form = useRef(null), cur = useRef(null), nw = useRef(null), rep = useRef(null);
  const [errs, setErrs] = useState({});
  const [ok, setOk] = useState({});
  const clr = k => setErrs(e => (e[k] ? { ...e, [k]: '' } : e));
  const onNew = () => {
    clr('new');
    const next = {}; PWR.forEach(r => { next[r[0]] = r[2](nw.current.value); });
    flushSync(() => setOk(next));
    PWR.forEach(r => { if (next[r[0]] && !ok[r[0]]) mo('check', form.current.querySelector(`[data-r="${r[0]}"] .sec-rule-ic`), { color: 'ink' }); });
  };
  const submit = e => {
    e.preventDefault();
    const bad = {}, c = cur.current.value, n = nw.current.value;
    if (c !== SAMPLE.pw) bad.cur = c ? 'That isn\'t your current password.' : 'Enter your current password.';
    if (!PWR.every(r => r[2](n))) bad.new = 'Meet every rule below first.';
    else if (n === c) bad.new = 'Pick a password you haven\'t used before.';
    if (!bad.cur && !bad.new && rep.current.value !== n) bad.rep = 'The two passwords don\'t match.';
    if (bad.cur || bad.new || bad.rep) { flushSync(() => setErrs(bad)); const i = form.current.querySelector('.field.is-err input'); i && i.focus(); return; }
    SAMPLE.pw = n;
    L.audit('auth.password_change', store.s.me.name + ' (a1)', 'Changed by the account owner; other devices signed out');
    close(); L.toast('Password changed · Logged to audit', 'check');
  };
  const field = (k, id, label, ref, extra) => (
    <div className={'field' + (errs[k] ? ' is-err' : '')} data-f={k}><label htmlFor={id}>{label}</label>
      <input className="input" id={id} type="password" ref={ref} aria-invalid={errs[k] ? 'true' : undefined} {...extra} />
      <p className="err" id={id + '-e'} aria-live="polite">{errs[k] || ''}</p></div>
  );
  return (
    <form className="sec-pw" noValidate ref={form} onSubmit={submit}>
      {field('cur', 'sec-cur', 'Current password', cur, { autoComplete: 'current-password', 'aria-describedby': 'sec-cur-e', onInput: () => clr('cur') })}
      {field('new', 'sec-new', 'New password', nw, { autoComplete: 'new-password', maxLength: 64, 'aria-describedby': 'sec-rules sec-new-e', onInput: onNew })}
      <ul className="sec-rules" id="sec-rules" aria-label="Your new password needs">{PWR.map(r => <li key={r[0]} data-r={r[0]} className={ok[r[0]] ? 'is-ok' : undefined}><span className="sec-rule-ic" aria-hidden="true"><Icon n="check" /></span><span>{r[1]}</span><span className="sr-only" data-rs="">{ok[r[0]] ? ', done' : ', not yet'}</span></li>)}</ul>
      {field('rep', 'sec-rep', 'Type it again', rep, { autoComplete: 'new-password', maxLength: 64, 'aria-describedby': 'sec-rep-e', onInput: () => clr('rep') })}
      <p className="sec-pw-n"><Icon n="info" /><span>Changing it signs out your other devices. The change is logged; the password never is.</span></p>
      <div className="sec-acts"><Lq type="submit" className="lq-p">Change password</Lq><button className="btn-q" type="button" data-cancel="" onClick={() => close()}>Cancel</button></div>
      <p className="sec-pw-s"><span className="sample">Sample</span> Current password is <b className="num">{SAMPLE.pw || ''}</b></p>
    </form>
  );
}
const changePassword = () => L.openSheet({ title: 'Change password', body: <PasswordForm close={L.closeSheet} /> });

export default function Security() {
  const root = useRef(null);
  const rerender = useRerender();
  useLayoutEffect(() => { mo('stagger', L.$$('.sec-sess-i, .sec-team-i', root.current)); }, []);
  useEffect(() => {
    let raf = 0, alive = true;
    const off = store.on(why => { if (/^notif|^audit$/.test(String(why))) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (alive) rerender(); }); });
    return () => { alive = false; off(); cancelAnimationFrame(raf); };
  }, []);

  const s = store.s, me = s.me, sess = s.sessions, others = sess.filter(x => !x.current), cur = sess.find(x => x.current);
  const trusted = !!s.session.trusted;

  const untrust = () => { store.set(x => { x.session.trusted = false; }, 'untrust'); L.audit('mfa.untrust', 'This device', 'Trusted device removed by the account owner'); L.toast('Logged to audit', 'check'); };
  const end = x => {
    const who = nameOf(x.who);
    adminConfirm({ title: 'End this session?', verb: 'End session', action: 'session.invalidate', target: `${who} · ${x.device}`,
      lead: <><p><b>{who}</b>{` is signed in on ${x.device} from `}<span className="num">{x.ip}</span>{`, since ${L.ago(x.since)}.`}</p><p className="muted t-small">They're signed out at once and need their authenticator code to come back.</p></>,
      reasons: ['Device reported lost or stolen', 'Unfamiliar location for this admin', 'Role change; fresh sign-in needed'],
      onConfirm: () => store.set(st => { st.sessions = st.sessions.filter(y => y.id !== x.id); }, 'session-end') });
  };
  const endAll = () => {
    const os = s.sessions.filter(y => !y.current); if (!os.length) return;
    adminConfirm({ title: 'Sign out all other sessions?', verb: `End ${os.length} session${os.length === 1 ? '' : 's'}`, action: 'session.invalidate_all', target: `${os.length} other session${os.length === 1 ? '' : 's'}`,
      lead: <><p>This signs out {os.map((y, i) => [i ? ' and ' : null, <b key={y.id}>{first(nameOf(y.who))}</b>])}. Your own session stays.</p><dl>{os.map(y => <div className="kv" key={y.id}><dt>{nameOf(y.who)}</dt><dd>{y.device}</dd></div>)}</dl></>,
      reasons: ['Suspected credential leak', 'Security review: everyone signs in fresh', 'After a password policy change'],
      onConfirm: why => { store.set(st => { st.sessions = st.sessions.filter(y => y.current); }, 'session-end-all'); return `${os.map(y => nameOf(y.who)).join(', ')} signed out. ${why}`; } });
  };
  const resetMfa = a => {
    adminConfirm({ title: `Reset MFA for ${first(a.name)}?`, verb: 'Reset MFA', action: 'mfa.reset', target: `${a.name} (${a.id})`,
      lead: <><p><b>{a.name}</b>'s authenticator stops working. They're signed out and set up a new one on their next sign-in.</p><p className="muted t-small">Only do this after confirming it's them on a call.</p></>,
      reasons: ['Lost or replaced phone, confirmed on a call', 'Authenticator app reinstalled'],
      onConfirm: () => store.set(st => { const y = st.admins.find(z => z.id === a.id); if (y) y.mfa = false; st.sessions = st.sessions.filter(z => nameOf(z.who) !== a.name); }, 'mfa-reset') });
  };

  return (
    <div className="view-in sec no-anchor" ref={root}>
      <header className="page-h">
        <div className="t"><p className="t-eyebrow">Your admin account</p><h1 className="t-h1">Security</h1>
          <p className="muted sec-lede">Who is signed in to the console, how they prove it's them, and the rules every admin password follows.</p></div>
        <Lq className="lq-s sec-out-top" data-out="" onClick={() => signOut()}><Icon n="logout" className="ic" />Sign out</Lq>
      </header>

      <div className="sec-grid">
        <div className="sec-main">
          <section className="card sec-card" aria-labelledby="secSessH">
            <div className="sec-h"><div><h2 className="t-h3" id="secSessH">Active sessions <span className="num sec-n">{sess.length}</span></h2>
              <p className="muted t-small">Ending a session signs that device out at once. The admin has to sign in again with their code.</p></div>
              {others.length ? <Lq className="lq-s lq-sm" data-endall="" onClick={endAll}>Sign out all other sessions</Lq> : null}</div>
            <ul className="sec-sess">{sess.map(x => { const who = nameOf(x.who), isMe = !!x.current; return (
              <li className={`sec-sess-i ${isMe ? 'is-cur' : ''}`} data-s={x.id} key={x.id}>
                <Av name={who} me={isMe} />
                <div className="sec-sess-t"><p><b>{isMe ? 'You' : who}</b>{` · ${x.device}`}{isMe ? <> <span className="pill pill-ok"><Icon n="check" />This device</span></> : null}</p>
                  <p className="sec-sess-m"><span className="num">{x.ip}</span><span>{`Signed in ${L.ago(x.since)}`}</span>{isMe && trusted ? <span>Trusted for 7 days</span> : null}</p></div>
                {isMe ? <span className="sec-sess-now">Current</span> : <button className="btn-q sec-end" type="button" data-end={x.id} onClick={() => end(x)}>End session<span className="sr-only">{` for ${who} on ${x.device}`}</span></button>}
              </li>); })}</ul>
            {!others.length ? <p className="sec-only"><Icon n="shield" />Only your session is active right now.</p> : null}
          </section>

          <section className="card sec-card" aria-labelledby="secTeamH">
            <div className="sec-h"><div><h2 className="t-h3" id="secTeamH">Admin team <span className="num sec-n">{s.admins.length}</span></h2>
              <p className="muted t-small">Everyone who can open this console, and what their role allows.</p></div></div>
            <ul className="sec-team">{s.admins.map(a => { const isMe = a.email === me.email, on = sess.some(x => nameOf(x.who) === a.name); return (
              <li className="sec-team-i" key={a.id}>
                <Av name={a.name} me={isMe} />
                <div className="sec-team-t"><p><b>{a.name}{isMe ? <> <span className="muted">(you)</span></> : null}</b><span className="pill pill-line sec-role">{a.role}</span></p>
                  <p className="sec-team-m"><span>{a.email}</span><span>{on ? <><span className="sec-on" aria-hidden="true"></span>Signed in now</> : 'Last seen ' + L.ago(a.lastSeen)}</span></p>
                  <p className="sec-team-r">{ROLES[a.role] || ''}</p></div>
                <div className="sec-team-a">{a.mfa ? <span className="pill pill-ok"><Icon n="shield" />MFA on</span> : <span className="pill pill-warn"><Icon n="clock" />Set-up pending</span>}
                  {!isMe && a.mfa ? <button className="btn-q" type="button" data-mfa={a.id} onClick={() => resetMfa(a)}>Reset MFA<span className="sr-only">{` for ${a.name}`}</span></button> : null}</div>
              </li>); })}</ul>
          </section>
        </div>

        <aside className="sec-side">
          <section className="ink-card dark sec-mfa" aria-labelledby="secMfaH">
            <p className="t-eyebrow">Two-step sign-in</p>
            <h2 className="t-h2" id="secMfaH">{s.session.mfa ? 'On for your account' : 'Not set up'}</h2>
            <dl className="sec-kv">
              <div><dt>Method</dt><dd>Authenticator app</dd></div>
              <div><dt>Required for</dt><dd>Every admin, every sign-in</dd></div>
              <div><dt>This device</dt><dd>{trusted ? 'Trusted for 7 days' : 'Asks for a code each time'}</dd></div>
              <div><dt>Recovery codes</dt><dd><span className="num">8 of 10</span> unused <span className="sample">Sample</span></dd></div>
            </dl>
            {trusted ? <button className="btn-q sec-untrust" type="button" data-untrust="" onClick={untrust}>Stop trusting this device</button> : null}
            <p className="sec-mfa-f"><Icon n="info" /><span>Lost phone? Another super admin resets your MFA from the team list after a call with you.</span></p>
          </section>

          <section className="card sec-card sec-pol" aria-labelledby="secPolH">
            <div className="sec-h"><h2 className="t-h3" id="secPolH">Password policy</h2></div>
            <ul className="sec-pol-l">{POLICY.map(p => <li key={p[0]}><span className="sec-pol-ic" aria-hidden="true"><Icon n="check" /></span><span><b>{p[0]}</b>{p[1]}</span></li>)}</ul>
            <Lq className="lq-s lq-sm" data-pw="" onClick={changePassword}>Change password</Lq>
          </section>

          <section className="card sec-card sec-out" aria-labelledby="secOutH">
            <h2 className="t-h3" id="secOutH">Sign out</h2>
            <p className="muted t-small">{`Ends your session on ${cur ? cur.device : 'this device'}. Other admins stay signed in. You'll need your code to come back.`}</p>
            <Lq className="lq-p" data-out="" onClick={() => signOut()}><Icon n="logout" className="ic" />Sign out of this device</Lq>
          </section>
        </aside>
      </div>
    </div>
  );
}

L.register('security', { title: 'Security', nav: 'security', Component: Security });
