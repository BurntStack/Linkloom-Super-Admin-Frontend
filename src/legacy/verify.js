/* Verification desk (#verify, #verify-<id>). Owner: Builder B.
   Creator KYC (ID, PAN, payout, selfie, socials) and brand verification (GSTIN, company PAN, CIN, authorised person, billing) in one queue.
   Decisions: Approve / Reject (reason) / Ask for more info (items + message). Every decision opens a sheet, states it is logged, calls LLD.audit.
   Also defines the small admin kit LLD.adm (confirm sheet with reason, name match, masks), reused by accounts.js. Classes are .vfy-* (and .adm-*). */
(() => {
  const L = window.LLD, esc = L.esc, S = () => window.LLD_DATA;
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

  /* ---------- data guard: the ID check is the source of truth for age. v3 is flagged under 18, so its DOB must read under 18 too. ---------- */
  S().verifications.forEach(v => { if (v.id_doc && v.id_doc.match === 'under18' && L.ageFrom(v.id_doc.dob) >= 18) { const d = v.id_doc.dob.split('-'); d[0] = String(L.today().getFullYear() - 17 - (+d[1] > L.today().getMonth() + 1 ? 1 : 0)); v.id_doc.dob = d.join('-'); } });

  /* ---------- checks: one list per request, used by the queue row, the summary and the problem band ---------- */
  const SLA_H = { creator: 24, brand: 48 };
  const ageH = v => (L.today() - L.D(v.submitted)) / 36e5;
  const sla = v => {
    const left = SLA_H[v.kind] - ageH(v), h = Math.abs(left);
    const t = h < 1 ? Math.round(h * 60) + ' min' : Math.round(h) + ' h';
    return left < 0 ? { k: 'over', t: 'Over SLA by ' + t, cls: 'pill-err', ic: 'alert' } : left < 6 ? { k: 'soon', t: 'Due in ' + t, cls: 'pill-warn', ic: 'clock' } : { k: 'ok', t: 'Due in ' + t, cls: 'pill-paper', ic: 'clock' };
  };
  function checks(v) {
    const out = [];
    if (v.kind === 'creator') {
      const d = v.id_doc, age = L.ageFrom(d.dob);
      out.push({ k: 'id', n: 'ID', ok: d.match === 'ok' && age >= 18 ? 'ok' : 'bad', t: age < 18 ? `Under 18 (age ${age})` : `${d.type} · age ${age}` });
      const pm = nameMatch(d.name, v.pan.name);
      out.push({ k: 'pan', n: 'PAN', ok: v.pan.match === 'ok' && pm.k === 'ok' ? 'ok' : pm.k === 'close' ? 'warn' : 'bad', t: pm.t });
      const bm = nameMatch(d.name, v.bank.holder);
      out.push({ k: 'bank', n: v.bank.kind === 'UPI' ? 'UPI' : 'Bank', ok: v.bank.match === 'ok' ? 'ok' : bm.k === 'close' ? 'warn' : 'bad', t: v.bank.match === 'ok' ? 'Holder matches' : bm.t });
      out.push({ k: 'face', n: 'Selfie', ok: v.selfie.liveness === 'passed' && v.selfie.faceMatch >= 85 ? 'ok' : 'bad', t: `Live · ${v.selfie.faceMatch}% face match` });
      const unl = v.socials.filter(x => !x.linked);
      out.push({ k: 'soc', n: 'Socials', ok: unl.length ? 'warn' : 'ok', t: unl.length ? `${unl.length} not linked by login` : `${v.socials.length} linked by login` });
    } else {
      const b = v.business, p = v.person;
      out.push({ k: 'gst', n: 'GSTIN', ok: b.gstin && b.gstinStatus === 'Active' ? 'ok' : 'bad', t: b.gstin ? `${b.gstinStatus} · ${gstState(b.gstin)}` : 'Not provided' });
      out.push({ k: 'pan', n: 'Company PAN', ok: b.pan && b.panFromGstin && b.gstin.slice(2, 12) === b.pan ? 'ok' : 'bad', t: b.pan ? 'Matches the GSTIN' : 'Not provided' });
      out.push({ k: 'cin', n: 'CIN', ok: b.cin ? 'ok' : 'warn', t: b.cin ? 'Registered company' : 'Not provided' });
      out.push({ k: 'per', n: 'Authorised person', ok: p.name && p.name !== '—' ? 'ok' : 'bad', t: p.name && p.name !== '—' ? `${p.name}, ${p.designation}` : 'Not named' });
      out.push({ k: 'mail', n: 'Business mail', ok: p.mailVerified && !freeMail(p.mail) ? 'ok' : 'bad', t: freeMail(p.mail) ? 'Free mail, not a company domain' : p.mailVerified ? 'Verified' : 'Not verified' });
      out.push({ k: 'bill', n: 'Billing', ok: v.billing.address ? 'ok' : 'warn', t: v.billing.address ? 'Address on file' : 'Missing' });
    }
    return out;
  }
  /* problem band: what blocks approval, in words an admin can act on */
  function problems(v) {
    const p = [];
    if (v.kind === 'creator') {
      const age = L.ageFrom(v.id_doc.dob);
      if (age < 18) p.push({ block: true, h: `Under 18: ${esc(v.name.split(' ')[0])} is ${age}`, d: 'Linkloom accounts are 18+. This cannot be approved. Reject it and say they can apply again after their 18th birthday.' });
      if (v.bank.match !== 'ok') { const bm = nameMatch(v.id_doc.name, v.bank.holder); p.push({ block: bm.k === 'bad', h: bm.k === 'close' ? 'Payout holder name is close, not exact' : 'Payout account belongs to someone else', d: bm.k === 'close' ? `The account is in the name “${esc(v.bank.holder)}”; the ID reads “${esc(v.id_doc.name)}”. ${esc(v.note || '')}${v.note ? '. ' : ''}Usually fine; ask for a bank letter if unsure.` : `The ${v.bank.kind === 'UPI' ? 'UPI ID' : 'account'} is held by “${esc(v.bank.holder)}”. Payouts must go to the creator’s own account.` }); }
      if (v.socials.some(x => !x.linked)) p.push({ block: false, h: 'Instagram not linked by login', d: 'Follower numbers are self-reported until they connect the account.' });
    } else {
      if (!v.business.gstin && !v.business.legal) p.push({ block: true, h: 'No business details at all', d: 'No legal name, GSTIN, PAN or CIN, and no named person. Ask for them, or reject if the account looks like a scam.' });
      if (freeMail(v.person.mail) || !v.person.mailVerified) p.push({ block: true, h: 'Business mail is not a company address', d: `${esc(v.person.mail)} is a free mailbox and is not verified.` });
      const acc = v.account && L.brand(v.account);
      if (acc && acc.reports) p.push({ block: false, h: `${acc.reports} open reports on this brand`, d: `Its campaigns are reported in moderation. Posted ${acc.postsLast30} campaigns since joining on ${esc(L.fmtDate(acc.joined))}.`, go: '#brand-' + acc.id });
    }
    return p;
  }

  const STATUS = { pending: ['pill-info', 'clock', 'Waiting'], approved: ['pill-ok', 'check', 'Approved'], rejected: ['pill-err', 'alert', 'Rejected'], info_requested: ['pill-warn', 'send', 'More info asked'] };
  const pill = st => { const m = STATUS[st] || STATUS.pending; return `<span class="pill ${m[0]}">${L.icon(m[1])}${m[2]}</span>`; };
  const KIND = k => `<span class="vfy-kind vfy-kind--${k}"><i class="dot"></i>${k === 'brand' ? 'Brand' : 'Creator'}</span>`;
  const sig = c => `<li class="vfy-sig is-${c.ok}" title="${esc(c.n + ': ' + c.t)}"><span class="vfy-sig-i">${L.icon(c.ok === 'ok' ? 'check' : c.ok === 'warn' ? 'info' : 'alert')}</span><span class="vfy-sig-n">${esc(c.n)}</span><span class="sr-only">: ${esc(c.t)}</span></li>`;

  /* ---------- queue ---------- */
  function queue(el) {
    const s = S(), u = ui();
    const all = s.verifications;
    const cnt = k => all.filter(v => v.status === 'pending' && (k === 'all' || v.kind === k)).length;
    const pend = all.filter(v => v.status === 'pending').sort((a, b) => (SLA_H[a.kind] - ageH(a)) - (SLA_H[b.kind] - ageH(b)));
    const over = pend.filter(v => sla(v).k === 'over').length;
    el.innerHTML = `<div class="view-in vfy">
      <header class="page-h vfy-head">
        <div class="t"><p class="t-eyebrow">Verification desk</p><h1 class="t-h1">${pend.length ? `${pend.length} waiting for a decision` : 'Queue is clear'}</h1>
          <p class="muted">Creators within 24 hours, brands within 48. Oldest first by time left.${over ? ` <b class="vfy-over">${over} over SLA.</b>` : ''} <span class="sample">Sample data</span></p></div>
        <div class="seg vfy-seg" role="group" aria-label="Show">
          ${[['creator', 'Creators'], ['brand', 'Brands'], ['all', 'All']].map(([k, t]) => `<button type="button" data-tab="${k}" aria-pressed="${u.tab === k}">${t} <span class="vfy-seg-n num">${cnt(k)}</span></button>`).join('')}
        </div>
      </header>
      <section aria-labelledby="vfyQ"><h2 class="sr-only" id="vfyQ">Waiting</h2><ol class="vfy-list" id="vfyList"></ol></section>
      <section class="vfy-done" aria-labelledby="vfyD"><h2 class="t-h3" id="vfyD">Decided</h2><ol class="vfy-list vfy-list--done" id="vfyDone"></ol></section>
    </div>`;
    const row = v => {
      const c = checks(v), sl = sla(v), bad = c.filter(x => x.ok === 'bad').length, pr = problems(v).filter(x => x.block);
      return `<li class="vfy-row${v.status !== 'pending' ? ' is-done' : ''}" data-kind="${v.kind}">
        <a class="vfy-row-a" href="#verify-${esc(v.id)}" aria-label="${esc(v.name)}, ${v.kind}. ${esc(v.status === 'pending' ? sl.t : STATUS[v.status][2])}. Open">
          ${av(v.kind, v.name)}
          <span class="vfy-row-id"><b>${esc(v.name)}</b><span>${KIND(v.kind)}<span class="num">Sent ${esc(L.ago(v.submitted))}</span></span></span>
          <ul class="vfy-sigs" aria-label="Checks">${c.map(sig).join('')}</ul>
          <span class="vfy-row-flag">${v.status !== 'pending' ? pill(v.status) : pr.length ? `<span class="vfy-flag">${L.icon('alert')}${esc(pr[0].h.replace(/:.*/, ''))}</span>` : bad ? `<span class="vfy-flag">${L.icon('alert')}${bad} check${bad > 1 ? 's' : ''} failed</span>` : `<span class="vfy-clear">${L.icon('check')}All checks clear</span>`}</span>
          <span class="vfy-row-sla">${v.status === 'pending' ? `<span class="pill ${sl.cls}">${L.icon(sl.ic)}${esc(sl.t)}</span>` : `<span class="t-cap muted">${esc(v.decidedBy || '')} · ${esc(L.ago(v.decidedAt))}</span>`}</span>
          <span class="vfy-row-go">${L.icon('chevron')}</span>
        </a></li>`;
    };
    const paint = () => {
      const f = v => u.tab === 'all' || v.kind === u.tab;
      const P = pend.filter(f), D = all.filter(v => v.status !== 'pending').filter(f);
      el.querySelector('#vfyList').innerHTML = P.length ? P.map(row).join('') : `<li class="empty"><img src="assets/step-05-stamp.svg" width="160" height="117" alt=""><p class="t-h3">Nothing waiting here</p><p class="muted">New ${u.tab === 'brand' ? 'brand' : u.tab === 'creator' ? 'creator' : ''} requests show up the minute they are sent.</p></li>`;
      el.querySelector('#vfyDone').innerHTML = D.map(row).join('');
      el.querySelector('.vfy-done').hidden = !D.length;
      mo('stagger', [...el.querySelectorAll('.vfy-row')]);
    };
    paint();
    el.querySelector('.vfy-seg').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      u.tab = b.dataset.tab; el.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      mo('flip', paint, [...el.querySelectorAll('.vfy-row')]) || paint();
    });
  }

  /* ---------- detail ---------- */
  const kvs = rows => `<dl class="vfy-kv">${rows.filter(Boolean).map(([k, v, s]) => `<div><dt>${esc(k)}</dt><dd>${v}${s ? `<span class="vfy-m is-${s.k}">${L.icon(s.k === 'ok' ? 'check' : s.k === 'close' || s.k === 'warn' ? 'info' : 'alert')}${esc(s.t)}</span>` : ''}</dd></div>`).join('')}</dl>`;
  const mono = t => `<span class="vfy-mono num">${esc(t)}</span>`;
  const ok = t => ({ k: 'ok', t }), bad = t => ({ k: 'bad', t }), warn = t => ({ k: 'warn', t });

  function creatorBody(v) {
    const d = v.id_doc, age = L.ageFrom(d.dob), pm = nameMatch(d.name, v.pan.name), bm = nameMatch(d.name, v.bank.holder);
    const acc = v.account && L.creator(v.account);
    return `
      <section class="vfy-card" aria-labelledby="vfyId"><header><span class="vfy-ci">${L.icon('user')}</span><h2 class="t-h3" id="vfyId">Identity</h2></header>
        ${kvs([['Document', esc(d.type)], ['Number', mono(d.masked)], ['Name on ID', esc(d.name)],
          ['Date of birth', esc(L.fmtDate(d.dob, { year: true })), age >= 18 ? ok(`Age ${age}`) : bad(`Age ${age}, under 18`)]])}</section>
      <section class="vfy-card" aria-labelledby="vfyPan"><header><span class="vfy-ci">${L.icon('file')}</span><h2 class="t-h3" id="vfyPan">PAN and payout</h2></header>
        ${kvs([['PAN', mono(v.pan.masked)], ['Name on PAN', esc(v.pan.name), pm.k === 'ok' ? ok('Matches ID') : pm.k === 'close' ? warn(pm.t) : bad(pm.t)],
          [v.bank.kind === 'UPI' ? 'UPI ID' : 'Bank account', mono(v.bank.masked)],
          ['Account holder', esc(v.bank.holder), v.bank.match === 'ok' ? ok('Matches ID') : bm.k === 'close' ? warn(bm.t) : bad(bm.t)]])}
        <p class="vfy-note">Penny-drop check returned the holder name above. Full numbers stay encrypted; only the last digits are shown.</p></section>
      <section class="vfy-card" aria-labelledby="vfySelf"><header><span class="vfy-ci">${L.icon('camera')}</span><h2 class="t-h3" id="vfySelf">Selfie</h2></header>
        ${kvs([['Liveness', esc(v.selfie.liveness === 'passed' ? 'Passed, blink and turn' : v.selfie.liveness), v.selfie.liveness === 'passed' ? ok('Live') : bad('Failed')]])}
        <div class="vfy-face"><div class="vfy-face-h"><span>Face match with ID photo</span><b class="t-money num">${v.selfie.faceMatch}%</b></div>
          <div class="vfy-bar" role="img" aria-label="Face match ${v.selfie.faceMatch} percent; 85 percent needed"><i style="width:${v.selfie.faceMatch}%"></i><s style="left:85%"></s></div>
          <p class="t-cap muted">85% needed. The selfie itself is never shown here or to brands.</p></div></section>
      <section class="vfy-card" aria-labelledby="vfySoc"><header><span class="vfy-ci">${L.icon('link')}</span><h2 class="t-h3" id="vfySoc">Social accounts</h2></header>
        <ul class="vfy-socs">${v.socials.map(x => `<li><span class="vfy-soc-ic">${L.icon(x.p === 'youtube' ? 'yt' : 'ig')}</span>
          <span class="vfy-soc-t"><b>${esc(x.handle)}</b><span>${x.p === 'youtube' ? 'YouTube' : 'Instagram'} · ${esc(x.age)} old</span></span>
          <span class="vfy-soc-n"><b class="t-money">${esc(L.compact(x.followers))}</b><span>${x.p === 'youtube' ? 'subscribers' : 'followers'}</span></span>
          ${x.linked ? `<span class="pill pill-ok">${L.icon('check')}Linked</span>` : `<span class="pill pill-err">${L.icon('alert')}Not linked</span>`}</li>`).join('')}</ul>
        ${acc && acc.followers ? `<p class="vfy-note">On Linkloom since ${esc(L.fmtDate(acc.joined, { year: true }))}: ${esc(L.compact(acc.followers))} followers, ${acc.jobs} jobs, rated ${acc.rating}. <a class="btn-q" href="#creator-${esc(acc.id)}">Account</a></p>` : ''}</section>`;
  }
  function brandBody(v) {
    const b = v.business, p = v.person, g = b.gstin, cin = b.cin;
    const cinT = cin ? `${cin[0] === 'U' ? 'Unlisted' : 'Listed'} · ${cin.slice(12, 15) === 'PTC' ? 'private limited' : 'company'} · incorporated ${cin.slice(8, 12)}` : '';
    const dom = (p.mail || '').split('@')[1] || '', bdom = (v.billing.email || '').split('@')[1] || '';
    return `
      <section class="vfy-card" aria-labelledby="vfyBiz"><header><span class="vfy-ci">${L.icon('brief')}</span><h2 class="t-h3" id="vfyBiz">Business</h2></header>
        ${kvs([['Legal name', b.legal ? esc(b.legal) : '<span class="muted">Not provided</span>'],
          ['GSTIN', g ? mono(g) : '<span class="muted">Not provided</span>', g ? (b.gstinStatus === 'Active' ? ok(`Active on the GST portal · ${gstState(g)}`) : bad(b.gstinStatus)) : bad('Missing')],
          ['Company PAN', b.pan ? mono(mask(b.pan)) : '<span class="muted">Not provided</span>', b.pan ? (b.panFromGstin && g.slice(2, 12) === b.pan ? ok('Same as characters 3 to 12 of the GSTIN') : bad('Does not match the GSTIN')) : bad('Missing')],
          ['CIN', cin ? mono(cin) : '<span class="muted">Not provided</span>', cin ? ok(cinT) : warn('Needed for companies; LLPs give an LLPIN')]])}</section>
      <section class="vfy-card" aria-labelledby="vfyPer"><header><span class="vfy-ci">${L.icon('user')}</span><h2 class="t-h3" id="vfyPer">Authorised person</h2></header>
        ${kvs([['Name', p.name && p.name !== '—' ? esc(p.name) : '<span class="muted">Not named</span>'], ['Designation', p.designation && p.designation !== '—' ? esc(p.designation) : '<span class="muted">—</span>'],
          ['Business mail', esc(p.mail), freeMail(p.mail) ? bad('Free mailbox') : p.mailVerified ? ok('Verified by link') : bad('Not verified')]])}</section>
      <section class="vfy-card" aria-labelledby="vfyBill"><header><span class="vfy-ci">${L.icon('wallet')}</span><h2 class="t-h3" id="vfyBill">Billing</h2></header>
        ${kvs([['Address', v.billing.address ? esc(v.billing.address) : '<span class="muted">Not provided</span>'],
          ['Invoices to', v.billing.email ? esc(v.billing.email) : '<span class="muted">Not provided</span>', v.billing.email ? (bdom === dom ? ok('Same domain as the person') : warn('Different domain')) : null]])}
        <p class="vfy-note">Brands pay the agreed price into escrow. No platform fee; GST on invoices as per confirmed rules.</p></section>`;
  }

  function detail(el, id) {
    const s = S(), v = s.verifications.find(x => x.id === id);
    if (!v) { el.innerHTML = `<div class="view-in"><div class="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt=""><p class="t-h2">No request with that link.</p><p class="muted">It may have been withdrawn by the applicant.</p><button class="lq lq-p" type="button" data-go="#verify">Back to the desk</button></div></div>`; return; }
    const c = checks(v), pr = problems(v), block = pr.some(x => x.block), sl = sla(v), pending = v.status === 'pending';
    const clear = c.filter(x => x.ok === 'ok').length;
    const next = s.verifications.filter(x => x.status === 'pending' && x.id !== v.id).sort((a, b) => (SLA_H[a.kind] - ageH(a)) - (SLA_H[b.kind] - ageH(b)))[0];
    const acc = v.account ? (v.kind === 'brand' ? L.brand(v.account) : L.creator(v.account)) : null;
    el.innerHTML = `<div class="view-in vfy vfy-d">
      <a class="btn-q vfy-back" href="#verify">${L.icon('back')}Verification desk</a>
      <header class="vfy-mast">
        ${av(v.kind, v.name, 'vfy-av')}
        <div class="vfy-mast-t">
          <p class="vfy-mast-k">${KIND(v.kind)}<span>${v.kind === 'brand' ? 'Brand verification' : 'Creator KYC'}</span>${acc ? `<a class="btn-q" href="#${v.kind}-${esc(acc.id)}">View account</a>` : '<span>No account yet</span>'}</p>
          <h1 class="t-h1">${esc(v.name)}</h1>
          <p class="muted num">Sent ${esc(L.fmtDate(v.submitted))}, ${esc(L.ago(v.submitted))}${v.note ? ' · ' + esc(v.note) : ''} <span class="sample">Sample</span></p>
        </div>
        <div class="vfy-mast-s">${pending ? `<span class="pill ${sl.cls}">${L.icon(sl.ic)}${esc(sl.t)}</span>` : pill(v.status)}
          <p class="vfy-score"><b class="t-money num">${clear}</b><span>of ${c.length} checks clear</span></p></div>
      </header>
      ${!pending ? `<div class="vfy-result is-${v.status}" role="status"><span class="vfy-result-i">${L.icon(v.status === 'approved' ? 'check' : v.status === 'rejected' ? 'alert' : 'send')}</span>
        <div><p class="t-h3">${v.status === 'approved' ? 'Approved' : v.status === 'rejected' ? 'Rejected' : 'Waiting on the applicant'}</p><p class="muted">${esc(v.decision || '')} · ${esc(v.decidedBy)}, ${esc(L.ago(v.decidedAt))}. Logged to audit.</p></div>
        ${next ? `<a class="lq lq-p lq-sm" href="#verify-${esc(next.id)}">Next: ${esc(next.name)}</a>` : `<a class="lq lq-s lq-sm" href="#verify">Back to the desk</a>`}</div>` : ''}
      ${pr.length ? `<section class="vfy-probs" aria-label="Needs your attention">${pr.map(x => `<div class="vfy-prob${x.block ? ' is-block' : ''}"><span class="vfy-prob-i">${L.icon(x.block ? 'alert' : 'info')}</span><div><p class="vfy-prob-h">${x.h}</p><p>${x.d}${x.go ? ` <a class="btn-q" href="${x.go}">Open brand</a>` : ''}</p></div></div>`).join('')}</section>` : ''}
      <ul class="vfy-sigs vfy-sigs--lg" aria-label="Checks">${c.map(x => `<li class="vfy-sig is-${x.ok}"><span class="vfy-sig-i">${L.icon(x.ok === 'ok' ? 'check' : x.ok === 'warn' ? 'info' : 'alert')}</span><span class="vfy-sig-t"><b>${esc(x.n)}</b><span>${esc(x.t)}</span></span></li>`).join('')}</ul>
      <div class="vfy-cards">${v.kind === 'creator' ? creatorBody(v) : brandBody(v)}</div>
      ${pending ? `<div class="vfy-dock" role="region" aria-label="Decision">
        <p class="vfy-dock-t">${block ? `${L.icon('alert')}<span>Approve is off: ${esc(pr.find(x => x.block).h.replace(/:.*/, '').toLowerCase())}.</span>` : `${L.icon('shield')}<span>Your decision is logged and the applicant is told by SMS and email.</span>`}</p>
        <div class="vfy-dock-b">
          <button class="lq lq-s lq-sm" type="button" data-act="reject">${L.icon('close', 'ic')}Reject</button>
          <button class="lq lq-s lq-sm" type="button" data-act="info">${L.icon('chat', 'ic')}Ask for more info</button>
          <button class="lq lq-p lq-sm" type="button" data-act="approve"${block ? ' aria-disabled="true" disabled' : ''}>${L.icon('check', 'ic')}Approve</button>
        </div></div>` : ''}
    </div>`;
    mo('stagger', [...el.querySelectorAll('.vfy-card,.vfy-sigs--lg>li')]);
    const res = el.querySelector('.vfy-result-i'); if (res && v.status === 'approved' && v._fresh) { mo('check', res); v._fresh = false; }

    const target = `${v.name} (${v.account || v.id})`;
    const decide = (status, action, detailTxt) => {
      L.store.set(st => {
        const x = st.verifications.find(y => y.id === v.id);
        Object.assign(x, { status, decision: detailTxt, decidedAt: new Date(L.today().getTime() + st.audit.length * 1000).toISOString(), decidedBy: st.me.name, _fresh: true });
        if (x.account) {
          if (x.kind === 'creator') { const a = st.creators.find(y => y.id === x.account); if (a) a.kyc = status === 'approved' ? 'verified' : status === 'rejected' ? 'rejected' : 'action_needed'; }
          else { const a = st.brands.find(y => y.id === x.account); if (a) { a.verify = status === 'approved' ? 'verified' : status === 'rejected' ? 'rejected' : 'action_needed'; if (status === 'approved') a.regVerified = true; } }
        }
      }, 'verify');
      L.audit(action, target, detailTxt);
      L.route();
    };

    const ITEMS = v.kind === 'creator'
      ? [['id', 'A clearer photo of the ID, both sides'], ['pan', 'PAN card photo'], ['bank', 'Payout account in their own name (bank letter or cancelled cheque)'], ['selfie', 'A new selfie in good light'], ['soc', 'Connect Instagram or YouTube by login']]
      : [['gst', 'GSTIN and the GST registration certificate'], ['pan', 'Company PAN'], ['cin', 'Certificate of incorporation (CIN or LLPIN)'], ['per', 'Name and designation of the authorised person, with a board or partner letter'], ['mail', 'A work email on the company domain'], ['bill', 'Billing address and accounts email']];
    const preset = new Set(c.filter(x => x.ok !== 'ok').map(x => ({ id: 'id', pan: 'pan', bank: 'bank', face: 'selfie', soc: 'soc', gst: 'gst', cin: 'cin', per: 'per', mail: 'mail', bill: 'bill' }[x.k])));
    const first = v.kind === 'brand' ? (v.person.name && v.person.name !== '—' ? v.person.name.split(' ')[0] : 'there') : v.name.split(' ')[0];
    const compose = keys => `Hi ${first}, thanks for sending your details. To finish ${v.kind === 'brand' ? 'verifying ' + (v.business.legal || v.name) : 'your verification'}, please share:\n${ITEMS.filter(i => keys.includes(i[0])).map(i => '• ' + i[1]).join('\n')}\nYou can upload these from the same verification page. We will review within ${SLA_H[v.kind]} hours of your reply. – Linkloom Trust team`;

    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      const a = b.dataset.act;
      const sum = `<ul class="adm-sum">${c.map(x => `<li class="is-${x.ok}">${L.icon(x.ok === 'ok' ? 'check' : x.ok === 'warn' ? 'info' : 'alert')}<b>${esc(x.n)}</b><span>${esc(x.t)}</span></li>`).join('')}</ul>`;
      if (a === 'approve') confirm({
        title: `Approve ${v.name}`, cta: 'Approve and notify',
        lead: v.kind === 'creator' ? `${esc(first)} can bid and get paid once approved. Brands see a verified tick; KYC details stay private.` : `${esc(v.name)} can post campaigns and fund escrow once approved.`,
        summary: sum, noteLabel: 'Note for the log', placeholder: 'For example: all documents match', note: c.every(x => x.ok === 'ok') ? (v.kind === 'creator' ? 'ID, PAN, payout and socials match' : 'GSTIN active, PAN and CIN match, mail verified') : '',
        onConfirm: ({ note }) => { decide('approved', 'verification.approve', note); }
      });
      else if (a === 'reject') confirm({
        title: `Reject ${v.name}`, cta: 'Reject request', danger: true,
        lead: `${esc(first)} is told the reason and can apply again${v.kind === 'creator' && L.ageFrom(v.id_doc.dob) < 18 ? ' after turning 18' : ' with new documents'}. Nothing is deleted.`,
        reasons: v.kind === 'creator' ? ['Under 18', 'Payout account is not theirs', 'Documents do not match', 'Edited or fake document', 'Duplicate account'] : ['No business details', 'GSTIN inactive or not theirs', 'Not a real business', 'Suspected scam'],
        preset: v.kind === 'creator' && L.ageFrom(v.id_doc.dob) < 18 ? 'Under 18' : !v.business || v.business.gstin ? null : 'No business details',
        noteLabel: 'Note for the log', summary: sum,
        onConfirm: ({ reason, note }) => { decide('rejected', 'verification.reject', reason === 'Other' ? note : reason + (note ? ': ' + note : '')); }
      });
      else if (a === 'info') {
        const keys = () => [...document.querySelectorAll('.adm-items input:checked')].map(i => i.value);
        confirm({
          title: `Ask ${first} for more`, cta: 'Send request',
          lead: 'Pick what is missing. The message below is what they get by email and in the app; edit it if you like.',
          extra: `<fieldset class="adm-fs"><legend class="t-label">What to send</legend><div class="adm-items">${ITEMS.map(([k, t]) => `<label class="check"><input type="checkbox" value="${k}"${preset.has(k) ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div></fieldset>`,
          noteLabel: 'Message', placeholder: 'Message to the applicant', note: compose([...preset]),
          mount(body) { let touched = false; const ta = body.querySelector('textarea'); ta.rows = 8; ta.addEventListener('input', () => { touched = true; });
            body.querySelectorAll('.adm-items input').forEach(i => i.addEventListener('change', () => { if (!touched) ta.value = compose(keys()); })); },
          validate: () => keys().length ? '' : 'Pick at least one thing to ask for.',
          onConfirm: ({ body }) => { const k = keys(); decide('info_requested', 'verification.request_info', 'Asked for: ' + ITEMS.filter(i => k.includes(i[0])).map(i => i[1].split(' (')[0].split(',')[0]).join('; ')); }
        });
      }
    });
  }

  L.register('verify', {
    title: id => { if (!id) return 'Verification'; const v = S().verifications.find(x => x.id === id); return v ? v.name + ' · Verification' : 'Verification'; },
    nav: 'verify',
    crumb: id => { if (!id) return ''; const v = S().verifications.find(x => x.id === id); return `<a href="#verify">Verification</a>${v ? ' / ' + esc(v.name) : ''}`; },
    render(el, id) { if (id) detail(el, id); else queue(el); }
  });
})();
