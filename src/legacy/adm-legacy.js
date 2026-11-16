/* Temporary: the string-based admin kit for screens that are not components yet (the React one is lib/adm.jsx). */
(() => {
  const L = window.LLD, esc = L.esc;
  const mo = (fn, ...a) => { try { const m = L.motion; return m && m[fn] ? m[fn](...a) : null; } catch (e) { return null; } };
  const ui = () => { const s = S(); s.ui = s.ui || {}; return (s.ui.verify = s.ui.verify || { tab: 'all' }); };

  /* ---------- admin kit (shared with accounts.js) ---------- */
  const LOGLINE = `<p class="adm-log">${L.icon('shield')}<span>This is saved to the audit log with your name and the time. Entries cannot be edited or deleted.</span></p>`;
  /* confirm sheet: a reason is required (chip choice; "Other" needs a note). onConfirm({reason, note, body}) returns the audit detail */
  function confirm(o) {
    const id = 'adm' + Math.random().toString(36).slice(2, 7);
    const reasons = o.reasons || [];
    L.openSheet({
      title: o.title,
      body: `<form class="adm-form" novalidate>
        ${o.lead ? `<p class="adm-lead">${o.lead}</p>` : ''}
        ${o.summary || ''}
        ${reasons.length ? `<fieldset class="adm-fs"><legend class="t-label">${esc(o.reasonLabel || 'Reason')}</legend>
          <div class="adm-reasons" role="radiogroup">${reasons.map((r, i) => `<label class="adm-r"><input type="radio" name="${id}r" value="${esc(r)}"${o.preset === r ? ' checked' : ''}><span>${esc(r)}</span></label>`).join('')}
          <label class="adm-r"><input type="radio" name="${id}r" value="Other"><span>Other</span></label></div></fieldset>` : ''}
        ${o.extra || ''}
        <div class="field"><label for="${id}n">${esc(o.noteLabel || 'Note for the log')} <span class="adm-opt">${reasons.length ? 'Needed for Other' : 'Required'}</span></label>
          <textarea class="textarea" id="${id}n" rows="3" maxlength="280" placeholder="${esc(o.placeholder || 'What you saw and why you are doing this')}">${esc(o.note || '')}</textarea></div>
        <p class="err" role="alert" aria-live="polite" hidden></p>
        ${LOGLINE}
        <div class="adm-btns"><button class="lq ${o.danger ? 'lq-ink adm-danger' : 'lq-p'}" type="submit">${esc(o.cta)}</button><button class="lq lq-s" type="button" data-cancel>Cancel</button></div>
      </form>`,
      onMount(b, close) {
        const f = b.querySelector('form'), er = b.querySelector('.err');
        b.querySelector('[data-cancel]').addEventListener('click', () => close());
        o.mount && o.mount(b);
        f.addEventListener('submit', e => {
          e.preventDefault();
          const r = f.querySelector(`input[name="${id}r"]:checked`), note = b.querySelector('textarea').value.trim();
          let msg = '';
          if (reasons.length && !r) msg = 'Choose a reason. It goes into the audit log.';
          else if ((!reasons.length || (r && r.value === 'Other')) && note.length < 8) msg = 'Add a short note (8 characters or more) so the log explains this.';
          else if (o.validate) msg = o.validate(b) || '';
          if (msg) { er.textContent = msg; er.hidden = false; mo('shake', er); return; }
          const reason = r ? r.value : '';
          const detail = o.onConfirm({ reason, note, body: b });
          if (detail === false) return;
          close();
          L.toast('Logged to audit', 'check');
        });
      }
    });
  }
  const norm = n => String(n || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean);
  /* explains a name comparison in plain words: same / close (extra initial) / different */
  function nameMatch(a, b) {
    const x = norm(a), y = norm(b);
    if (!x.length || !y.length) return { k: 'none', t: 'Not provided' };
    if (x.join(' ') === y.join(' ')) return { k: 'ok', t: 'Same as the ID' };
    const [s, l] = x.length <= y.length ? [x, y] : [y, x];
    if (s.every(t => l.includes(t))) { const extra = l.filter(t => !s.includes(t)); return { k: 'close', t: `Close: adds ${extra.length === 1 && extra[0].length === 1 ? 'a middle initial “' + extra[0] + '”' : '“' + extra.join(' ') + '”'}` }; }
    if (x[x.length - 1] === y[y.length - 1]) return { k: 'bad', t: 'Different person, same surname' };
    return { k: 'bad', t: 'Different name' };
  }
  const mask = (v, keepS = 5, keepE = 1) => { v = String(v || ''); return v.length <= keepS + keepE ? v : v.slice(0, keepS) + '••••' + v.slice(-keepE); };
  const mailMask = m => { const [u, d] = String(m || '').split('@'); return d ? u.slice(0, 2) + '•••@' + d : m; };
  const FREE = ['gmail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'hotmail.com', 'rediffmail.com', 'proton.me'];
  const freeMail = m => FREE.includes(String(m || '').split('@')[1] || '');
  const STATES = { '07': 'Delhi', '27': 'Maharashtra', '29': 'Karnataka', '33': 'Tamil Nadu', '32': 'Kerala', '24': 'Gujarat', '06': 'Haryana' };
  const gstState = g => STATES[String(g || '').slice(0, 2)] || '';
  const av = (kind, name, cls = '') => `<span class="avatar ${kind === 'brand' ? 'v' : ''} ${cls}" aria-hidden="true">${esc(L.initials(name))}</span>`;
  L.adm = { confirm, nameMatch, mask, mailMask, freeMail, gstState, av, mo, LOGLINE };

})();
