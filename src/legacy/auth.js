/* auth (Builder A): #login for the Super Admin console. shell:'focus', auth:false.
   Two steps: work email + password, then a 6-digit code from an authenticator app (no SMS for admins).
   Rules shown in the UI (the server enforces them in production):
   - only @linkloom.in staff accounts; a wrong email and a wrong password get the same message
   - 5 wrong passwords pause sign-in for 15 minutes and alert the security team; 5 wrong codes send you back to step 1
   - "Trust this device" is off by default and lasts 7 days; leave it off on shared computers
   Also exposes:
   - LLD.adminAuth.signOut({ reason })       ends this session, logs it, lands on #login-out
   - LLD.adminConfirm({...})                 the confirm sheet every destructive admin action uses (reason required, logged) */
(() => {
  'use strict';
  const L = window.LLD, { esc, icon, store } = L;
  const mo = (k, ...a) => { const f = L.motion && L.motion[k]; if (typeof f === 'function') { try { return f(...a); } catch (e) {} } };
  const now = () => Date.now();
  const EMAIL = 'kavya@linkloom.in', PW = 'Loom#Admin26', CODE = '582044', PW_TRIES = 5, CODE_TRIES = 5, LOCK = 15 * 60;
  const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const setLabel = (b, t) => b && b.querySelectorAll('.t,.t2').forEach(s => { s.innerHTML = t; });
  const maskEmail = e => { const [u, d] = String(e).split('@'); return d ? u.slice(0, 2) + '••••@' + d : e; };
  const istTime = d => { try { return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(d).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase()); } catch (e) { return ''; } };

  /* ---------- shared: confirm sheet for destructive admin actions ----------
     LLD.adminConfirm({ title, lead, verb, action, target, reasons:[...], tone:'danger'|'plain', onConfirm(reason) → detail? })
     It always asks for a reason, says the action will be logged, calls LLD.audit(action, target, detail) and toasts "Logged to audit". */
  function adminConfirm(o) {
    const reasons = o.reasons || [];
    L.openSheet({
      title: o.title,
      body: `<form class="auth-cf" novalidate>
        ${o.lead ? `<div class="auth-cf-lead">${o.lead}</div>` : ''}
        ${reasons.length ? `<div class="field"><span class="lab" id="auth-cf-rl">Common reasons</span><div class="chips" role="group" aria-labelledby="auth-cf-rl">${reasons.map(r => `<button class="chip" type="button" data-r aria-pressed="false">${esc(r)}</button>`).join('')}</div></div>` : ''}
        <div class="field" data-f="why"><label for="auth-cf-why">Reason <span class="muted">(required)</span></label>
          <textarea class="textarea" id="auth-cf-why" maxlength="240" aria-describedby="auth-cf-h auth-cf-e" placeholder="Say what you saw. Another admin should understand it without asking you."></textarea>
          <p class="help" id="auth-cf-h"><span data-n>0</span>/240</p><p class="err" id="auth-cf-e" aria-live="polite"></p></div>
        <p class="auth-cf-log">${icon('shield')}<span>This will be logged as <code>${esc(o.action)}</code> under ${esc(store.s.me.name)}, with your reason. Audit entries can't be edited or deleted.</span></p>
        <div class="auth-cf-acts"><button class="lq ${o.tone === 'plain' ? 'lq-p' : 'lq-p auth-cf-danger'}" type="submit">${esc(o.verb)}</button><button class="btn-q" type="button" data-cancel>Cancel</button></div>
      </form>`,
      onMount(b, close) {
        const f = b.querySelector('form'), ta = b.querySelector('textarea'), n = b.querySelector('[data-n]'), fld = b.querySelector('[data-f="why"]'), er = b.querySelector('.err');
        const upd = () => { n.textContent = ta.value.length; fld.classList.remove('is-err'); er.textContent = ''; ta.removeAttribute('aria-invalid'); };
        ta.addEventListener('input', upd);
        b.querySelectorAll('[data-r]').forEach(c => c.addEventListener('click', () => {
          b.querySelectorAll('[data-r]').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
          ta.value = c.textContent; upd(); ta.focus();
        }));
        b.querySelector('[data-cancel]').addEventListener('click', () => close());
        f.addEventListener('submit', e => {
          e.preventDefault();
          const why = ta.value.trim();
          if (why.length < 6) { fld.classList.add('is-err'); er.textContent = 'Add a reason of a few words. It goes into the audit log.'; ta.setAttribute('aria-invalid', 'true'); ta.focus(); mo('shake', ta); return; }
          let detail = why;
          try { const d = o.onConfirm && o.onConfirm(why); if (typeof d === 'string') detail = d; } catch (err) { console.error(err); }
          L.audit(o.action, o.target, detail);
          close();
          L.toast('Logged to audit', 'check');
          o.after && o.after();
        });
      }
    });
  }
  L.adminConfirm = adminConfirm;

  function signOut(opts = {}) {
    L.audit('auth.logout', 'Admin console', opts.reason || 'Signed out on this device');
    store.set(s => { s.session.signedIn = false; }, 'signed-out');
    L.closeSheet(true);
    L.go('#login-' + (opts.param || 'out'));
  }
  L.adminAuth = { signOut, SAMPLE: { email: EMAIL, pw: PW, code: CODE } };

  /* ---------- pieces ---------- */
  const note = (kind, ic, html, attrs = '') => `<div class="auth-note auth-note-${kind}" ${attrs}>${icon(ic)}<div>${html}</div></div>`;
  const art = `<section class="focus-art dark auth-art" aria-label="Linkloom admin console">
      <p class="auth-brand"><img src="assets/logo-mark.svg" width="28" height="28" alt=""><span>linkloom</span><span class="auth-for">Admin</span></p>
      <h2 class="t-display auth-line">Keep the marketplace honest.</h2>
      <ul class="auth-facts" aria-label="How this console works">
        <li>${icon('shield')}<span>Two-step sign-in for every admin</span></li>
        <li>${icon('file')}<span>Every action is sealed in the audit log</span></li>
        <li>${icon('lock')}<span>Escrow moves only with a reason on record</span></li>
      </ul>
      <img class="auth-rings" src="assets/admin-rings.svg" width="420" height="310" alt="">
      <p class="auth-art-foot">Restricted to Linkloom staff. Each sign-in is logged with device, IP and city.</p>
    </section>`;

  function otpBoxes(host, onFull) {
    host.innerHTML = `<div class="auth-boxes" role="group" aria-label="6-digit authenticator code">${[0, 1, 2, 3, 4, 5].map(i =>
      `<input class="auth-box${i === 2 ? ' is-gap' : ''}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder=" " autocomplete="${i ? 'off' : 'one-time-code'}" aria-label="Digit ${i + 1} of 6">`).join('')}</div>`;
    const boxes = [...host.querySelectorAll('.auth-box')];
    const code = () => boxes.map(b => b.value).join('');
    const changed = () => { host.classList.remove('is-err'); boxes.forEach(b => b.removeAttribute('aria-invalid')); onFull(code().length === 6, code()); };
    const fill = (str, from) => { String(str).replace(/\D/g, '').slice(0, 6 - from).split('').forEach((c, k) => { boxes[from + k].value = c; }); changed(); (boxes.find(x => !x.value) || boxes[5]).focus(); };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => { const d = b.value.replace(/\D/g, ''); if (d.length > 1) { fill(d, i); return; } b.value = d; if (d && i < 5) boxes[i + 1].focus(); changed(); });
      b.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].focus(); e.preventDefault(); changed(); }
        else if (e.key === 'ArrowLeft' && i > 0) { boxes[i - 1].focus(); e.preventDefault(); }
        else if (e.key === 'ArrowRight' && i < 5) { boxes[i + 1].focus(); e.preventDefault(); }
      });
      b.addEventListener('focus', () => b.select());
      b.addEventListener('paste', e => { e.preventDefault(); fill((e.clipboardData || window.clipboardData).getData('text'), 0); });
    });
    return {
      code, boxes,
      bad() { host.classList.add('is-err'); boxes.forEach(b => { b.setAttribute('aria-invalid', 'true'); b.value = ''; }); mo('shake', host.firstElementChild); boxes[0].focus(); },
      disable(on) { boxes.forEach(b => { b.disabled = on; }); },
      focus() { (boxes.find(x => !x.value) || boxes[0]).focus(); }
    };
  }

  /* ---------- #login (#login-out, #login-expired, #login-ended) ---------- */
  const LS = { step: 'pw', email: '', tries: 0, lockEnd: 0, codeTries: 0, remember: false };

  function renderLogin(el, param) {
    if (store.s.session.signedIn) { location.replace('#home'); return null; }
    const flash = {
      out: ['info', 'logout', 'You\'re signed out on this device. Other admins\' sessions are unchanged.'],
      expired: ['info', 'clock', 'Your session ended after 30 minutes without activity. Sign in again to continue.'],
      ended: ['warn', 'shield', 'Another super admin ended this session. If you didn\'t expect that, tell the security team before signing in.']
    }[param];
    el.innerHTML = `<div class="focus auth">${art}<section class="focus-form light auth-form"><div class="auth-in" data-host></div><p class="sr-only" aria-live="polite" data-live></p></section></div>`;
    const host = el.querySelector('[data-host]'), live = el.querySelector('[data-live]');
    let alive = true, timer = 0, totp = 0;
    const onNet = () => { const o = el.querySelector('[data-offline]'); if (o) o.hidden = navigator.onLine; };
    addEventListener('online', onNet); addEventListener('offline', onNet);

    const offline = () => note('err', 'alert', '<p>You\'re offline. Check your connection, then try again.</p>', `data-offline role="status" ${navigator.onLine ? 'hidden' : ''}`);

    /* step 1: email + password */
    function paintPw() {
      LS.step = 'pw';
      host.innerHTML = `<div class="auth-head"><p class="t-eyebrow">Step 1 of 2</p><h1 class="t-h1" tabindex="-1" data-h>Admin sign-in</h1>
          <p class="muted">Use your Linkloom staff account. You'll confirm with your authenticator app next.</p></div>
        ${flash && LS.step === 'pw' && !LS.tries ? note(flash[0], flash[1], `<p>${flash[2]}</p>`, 'role="status"') : ''}
        ${offline()}
        <form class="auth-stack" novalidate data-form>
          <div class="field" data-f="email"><label for="auth-email">Work email</label>
            <input class="input" id="auth-email" type="email" autocomplete="username" spellcheck="false" autocapitalize="off" placeholder="name@linkloom.in" value="${esc(LS.email)}" aria-describedby="auth-email-e">
            <p class="err" id="auth-email-e" aria-live="polite"></p></div>
          <div class="field" data-f="pw"><label for="auth-pw">Password</label>
            <div class="auth-pw"><input class="input" id="auth-pw" type="password" autocomplete="current-password" spellcheck="false" autocapitalize="off" maxlength="64" aria-describedby="auth-pw-e auth-lock-h">
              <button type="button" class="auth-eye" data-eye aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div>
            <p class="err" id="auth-pw-e" aria-live="polite"></p></div>
          <div data-status></div>
          <div class="auth-acts"><button class="lq lq-p auth-go" type="submit" data-submit>Continue ${icon('arrow', 'ic')}</button></div>
          <p class="auth-lockh" id="auth-lock-h">${icon('lock')}<span>${PW_TRIES} wrong attempts pause sign-in for 15 minutes and alert the security team.</span></p>
        </form>
        <div class="auth-sample">
          <span class="sample">Sample account</span>
          <p class="auth-hint"><b>${EMAIL}</b> · <b class="num">${esc(PW)}</b></p>
          <button class="btn-q auth-samplebtn" type="button" data-fill>Fill sample details</button>
        </div>
        <p class="auth-legal">Forgot your password or lost your phone? Ask another super admin to reset it from Security. Linkloom staff never ask for your code.</p>`;
      L.liquid(host);
      const $ = s => host.querySelector(s), form = $('[data-form]'), email = $('#auth-email'), pw = $('#auth-pw'), go = $('[data-submit]'), status = $('[data-status]');
      const err = (id, msg) => { const f = host.querySelector(`[data-f="${id}"]`); f.classList.add('is-err'); f.querySelector('.err').innerHTML = msg; f.querySelector('input').setAttribute('aria-invalid', 'true'); };
      const clr = id => { const f = host.querySelector(`[data-f="${id}"]`); f.classList.remove('is-err'); f.querySelector('.err').textContent = ''; f.querySelector('input').removeAttribute('aria-invalid'); };
      $('[data-eye]').addEventListener('click', e => { const b = e.currentTarget, show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); b.classList.toggle('is-on', show); });
      $('[data-fill]').addEventListener('click', () => { email.value = EMAIL; pw.value = PW; LS.email = EMAIL; clr('email'); clr('pw'); live.textContent = 'Sample details filled'; go.focus(); });
      email.addEventListener('input', () => { clr('email'); LS.email = email.value; });
      pw.addEventListener('input', () => clr('pw'));
      const lockTick = () => {
        if (!alive) return;
        const left = Math.ceil((LS.lockEnd - now()) / 1000);
        if (left > 0) {
          go.disabled = true; go.setAttribute('aria-disabled', 'true');
          const t = status.querySelector('[data-cd]');
          if (t) t.textContent = mmss(left);
          else status.innerHTML = note('warn', 'lock', `<p class="t-label">Sign-in paused for <span class="num" data-cd>${mmss(left)}</span></p><p>${PW_TRIES} wrong attempts on ${esc(maskEmail(LS.email || EMAIL))}. We've alerted the security team. If this wasn't you, tell them on #security.</p>`, 'role="status"');
          timer = setTimeout(lockTick, 1000);
        } else if (LS.lockEnd) { LS.lockEnd = 0; LS.tries = 0; go.disabled = false; go.removeAttribute('aria-disabled'); status.innerHTML = ''; }
      };
      lockTick();
      form.addEventListener('submit', e => {
        e.preventDefault();
        if (LS.lockEnd > now()) return;
        if (!navigator.onLine) { onNet(); return; }
        const ev = email.value.trim().toLowerCase(), pv = pw.value;
        let bad = false;
        if (!ev) { err('email', 'Enter your work email.'); bad = true; }
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ev)) { err('email', 'That email looks incomplete.'); bad = true; }
        else if (!/@linkloom\.in$/.test(ev)) { err('email', 'Admin accounts use a <b>@linkloom.in</b> address.'); bad = true; }
        if (!pv) { err('pw', 'Enter your password.'); bad = true; }
        if (bad) { const i = host.querySelector('.field.is-err input'); i && i.focus(); return; }
        if (ev !== EMAIL || pv !== PW) {
          LS.tries++;
          const left = PW_TRIES - LS.tries;
          if (left <= 0) { LS.lockEnd = now() + LOCK * 1000; pw.value = ''; lockTick(); live.textContent = 'Sign-in paused for 15 minutes'; return; }
          err('pw', `That email and password don't match. ${left} ${left === 1 ? 'try' : 'tries'} left before a 15-minute pause.`);
          pw.value = ''; pw.focus(); mo('shake', pw.parentElement);
          return;
        }
        LS.tries = 0; LS.email = ev;
        go.disabled = true; setLabel(go, 'Checking…');
        timer = setTimeout(() => { if (alive) mo('swap', host, paintCode, { dir: 1 }); else paintCode(); }, 380);
      });
      const h = host.querySelector('[data-h]'); if (LS.focusHead) { h.focus({ preventScroll: true }); LS.focusHead = false; }
    }

    /* step 2: authenticator code */
    function paintCode() {
      LS.step = 'code'; LS.codeTries = 0;
      host.innerHTML = `<button class="btn-q auth-back" type="button" data-back>${icon('back')}Use a different account</button>
        <div class="auth-head"><p class="t-eyebrow">Step 2 of 2</p><h1 class="t-h1" tabindex="-1" data-h>Enter your code</h1>
          <p class="muted">Open your authenticator app and type the 6-digit code for <b class="auth-who">Linkloom Admin · ${esc(maskEmail(LS.email))}</b>.</p></div>
        ${offline()}
        <form class="auth-stack" novalidate data-form>
          <div data-otp></div>
          <div class="auth-totp" aria-hidden="true"><span class="auth-totp-bar"><i data-tb></i></span><span class="num" data-tt></span></div>
          <p class="err" data-oerr aria-live="polite"></p>
          <label class="check auth-remember"><input type="checkbox" data-remember ${LS.remember ? 'checked' : ''} aria-describedby="auth-rem-h"><span><b>Trust this device for 7 days</b><span class="help" id="auth-rem-h">Off by default. Leave it off on shared or office computers.</span></span></label>
          <div class="auth-acts"><button class="lq lq-p auth-go" type="submit" data-submit disabled aria-disabled="true">Verify and sign in ${icon('arrow', 'ic')}</button></div>
        </form>
        <div class="auth-sample"><span class="sample">Sample code</span><p class="auth-hint">Your authenticator shows <b class="num">${CODE.slice(0, 3)} ${CODE.slice(3)}</b> for this account.</p></div>
        <p class="auth-legal">No access to your app? Another super admin can reset your MFA from Security after confirming it's you on a call.</p>`;
      L.liquid(host);
      const $ = s => host.querySelector(s), go = $('[data-submit]'), oerr = $('[data-oerr]'), rem = $('[data-remember]');
      rem.addEventListener('change', () => { LS.remember = rem.checked; });
      const otp = otpBoxes($('[data-otp]'), full => { oerr.textContent = ''; go.disabled = !full; full ? go.removeAttribute('aria-disabled') : go.setAttribute('aria-disabled', 'true'); });
      $('[data-back]').addEventListener('click', () => { clearTimeout(totp); LS.focusHead = true; mo('swap', host, paintPw, { dir: -1 }); });
      /* the 30-second authenticator window, so a late code makes sense */
      const tb = $('[data-tb]'), tt = $('[data-tt]');
      const win = () => { if (!alive || LS.step !== 'code') return; const left = 30 - Math.floor(now() / 1000) % 30; tt.textContent = `New code in ${left} s`; tb.style.transform = `scaleX(${(left / 30).toFixed(3)})`; tb.parentElement.classList.toggle('is-low', left <= 5); totp = setTimeout(win, 1000); };
      win();
      $('[data-form]').addEventListener('submit', e => {
        e.preventDefault();
        if (otp.code().length < 6) return;
        if (!navigator.onLine) { onNet(); return; }
        if (otp.code() !== CODE) {
          LS.codeTries++;
          const left = CODE_TRIES - LS.codeTries;
          if (left <= 0) { clearTimeout(totp); LS.tries = PW_TRIES - 1; LS.focusHead = true; mo('swap', host, paintPw, { dir: -1 }); setTimeout(() => { const s = host.querySelector('[data-status]'); if (s) s.innerHTML = note('warn', 'shield', `<p class="t-label">Too many wrong codes</p><p>We've sent you back to step 1 and told the security team. One more wrong password pauses sign-in for 15 minutes.</p>`, 'role="status"'); }, 0); return; }
          oerr.textContent = `That code didn't match. Codes change every 30 seconds; check your phone's clock is set automatically. ${left} ${left === 1 ? 'try' : 'tries'} left.`;
          otp.bad(); go.disabled = true; go.setAttribute('aria-disabled', 'true');
          return;
        }
        otp.disable(true); go.disabled = true; setLabel(go, `${icon('check', 'ic')} Signed in`);
        mo('check', go.querySelector('.t svg'), { color: 'butter' });
        live.textContent = 'Code accepted. Signing you in.';
        const at = L.today().toISOString();
        store.set(s => {
          s.session.signedIn = true; s.session.mfa = true; s.session.since = at; s.session.trusted = LS.remember;
          const cur = s.sessions.find(x => x.current); if (cur) cur.since = at;
          else s.sessions.unshift({ id: 's' + (s.sessions.length + 1), who: s.me.name + ' (you)', device: 'Chrome · macOS', ip: '49.207.••.18 · Bengaluru', since: at, current: true });
        }, 'signed-in');
        L.audit('auth.login', 'Admin console', 'Password + authenticator code' + (LS.remember ? ' · device trusted for 7 days' : ''));
        LS.step = 'pw'; LS.tries = 0;
        timer = setTimeout(() => L.go('#home'), 520);
      });
      const h = $('[data-h]'); h && h.focus({ preventScroll: true });
      setTimeout(() => alive && otp.focus(), 60);
    }

    paintPw();
    return () => { alive = false; clearTimeout(timer); clearTimeout(totp); removeEventListener('online', onNet); removeEventListener('offline', onNet); };
  }

  L.register('login', { title: 'Admin sign-in', shell: 'focus', auth: false, render: renderLogin });
})();
