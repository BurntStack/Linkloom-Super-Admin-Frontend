/* Security (#security, Builder A): identity and security for the admin console.
   MFA status (and resetting another admin's MFA), active sessions with invalidate (one, or all others), the admin team,
   the password policy with change password, and sign out. Destructive actions go through LLD.adminConfirm (reason + audit). */
(() => {
  'use strict';
  const L = window.LLD, { esc, icon, store } = L;
  const mo = (k, ...a) => { const f = L.motion && L.motion[k]; if (typeof f === 'function') { try { return f(...a); } catch (e) {} } };
  const first = n => String(n || '').trim().split(/\s+/)[0] || '';
  const nameOf = who => String(who || '').replace(/\s*\(you\)\s*$/, '');
  const av = (name, me) => `<span class="sec-av ${me ? 'is-me' : ''}" aria-hidden="true">${esc((String(name || '?').trim()[0] || '?').toUpperCase())}</span>`;
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

  function changePassword() {
    const sample = (L.adminAuth && L.adminAuth.SAMPLE) || {};
    L.openSheet({
      title: 'Change password',
      body: `<form class="sec-pw" novalidate>
        <div class="field" data-f="cur"><label for="sec-cur">Current password</label><input class="input" id="sec-cur" type="password" autocomplete="current-password" aria-describedby="sec-cur-e"><p class="err" id="sec-cur-e" aria-live="polite"></p></div>
        <div class="field" data-f="new"><label for="sec-new">New password</label><input class="input" id="sec-new" type="password" autocomplete="new-password" maxlength="64" aria-describedby="sec-rules sec-new-e"><p class="err" id="sec-new-e" aria-live="polite"></p></div>
        <ul class="sec-rules" id="sec-rules" aria-label="Your new password needs">${PWR.map(r => `<li data-r="${r[0]}"><span class="sec-rule-ic" aria-hidden="true">${icon('check')}</span><span>${esc(r[1])}</span><span class="sr-only" data-rs>, not yet</span></li>`).join('')}</ul>
        <div class="field" data-f="rep"><label for="sec-rep">Type it again</label><input class="input" id="sec-rep" type="password" autocomplete="new-password" maxlength="64" aria-describedby="sec-rep-e"><p class="err" id="sec-rep-e" aria-live="polite"></p></div>
        <p class="sec-pw-n">${icon('info')}<span>Changing it signs out your other devices. The change is logged; the password never is.</span></p>
        <div class="sec-acts"><button class="lq lq-p" type="submit">Change password</button><button class="btn-q" type="button" data-cancel>Cancel</button></div>
        <p class="sec-pw-s"><span class="sample">Sample</span> Current password is <b class="num">${esc(sample.pw || '')}</b></p>
      </form>`,
      onMount(b, close) {
        const $ = s => b.querySelector(s), cur = $('#sec-cur'), nw = $('#sec-new'), rep = $('#sec-rep');
        const err = (id, m) => { const f = b.querySelector(`[data-f="${id}"]`); f.classList.add('is-err'); f.querySelector('.err').textContent = m; f.querySelector('input').setAttribute('aria-invalid', 'true'); };
        const clr = id => { const f = b.querySelector(`[data-f="${id}"]`); f.classList.remove('is-err'); f.querySelector('.err').textContent = ''; f.querySelector('input').removeAttribute('aria-invalid'); };
        [['cur', cur], ['new', nw], ['rep', rep]].forEach(([k, i]) => i.addEventListener('input', () => clr(k)));
        nw.addEventListener('input', () => PWR.forEach(r => { const li = b.querySelector(`[data-r="${r[0]}"]`), ok = r[2](nw.value), was = li.classList.contains('is-ok'); li.classList.toggle('is-ok', ok); li.querySelector('[data-rs]').textContent = ok ? ', done' : ', not yet'; if (ok && !was) mo('check', li.querySelector('.sec-rule-ic'), { color: 'ink' }); }));
        $('[data-cancel]').addEventListener('click', () => close());
        $('form').addEventListener('submit', e => {
          e.preventDefault();
          let bad = false;
          if (cur.value !== sample.pw) { err('cur', cur.value ? 'That isn\'t your current password.' : 'Enter your current password.'); bad = true; }
          if (!PWR.every(r => r[2](nw.value))) { err('new', 'Meet every rule below first.'); bad = true; }
          else if (nw.value === cur.value) { err('new', 'Pick a password you haven\'t used before.'); bad = true; }
          if (!bad && rep.value !== nw.value) { err('rep', 'The two passwords don\'t match.'); bad = true; }
          if (bad) { const i = b.querySelector('.field.is-err input'); i && i.focus(); return; }
          if (L.adminAuth && L.adminAuth.SAMPLE) L.adminAuth.SAMPLE.pw = nw.value;
          L.audit('auth.password_change', store.s.me.name + ' (a1)', 'Changed by the account owner; other devices signed out');
          close(); L.toast('Password changed · Logged to audit', 'check');
        });
      }
    });
  }

  function render(el) {
    const draw = initial => {
      const s = store.s, me = s.me, sess = s.sessions, others = sess.filter(x => !x.current), cur = sess.find(x => x.current);
      const trusted = !!s.session.trusted;
      el.innerHTML = `<div class="view-in sec">
        <header class="page-h">
          <div class="t"><p class="t-eyebrow">Your admin account</p><h1 class="t-h1">Security</h1>
            <p class="muted sec-lede">Who is signed in to the console, how they prove it's them, and the rules every admin password follows.</p></div>
          <button class="lq lq-s sec-out-top" type="button" data-out>${icon('logout', 'ic')}Sign out</button>
        </header>

        <div class="sec-grid">
          <div class="sec-main">
            <section class="card sec-card" aria-labelledby="secSessH">
              <div class="sec-h"><div><h2 class="t-h3" id="secSessH">Active sessions <span class="num sec-n">${sess.length}</span></h2>
                <p class="muted t-small">Ending a session signs that device out at once. The admin has to sign in again with their code.</p></div>
                ${others.length ? `<button class="lq lq-s lq-sm" type="button" data-endall>Sign out all other sessions</button>` : ''}</div>
              <ul class="sec-sess">${sess.map(x => { const who = nameOf(x.who), isMe = !!x.current; return `<li class="sec-sess-i ${isMe ? 'is-cur' : ''}" data-s="${esc(x.id)}">
                ${av(who, isMe)}
                <div class="sec-sess-t"><p><b>${esc(isMe ? 'You' : who)}</b> · ${esc(x.device)}${isMe ? ' <span class="pill pill-ok">' + icon('check') + 'This device</span>' : ''}</p>
                  <p class="sec-sess-m"><span class="num">${esc(x.ip)}</span><span>Signed in ${esc(L.ago(x.since))}</span>${isMe && trusted ? '<span>Trusted for 7 days</span>' : ''}</p></div>
                ${isMe ? `<span class="sec-sess-now">Current</span>` : `<button class="btn-q sec-end" type="button" data-end="${esc(x.id)}">End session<span class="sr-only"> for ${esc(who)} on ${esc(x.device)}</span></button>`}</li>`; }).join('')}</ul>
              ${!others.length ? `<p class="sec-only">${icon('shield')}Only your session is active right now.</p>` : ''}
            </section>

            <section class="card sec-card" aria-labelledby="secTeamH">
              <div class="sec-h"><div><h2 class="t-h3" id="secTeamH">Admin team <span class="num sec-n">${s.admins.length}</span></h2>
                <p class="muted t-small">Everyone who can open this console, and what their role allows.</p></div></div>
              <ul class="sec-team">${s.admins.map(a => { const isMe = a.email === me.email, on = sess.some(x => nameOf(x.who) === a.name); return `<li class="sec-team-i">
                ${av(a.name, isMe)}
                <div class="sec-team-t"><p><b>${esc(a.name)}${isMe ? ' <span class="muted">(you)</span>' : ''}</b><span class="pill pill-line sec-role">${esc(a.role)}</span></p>
                  <p class="sec-team-m"><span>${esc(a.email)}</span><span>${on ? '<span class="sec-on" aria-hidden="true"></span>Signed in now' : 'Last seen ' + esc(L.ago(a.lastSeen))}</span></p>
                  <p class="sec-team-r">${esc(ROLES[a.role] || '')}</p></div>
                <div class="sec-team-a">${a.mfa ? `<span class="pill pill-ok">${icon('shield')}MFA on</span>` : `<span class="pill pill-warn">${icon('clock')}Set-up pending</span>`}
                  ${!isMe && a.mfa ? `<button class="btn-q" type="button" data-mfa="${esc(a.id)}">Reset MFA<span class="sr-only"> for ${esc(a.name)}</span></button>` : ''}</div></li>`; }).join('')}</ul>
            </section>
          </div>

          <aside class="sec-side">
            <section class="ink-card dark sec-mfa" aria-labelledby="secMfaH">
              <p class="t-eyebrow">Two-step sign-in</p>
              <h2 class="t-h2" id="secMfaH">${s.session.mfa ? 'On for your account' : 'Not set up'}</h2>
              <dl class="sec-kv">
                <div><dt>Method</dt><dd>Authenticator app</dd></div>
                <div><dt>Required for</dt><dd>Every admin, every sign-in</dd></div>
                <div><dt>This device</dt><dd>${trusted ? 'Trusted for 7 days' : 'Asks for a code each time'}</dd></div>
                <div><dt>Recovery codes</dt><dd><span class="num">8 of 10</span> unused <span class="sample">Sample</span></dd></div>
              </dl>
              ${trusted ? `<button class="btn-q sec-untrust" type="button" data-untrust>Stop trusting this device</button>` : ''}
              <p class="sec-mfa-f">${icon('info')}<span>Lost phone? Another super admin resets your MFA from the team list after a call with you.</span></p>
            </section>

            <section class="card sec-card sec-pol" aria-labelledby="secPolH">
              <div class="sec-h"><h2 class="t-h3" id="secPolH">Password policy</h2></div>
              <ul class="sec-pol-l">${POLICY.map(p => `<li><span class="sec-pol-ic" aria-hidden="true">${icon('check')}</span><span><b>${esc(p[0])}</b>${esc(p[1])}</span></li>`).join('')}</ul>
              <button class="lq lq-s lq-sm" type="button" data-pw>Change password</button>
            </section>

            <section class="card sec-card sec-out" aria-labelledby="secOutH">
              <h2 class="t-h3" id="secOutH">Sign out</h2>
              <p class="muted t-small">Ends your session on ${esc(cur ? cur.device : 'this device')}. Other admins stay signed in. You'll need your code to come back.</p>
              <button class="lq lq-p" type="button" data-out>${icon('logout', 'ic')}Sign out of this device</button>
            </section>
          </aside>
        </div>
      </div>`;
      L.liquid(el);
      if (initial) mo('stagger', L.$$('.sec-sess-i, .sec-team-i', el));
    };

    const onClick = e => {
      const t = e.target.closest('button'); if (!t) return;
      const s = store.s;
      if (t.hasAttribute('data-out')) { L.adminAuth ? L.adminAuth.signOut() : (store.set(x => { x.session.signedIn = false; }), L.go('#login')); return; }
      if (t.hasAttribute('data-pw')) { changePassword(); return; }
      if (t.hasAttribute('data-untrust')) { store.set(x => { x.session.trusted = false; }, 'untrust'); L.audit('mfa.untrust', 'This device', 'Trusted device removed by the account owner'); L.toast('Logged to audit', 'check'); return; }
      if (t.dataset.end) {
        const x = s.sessions.find(y => y.id === t.dataset.end); if (!x) return;
        const who = nameOf(x.who);
        L.adminConfirm({ title: 'End this session?', verb: 'End session', action: 'session.invalidate', target: `${who} · ${x.device}`,
          lead: `<p><b>${esc(who)}</b> is signed in on ${esc(x.device)} from <span class="num">${esc(x.ip)}</span>, since ${esc(L.ago(x.since))}.</p><p class="muted t-small">They're signed out at once and need their authenticator code to come back.</p>`,
          reasons: ['Device reported lost or stolen', 'Unfamiliar location for this admin', 'Role change; fresh sign-in needed'],
          onConfirm: () => store.set(st => { st.sessions = st.sessions.filter(y => y.id !== x.id); }, 'session-end') });
        return;
      }
      if (t.hasAttribute('data-endall')) {
        const others = s.sessions.filter(y => !y.current); if (!others.length) return;
        L.adminConfirm({ title: 'Sign out all other sessions?', verb: `End ${others.length} session${others.length === 1 ? '' : 's'}`, action: 'session.invalidate_all', target: `${others.length} other session${others.length === 1 ? '' : 's'}`,
          lead: `<p>This signs out ${others.map(y => `<b>${esc(first(nameOf(y.who)))}</b>`).join(' and ')}. Your own session stays.</p><dl>${others.map(y => `<div class="kv"><dt>${esc(nameOf(y.who))}</dt><dd>${esc(y.device)}</dd></div>`).join('')}</dl>`,
          reasons: ['Suspected credential leak', 'Security review: everyone signs in fresh', 'After a password policy change'],
          onConfirm: why => { store.set(st => { st.sessions = st.sessions.filter(y => y.current); }, 'session-end-all'); return `${others.map(y => nameOf(y.who)).join(', ')} signed out. ${why}`; } });
        return;
      }
      if (t.dataset.mfa) {
        const a = s.admins.find(y => y.id === t.dataset.mfa); if (!a) return;
        L.adminConfirm({ title: `Reset MFA for ${first(a.name)}?`, verb: 'Reset MFA', action: 'mfa.reset', target: `${a.name} (${a.id})`,
          lead: `<p><b>${esc(a.name)}</b>'s authenticator stops working. They're signed out and set up a new one on their next sign-in.</p><p class="muted t-small">Only do this after confirming it's them on a call.</p>`,
          reasons: ['Lost or replaced phone, confirmed on a call', 'Authenticator app reinstalled'],
          onConfirm: () => store.set(st => { const y = st.admins.find(z => z.id === a.id); if (y) y.mfa = false; st.sessions = st.sessions.filter(z => nameOf(z.who) !== a.name); }, 'mfa-reset') });
      }
    };
    el.addEventListener('click', onClick);
    draw(true);
    let raf = 0;
    const off = store.on(why => { if (/^notif|^audit$/.test(String(why))) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (el.isConnected) draw(false); }); });
    return () => { off(); cancelAnimationFrame(raf); };
  }

  L.register('security', { title: 'Security', nav: 'security', crumb: 'Your account', render });
})();
