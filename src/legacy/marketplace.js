/* Super Admin · Marketplace curation (#marketplace, #marketplace-<tab|campaignId>) and the Builder C kit (LLD.mx) shared with moderation.js.
   Tabs: campaigns, bids, reviews, featured, categories. Every admin action goes through a reason sheet, then LLD.audit(), then "Logged to audit".
   Creators read coral, brands violet. Money is integer paise. Mirrors the brand Jobs slips (stub + body) and the creator My bids board. */
(() => {
  const L = window.LLD, esc = L.esc, ic = L.icon;
  const S = () => window.LLD_DATA;

  /* ---------- kit ---------- */
  const ui = k => { const s = S(); s.ui = s.ui || {}; return (s.ui[k] = s.ui[k] || {}); };
  const mo = (fn, ...a) => { try { return (L.motion[fn] && L.motion[fn](...a)) || null; } catch (e) { return null; } };
  const flip = (mutate, nodes) => { let done = false; const m = () => { done = true; mutate(); }; try { L.motion.flip(m, nodes); } catch (e) {} if (!done) mutate(); };
  const nowISO = () => L.today().toISOString();
  const time = s => L.D(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).replace(/\s?(am|pm)/i, m => ' ' + m.trim().toUpperCase());
  const when = s => `${L.fmtDate(s)}, ${time(s)}`;
  const plat = p => (p === 'youtube' ? 'YouTube' : 'Instagram');
  const glyph = p => ic(p === 'youtube' ? 'yt' : 'ig');
  const plural = (n, a, b) => `${n} ${n === 1 ? a : (b || a + 's')}`;
  /* people: creators coral, brands violet, unknown accounts a quiet outline */
  const who = (kind, name, sub = '', href = '') => {
    const av = `<span class="avatar mx-av is-${kind}" aria-hidden="true">${esc(L.initials(name))}</span>`;
    const t = `<span class="mx-who-t"><b>${esc(name)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>`;
    return href ? `<a class="mx-who is-${kind}" href="${href}">${av}${t}</a>` : `<span class="mx-who is-${kind}">${av}${t}</span>`;
  };
  const crWho = (c, sub) => who('c', c.name, sub == null ? (c.handle || c.city) : sub, `#creator-${esc(c.id)}`);
  const brWho = (b, sub) => who('b', b.name, sub == null ? (b.verify === 'verified' ? 'Verified brand · ' + b.city : 'Not verified') : sub, `#brand-${esc(b.id)}`);
  const pill = (cls, icon, label) => `<span class="pill ${cls}">${icon ? ic(icon) : ''}${esc(label)}</span>`;
  const SEV = { high: ['pill-err', 'alert', 'High'], medium: ['pill-warn', 'flag', 'Medium'], low: ['pill-paper', '', 'Low'] };
  const sev = s => { const m = SEV[s] || SEV.low; return pill(m[0], m[1], m[2] + ' severity'); };
  const stars = n => `<span class="mx-stars" role="img" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map(i => `<span class="${i <= n ? 'on' : ''}">${ic('star')}</span>`).join('')}</span>`;

  /* the reason sheet: a mini of the target, plain consequences, a required reason, a note that it is logged.
     opts: { title, mini, bullets, reasons, action, target, yes, danger, onYes(reason) } */
  function reasonSheet(o) {
    const reasons = [...(o.reasons || []), 'Other'];
    L.openSheet({
      title: o.title,
      body: `<form class="stack mx-sheet" novalidate>
        ${o.mini || ''}
        ${o.bullets && o.bullets.length ? `<ul class="mx-conseq">${o.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        <fieldset class="mx-rs"><legend class="t-label">Reason <span class="muted">· required</span></legend>
          <div class="mx-rcs">${reasons.map((r, i) => `<label class="mx-rc"><input type="radio" name="mxr" value="${esc(r)}"${i === 0 && o.preset ? ' checked' : ''}><span>${esc(r)}</span></label>`).join('')}</div>
        </fieldset>
        <div class="field"><label for="mxNote">Note for the log</label>
          <textarea class="textarea mx-note" id="mxNote" maxlength="240" rows="3" placeholder="What you saw, in a line. Other admins read this."></textarea>
          <p class="help mx-help"><span id="mxHint">Optional, unless you pick Other.</span><span class="num" id="mxCount">0 / 240</span></p></div>
        <p class="err mx-err" id="mxErr" role="alert" hidden></p>
        <p class="mx-logged">${ic('shield')}<span>Logged as <code>${esc(o.action)}</code> by ${esc(S().me.name)}, with the time and your reason. Audit entries can’t be edited or deleted.</span></p>
        <div class="row wrap mx-sheet-acts"><button class="lq lq-p${o.danger ? ' mx-danger' : ''}" type="submit">${esc(o.yes)}</button><button class="lq lq-s" type="button" data-no>Cancel</button></div>
      </form>`,
      onMount(b, close) {
        const f = b.querySelector('form'), note = b.querySelector('#mxNote'), err = b.querySelector('#mxErr');
        note.addEventListener('input', () => { b.querySelector('#mxCount').textContent = `${note.value.length} / 240`; err.hidden = true; });
        f.addEventListener('change', () => { err.hidden = true; const v = (f.querySelector('input[name=mxr]:checked') || {}).value; b.querySelector('#mxHint').textContent = v === 'Other' ? 'Required: say what the reason is.' : 'Optional, unless you pick Other.'; });
        b.querySelector('[data-no]').addEventListener('click', () => close());
        f.addEventListener('submit', e => {
          e.preventDefault();
          const pick = (f.querySelector('input[name=mxr]:checked') || {}).value, n = note.value.trim();
          let msg = '';
          if (!pick) msg = 'Pick a reason. It goes into the audit log with your name.';
          else if (pick === 'Other' && n.length < 4) msg = 'Add a short note so the log says why.';
          if (msg) { err.textContent = msg; err.hidden = false; mo('shake', pick ? note : b.querySelector('.mx-rcs')); (pick ? note : f.querySelector('input[name=mxr]')).focus(); return; }
          const reason = pick === 'Other' ? n : pick + (n ? ' · ' + n : '');
          close();
          L.audit(o.action, o.target, reason);   /* log first, so any re-render already shows the entry */
          o.onYes && o.onYes(reason);
          L.toast('Logged to audit', 'check');
        });
      }
    });
  }

  const suspend = (kind, id, reason) => L.store.set(s => {
    const a = (kind === 'b' ? s.brands : s.creators).find(x => x.id === id);
    if (a) { a.status = 'suspended'; a.suspended = { at: nowISO(), reason, by: s.me.name }; }
  }, 'suspend');
  const closeReport = (id, status, action, note) => L.store.set(s => {
    const r = s.reports.find(x => x.id === id);
    if (r && r.status === 'open') { r.status = status; r.action = action; r.by_admin = s.me.name; r.closedAt = nowISO(); r.note = note; }
  }, 'report');
  const reportFor = link => S().reports.find(r => r.link === link) || null;

  L.mx = { ui, mo, flip, nowISO, time, when, plat, glyph, plural, who, crWho, brWho, pill, sev, stars, reasonSheet, suspend, closeReport, reportFor };

  /* ---------- sample context the data file does not carry (admin view only) ---------- */
  const BRIEF = {
    k1: { text: 'Launch Reel for our Barrier Repair Serum. Show your evening routine, one honest before and after after 14 days.', del: '1 Reel, 30 to 45 s, plus 3 Stories' },
    k2: { text: 'A night routine for oily skin, 6 to 8 minutes. Our gel moisturiser in one step, your own picks for the rest.', del: '1 YouTube video, integrated mention' },
    k3: { text: 'Make filter coffee at home for Diwali guests. Real kitchen, real steel tumbler, no studio set.', del: '1 Reel and 2 Stories' },
    k4: { text: 'Two nights at our Alibaug property. A travel vlog that shows the drive, the food and the beach at sunrise.', del: '1 YouTube vlog, 10 to 14 min' },
    k5: { text: 'Grow herbs on a balcony with our starter kit and post your day 30 result.', del: '1 Reel and a day 1 Story' },
    k9: { text: 'Join the GlowCash paid creator network! Pay ₹999 registration to unlock ₹50,000 a week, guaranteed. Send payment to glowcash@ybl and DM the screenshot to get approved fast.', del: 'Not stated' },
    k10: { text: 'DM us on WhatsApp +91 98••• ••421 for an instant paid collab. No brief needed, we share details on chat.', del: 'Not stated' }
  };
  /* bids behind each pattern alert (what the system saw) */
  const ALERT_BIDS = {
    ba1: { total: 18, rows: [
      ['c', 'Rahul Verma', 'k1', 1750000, '2026-10-29T23:36:00+05:30', 'Same device as 2 others'],
      ['x', 'Linked account A', 'k1', 1740000, '2026-10-29T23:37:00+05:30', 'Same payout UPI'],
      ['x', 'Linked account B', 'k1', 1760000, '2026-10-29T23:38:00+05:30', 'Same payout UPI'],
      ['c', 'Rahul Verma', 'k3', 1180000, '2026-10-29T23:39:00+05:30', 'Same device as 2 others'],
      ['x', 'Linked account A', 'k3', 1190000, '2026-10-29T23:39:00+05:30', 'Same payout UPI']] },
    ba2: { total: 41, rows: [
      ['x', 'new.creator.2291', 'k9', 5000000, '2026-11-03T12:18:00+05:30', 'Exact budget · pitch copied'],
      ['x', 'glow.girl.real', 'k9', 5000000, '2026-11-03T12:19:00+05:30', 'Exact budget · pitch copied'],
      ['x', 'collab.with.me.88', 'k10', 2500000, '2026-11-03T12:21:00+05:30', 'Exact budget · pitch copied'],
      ['x', 'insta.money.now', 'k9', 5000000, '2026-11-03T12:24:00+05:30', 'Exact budget · pitch copied'],
      ['x', 'riya.official.07', 'k10', 2500000, '2026-11-03T12:29:00+05:30', 'Name close to Riya Thomas']] },
    ba3: { total: 1, rows: [['c', 'Tanvi Shah', 'k1', 700000, '2026-11-03T18:00:00+05:30', '61% under the ₹18,000 budget']] }
  };
  /* how each risk score is made: signal, points */
  const SIGNALS = {
    ba1: [['Same device fingerprint on 3 accounts', 35], ['One payout UPI shared by all 3', 30], ['Bids on the same 6 jobs within 4 minutes', 20], ['2 accounts under a week old', 7]],
    ba2: [['41 bids in 12 minutes', 30], ['Same pitch text, word for word', 25], ['17 accounts made in the last 48 hours', 14], ['Every bid at the exact budget', 12]],
    ba3: [['Bid 61% under the brief’s budget', 18], ['Account is 6 weeks old', 6], ['No completed orders yet', 4]]
  };
  const PITCH = { ba2: 'Same pitch on all 41: “Hi mam I am intrested pls check DM for collab details”' };

  /* ---------- #marketplace ---------- */
  const TABS = [['campaigns', 'Campaigns'], ['bids', 'Bids'], ['reviews', 'Reviews'], ['featured', 'Featured'], ['categories', 'Categories']];
  const CST = { live: ['pill-ok', 'eye', 'Live'], hidden: ['pill-line', 'eye', 'Hidden'], removed: ['pill-paper', 'trash', 'Removed'] };
  const camp = id => S().campaigns.find(c => c.id === id) || null;
  const flagged = c => c.status === 'live' && c.flags > 0;
  const openAlerts = () => S().bidAlerts.filter(a => a.status === 'open');
  const flaggedReviews = () => S().reviews.filter(r => r.status === 'flagged');

  const campMini = c => {
    const b = L.brand(c.brand) || { name: 'Brand' };
    return `<div class="mx-mini"><span class="mx-plat">${glyph(c.platform)}<span>${esc(plat(c.platform))} · ${esc(b.name)}</span></span>
      <p class="t-money mx-mini-p">${L.inr(c.budget)}</p><p class="t-small muted">${esc(c.title)}</p></div>`;
  };
  const reviewMini = r => `<div class="mx-mini">${stars(r.stars)}<p class="mx-quote">“${esc(r.text)}”</p><p class="t-small muted">${esc(r.from)} on ${esc(r.to)} · ${esc(L.fmtDate(r.at))}</p></div>`;

  function hideCampaign(id, done) {
    const c = camp(id), b = L.brand(c.brand);
    reasonSheet({
      title: 'Hide this campaign?', mini: campMini(c), action: 'campaign.hide', target: `Campaign ${c.id} · ${b.name}`, yes: 'Hide campaign', danger: true,
      bullets: ['Creators stop seeing it in Find jobs. The brand sees it as “Hidden by Linkloom”.', `Its ${c.bids} bids are frozen, not declined. You can restore it later.`, 'No money moves. Nothing is in escrow on it.'],
      reasons: c.rule ? [c.rule, 'Under investigation', 'Misleading pay claims'] : ['Under investigation', 'Misleading pay claims', 'Brand not verified'], preset: !!c.rule,
      onYes(reason) { L.store.set(s => { const x = s.campaigns.find(y => y.id === id); x.status = 'hidden'; x.mod = { by: s.me.name, at: nowISO(), reason }; }, 'campaign'); done && done(); }
    });
  }
  function removeCampaign(id, done) {
    const c = camp(id), b = L.brand(c.brand), r = reportFor(id);
    reasonSheet({
      title: 'Remove this campaign?', mini: campMini(c), action: 'campaign.remove', target: `Campaign ${c.id} · ${b.name}`, yes: 'Remove campaign', danger: true,
      bullets: [`It is taken down for good, and the ${c.bids} open bids on it are declined.`, 'Each bidder is told why, in plain words, so nobody pays the brand.', r && r.status === 'open' ? `Report ${r.id} (${plural(r.count, 'report')}) is closed as actioned.` : 'The brand keeps its account. Suspend it from Moderation if needed.'],
      reasons: c.rule ? [c.rule, 'Scam: asks creators to pay', 'Off-platform payment'] : ['Scam: asks creators to pay', 'Off-platform payment', 'Breaks posting rules'], preset: !!c.rule,
      onYes(reason) {
        L.store.set(s => { const x = s.campaigns.find(y => y.id === id); x.status = 'removed'; x.mod = { by: s.me.name, at: nowISO(), reason }; }, 'campaign');
        if (r) closeReport(r.id, 'actioned', 'Campaign removed', reason);
        done && done();
      }
    });
  }
  function restoreCampaign(id, done) {
    const c = camp(id), b = L.brand(c.brand);
    reasonSheet({
      title: 'Restore this campaign?', mini: campMini(c), action: 'campaign.restore', target: `Campaign ${c.id} · ${b.name}`, yes: 'Restore campaign',
      bullets: ['It shows in Find jobs again and its frozen bids come back as they were.'],
      reasons: ['Checked: within the rules', 'Brand fixed the brief'],
      onYes(reason) { L.store.set(s => { const x = s.campaigns.find(y => y.id === id); x.status = 'live'; x.flags = 0; x.mod = { by: s.me.name, at: nowISO(), reason, restored: true }; }, 'campaign'); done && done(); }
    });
  }

  function briefSheet(id, refresh) {
    const c = camp(id); if (!c) return;
    const b = L.brand(c.brand), br = BRIEF[id] || { text: c.title, del: 'Not stated' }, r = reportFor(id);
    const posts2d = b.postsLast30 >= 8 && b.postsAvg === 0;
    const sig = [
      [b.verify === 'verified', b.verify === 'verified' ? 'Brand verified: GSTIN and company PAN match' : 'Brand not verified: no GSTIN or company PAN'],
      [b.mailVerified && !/gmail|yahoo/.test(b.email), b.mailVerified && !/gmail|yahoo/.test(b.email) ? 'Business mail on its own domain' : `Free mail address, not verified (${b.email})`],
      [!posts2d, posts2d ? `${b.postsLast30} campaigns posted in 2 days, no history before` : `${b.postsLast30} campaigns in 30 days (average ${b.postsAvg})`],
      [!/pay|₹999|upi|whatsapp|dm/i.test(br.text), /pay|₹999|upi|whatsapp|dm/i.test(br.text) ? 'Brief asks for payment or contact off Linkloom' : 'No payment or contact asks in the brief'],
      [c.budget <= 2000000, c.budget <= 2000000 ? 'Budget in the usual range for this format' : `Budget ${L.inr(c.budget)} is far above similar briefs`]
    ];
    const bad = sig.filter(s => !s[0]).length;
    L.openSheet({
      title: 'Campaign brief', wide: true,
      body: `<div class="stack mk-brief">
        <div class="row between wrap">${brWho(b)}<span class="row mk-pills">${pill(...CST[c.status])}${c.flags && c.status === 'live' ? pill('pill-err', 'alert', plural(c.flags, 'report')) : ''}</span></div>
        <h3 class="t-h2">${esc(c.title)}</h3>
        <dl class="mx-meta"><div><dt>Budget</dt><dd>${L.inr(c.budget)}</dd></div><div><dt>Platform</dt><dd>${esc(plat(c.platform))}</dd></div><div><dt>Bids</dt><dd>${c.bids}</dd></div><div><dt>Posted</dt><dd>${esc(L.fmtDate(c.posted))}</dd></div></dl>
        <div class="mk-brief-txt"><p class="t-eyebrow">The brief, as creators see it</p><p>${esc(br.text)}</p><p class="t-small muted">Deliverables: ${esc(br.del)}</p></div>
        <div><p class="t-eyebrow mk-sig-h">Signals <span class="muted">· ${bad ? plural(bad, 'concern') : 'nothing unusual'}</span></p>
          <ul class="mk-sig">${sig.map(([ok, t]) => `<li class="${ok ? 'is-ok' : 'is-bad'}">${ic(ok ? 'check' : 'alert')}<span>${esc(t)}</span></li>`).join('')}</ul></div>
        ${r ? `<a class="btn-q" href="#moderation-${esc(r.id)}">${ic('flag')}See ${plural(r.count, 'report')} in Moderation</a>` : ''}
        ${c.mod ? `<p class="mk-modnote">${ic('shield')}<span>${c.status === 'live' ? 'Restored' : CST[c.status][2]} by ${esc(c.mod.by)}, ${esc(when(c.mod.at))}. Reason: ${esc(c.mod.reason)}</span></p>` : ''}
        <div class="row wrap">${c.status === 'live' ? `<button class="lq lq-p mx-danger" type="button" data-rm>${ic('trash')}Remove campaign</button><button class="lq lq-s" type="button" data-hide>Hide for now</button>` : c.status === 'hidden' ? `<button class="lq lq-p mx-danger" type="button" data-rm>${ic('trash')}Remove campaign</button><button class="lq lq-s" type="button" data-restore>Restore</button>` : ''}</div>
      </div>`,
      onMount(el) {
        const on = (q, f) => { const n = el.querySelector(q); n && n.addEventListener('click', () => f(id, refresh)); };
        on('[data-rm]', removeCampaign); on('[data-hide]', hideCampaign); on('[data-restore]', restoreCampaign);
      }
    });
  }

  /* ----- tab: campaigns ----- */
  const CF = [['all', 'All'], ['flagged', 'Flagged'], ['hidden', 'Hidden'], ['removed', 'Removed']];
  const inCF = (c, f) => f === 'all' || (f === 'flagged' && flagged(c)) || c.status === f;
  function campSlip(c) {
    const b = L.brand(c.brand), f = flagged(c), r = reportFor(c.id);
    const burst = b.postsLast30 >= 8 && b.postsAvg === 0;
    const acts = [`<button class="lq ${f ? 'lq-p' : 'lq-s'} lq-sm" type="button" data-brief="${c.id}">Inspect brief</button>`];
    if (c.status === 'live') acts.push(`<button class="btn-q" type="button" data-hide="${c.id}">${ic('eye')}Hide</button>`, `<button class="btn-q mx-q-danger" type="button" data-rm="${c.id}">${ic('trash')}Remove</button>`);
    if (c.status === 'hidden') acts.push(`<button class="btn-q" type="button" data-restore="${c.id}">Restore</button>`, `<button class="btn-q mx-q-danger" type="button" data-rm="${c.id}">${ic('trash')}Remove</button>`);
    if (r && r.status === 'open') acts.push(`<a class="btn-q" href="#moderation-${r.id}">${ic('flag')}Report ${r.id}</a>`);
    return `<article class="mx-slip mk-camp is-${c.status}${f ? ' is-flag' : ''}" data-id="${c.id}" aria-labelledby="mkc-${c.id}">
      <div class="mx-stub"><p class="mx-stub-l">Budget</p><p class="mx-price t-money">${L.inr(c.budget)}</p><p class="mx-stub-d">Posted ${esc(L.fmtDate(c.posted))}</p></div>
      <div class="mx-body">
        <div class="mx-top">${brWho(b)}<span class="row mk-pills">${f ? pill('pill-err', 'alert', plural(c.flags, 'report')) : ''}${pill(...CST[c.status])}</span></div>
        <h3 class="mx-t" id="mkc-${c.id}"><button type="button" data-brief="${c.id}">${esc(c.title)}</button></h3>
        <dl class="mx-meta"><div><dt>Platform</dt><dd><span class="mx-plat-i">${glyph(c.platform)}</span>${esc(plat(c.platform))}</dd></div><div><dt>Bids</dt><dd>${c.bids}</dd></div>
          <div class="${burst ? 'is-bad' : ''}"><dt>Brand posts</dt><dd>${burst ? `${b.postsLast30} in 2 days` : `${b.postsLast30} in 30 days`}</dd></div></dl>
        ${c.rule && c.status === 'live' ? `<p class="mx-rule">${ic('alert')}<span>Breaks the rules: ${esc(c.rule)}</span></p>` : ''}
        ${c.mod ? `<p class="mx-note">${c.status === 'live' ? 'Restored' : CST[c.status][2]} by ${esc(c.mod.by)} · ${esc(c.mod.reason)}</p>` : ''}
        <div class="mx-acts">${acts.join('')}</div>
      </div></article>`;
  }
  function tabCampaigns(u) {
    const all = S().campaigns, list = all.filter(c => inCF(c, u.cf || 'all'));
    const order = (a, b) => (flagged(b) - flagged(a)) || b.flags - a.flags || String(b.posted).localeCompare(String(a.posted));
    const groups = [['Needs a decision', c => flagged(c)], ['Live', c => c.status === 'live' && !flagged(c)], ['Hidden or removed', c => c.status !== 'live']];
    const body = list.length ? groups.map(([t, has], i) => { const rows = list.filter(has).sort(order); return rows.length ? `<section class="mx-group" aria-labelledby="mkg${i}"><h2 class="mx-gh" id="mkg${i}"><span class="t-h3">${t}</span><span class="mx-gn num">${rows.length}</span></h2><div class="mx-list">${rows.map(campSlip).join('')}</div></section>` : ''; }).join('')
      : `<div class="empty"><p class="t-h2">Nothing here.</p><p class="muted">No campaigns match this filter.</p><button class="lq lq-s" type="button" data-cf="all">Show all campaigns</button></div>`;
    return `<div class="chips mx-filter" role="group" aria-label="Filter campaigns">${CF.map(([k, n]) => `<button class="chip" type="button" data-cf="${k}" aria-pressed="${(u.cf || 'all') === k}">${n} <span class="mx-cn">${all.filter(c => inCF(c, k)).length}</span></button>`).join('')}</div>
      <div class="mx-board">${body}</div>`;
  }

  /* ----- tab: bids ----- */
  const level = r => (r >= 70 ? ['high', 'High risk'] : r >= 40 ? ['mid', 'Medium risk'] : ['low', 'Low risk']);
  const AST = { open: ['pill-warn', 'clock', 'Needs review'], actioned: ['pill-ok', 'check', 'Actioned'], dismissed: ['pill-paper', '', 'Dismissed'] };
  function alertCard(a, u) {
    const [lv, lvT] = level(a.risk), st = AST[a.status] || AST.open, sig = SIGNALS[a.id] || [], data = ALERT_BIDS[a.id] || { total: 0, rows: [] };
    const open = !!(u.openBids || {})[a.id];
    const accts = a.accounts.map(x => { const c = L.creator(x); return c ? crWho(c, c.status === 'suspended' ? 'Suspended' : c.handle) : `<span class="mx-who is-x"><span class="avatar mx-av is-x" aria-hidden="true">${ic('users')}</span><span class="mx-who-t"><b>${esc(x)}</b></span></span>`; }).join('');
    const named = a.accounts.map(L.creator).filter(Boolean);
    const acts = [];
    if (a.status === 'open') {
      if (a.risk >= 40) acts.push(`<button class="lq lq-p lq-sm mx-danger" type="button" data-asusp="${a.id}">Suspend accounts</button>`);
      else if (named.length) acts.push(`<button class="lq lq-s lq-sm" type="button" data-awarn="${a.id}">Warn ${esc(named[0].name.split(' ')[0])}</button>`);
      if (!a.frozen && a.risk >= 40) acts.push(`<button class="lq lq-s lq-sm" type="button" data-afreeze="${a.id}">${ic('lock')}Freeze these bids</button>`);
      acts.push(`<button class="btn-q" type="button" data-adis="${a.id}">Dismiss</button>`);
    }
    return `<article class="mk-alert is-${lv} is-${a.status}" data-id="${a.id}" aria-labelledby="mka-${a.id}">
      <div class="mk-risk">
        <p class="mx-stub-l">Risk score</p>
        <p class="mk-risk-n"><span class="t-money">${a.risk}</span><span class="muted">/100</span></p>
        <span class="mk-meter" aria-hidden="true"><span style="width:${a.risk}%"></span></span>
        <p class="mk-risk-l">${lvT}</p>
        <ul class="mk-why" aria-label="How the score is made">${sig.map(([t, p]) => `<li><span>${esc(t)}</span><b class="num">+${p}</b></li>`).join('')}</ul>
      </div>
      <div class="mx-body">
        <div class="mx-top"><p class="t-eyebrow">${esc(a.pattern)} · ${esc(L.ago(a.at))}</p><span class="row mk-pills">${a.frozen && a.status === 'open' ? pill('pill-escrow', 'lock', 'Bids frozen') : ''}${pill(...st)}</span></div>
        <h3 class="mx-t" id="mka-${a.id}">${esc(a.detail)}</h3>
        ${PITCH[a.id] ? `<p class="mx-quote">${esc(PITCH[a.id])}</p>` : ''}
        <div class="mk-accts"><p class="mx-stub-l">Accounts</p><div class="mk-accts-l">${accts}</div></div>
        <button class="btn-q mk-bt" type="button" data-abids="${a.id}" aria-expanded="${open}" aria-controls="mkb-${a.id}">${ic(open ? 'minus' : 'plus')}${open ? 'Hide the bids' : `See the bids (${data.total})`}</button>
        <div class="mk-bids" id="mkb-${a.id}"${open ? '' : ' hidden'}>
          <table class="mk-tbl"><caption class="sr-only">Bids behind ${esc(a.pattern)}</caption><thead><tr><th scope="col">Account</th><th scope="col">Campaign</th><th scope="col" class="r">Bid</th><th scope="col">When</th><th scope="col">Why it stands out</th></tr></thead>
          <tbody>${data.rows.map(([k, n, cid, amt, at, why]) => { const c = camp(cid); return `<tr><td><span class="mk-acc is-${k}">${esc(n)}</span></td><td>${esc(c ? c.title : cid)}</td><td class="r num">${L.inr(amt)}</td><td class="num">${esc(time(at))}</td><td class="muted">${esc(why)}</td></tr>`; }).join('')}</tbody></table>
          ${data.total > data.rows.length ? `<p class="t-small muted">and ${data.total - data.rows.length} more like these</p>` : ''}
        </div>
        ${a.outcome ? `<p class="mx-note">${esc(a.outcome)}</p>` : ''}
        ${acts.length ? `<div class="mx-acts">${acts.join('')}</div>` : ''}
      </div></article>`;
  }
  function tabBids(u) {
    const all = S().bidAlerts.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.risk - a.risk);
    const live = S().campaigns.filter(c => c.status === 'live').reduce((n, c) => n + c.bids, 0);
    return `<p class="mk-lede">${plural(openAlerts().length, 'pattern')} to review across ${live} bids on live campaigns. Scores add up the signals listed under each one.</p>
      <div class="mx-list">${all.map(a => alertCard(a, u)).join('')}</div>`;
  }
  function alertAction(kind, id, done) {
    const a = S().bidAlerts.find(x => x.id === id), named = a.accounts.map(L.creator).filter(Boolean);
    const mini = `<div class="mx-mini"><p class="t-eyebrow">${esc(a.pattern)} · risk ${a.risk}/100</p><p class="t-small">${esc(a.detail)}</p></div>`;
    const set = (patch) => L.store.set(s => Object.assign(s.bidAlerts.find(x => x.id === id), patch), 'bids');
    const n = a.id === 'ba2' ? 17 : a.accounts.length;
    if (kind === 'susp') reasonSheet({
      title: `Suspend ${plural(n, 'account')}?`, mini, danger: true, yes: `Suspend ${plural(n, 'account')}`, action: 'account.suspend', target: `${a.pattern} (${a.id}) · ${plural(n, 'account')}`,
      bullets: ['They are signed out and can’t bid, message or withdraw.', 'Their open bids are withdrawn and brands are told the bid is no longer available.', 'Money already in escrow stays put until an admin decides each order.'],
      reasons: a.id === 'ba2' ? ['Bid flooding with copied pitches', 'Fake accounts', 'Bid ring: linked accounts'] : ['Bid ring: linked accounts', 'Fake accounts', 'Bid flooding with copied pitches'], preset: true,
      onYes(r) { named.forEach(c => suspend('c', c.id, r)); set({ status: 'actioned', outcome: `${plural(n, 'account')} suspended by ${S().me.name} · ${r}` }); done(); }
    });
    if (kind === 'freeze') reasonSheet({
      title: 'Freeze these bids?', mini, yes: 'Freeze bids', action: 'bids.freeze', target: `${a.pattern} (${a.id}) · ${ALERT_BIDS[id].total} bids`,
      bullets: ['Brands stop seeing these bids until you decide. The accounts can still sign in.', 'Nothing is declined yet, so you can still clear them.'],
      reasons: ['Hold while we investigate', 'Protect brands from spam bids'], preset: true,
      onYes() { set({ frozen: true }); done(); }
    });
    if (kind === 'warn') reasonSheet({
      title: `Warn ${named[0].name}?`, mini, yes: 'Send warning', action: 'account.warn', target: `${named[0].name} (${named[0].id})`,
      bullets: [`${named[0].name.split(' ')[0]} gets a plain note in their inbox about fair pricing. The bid stays live.`, 'A warning shows on their account for other admins.'],
      reasons: ['Pricing far under budget', 'Repeated lowball bids'],
      onYes(r) { set({ status: 'actioned', outcome: `Warned by ${S().me.name} · ${r}` }); done(); }
    });
    if (kind === 'dis') reasonSheet({
      title: 'Dismiss this alert?', mini, yes: 'Dismiss alert', action: 'bids.dismiss', target: `${a.pattern} (${a.id})`,
      bullets: ['The alert closes and the bids carry on as normal.', 'The system keeps watching these accounts.'],
      reasons: ['Within the platform rules', 'False match: different people', 'Already handled elsewhere'],
      onYes(r) { set({ status: 'dismissed', frozen: false, outcome: `Dismissed by ${S().me.name} · ${r}` }); done(); }
    });
  }

  /* ----- tab: reviews ----- */
  const RF = [['all', 'All'], ['flagged', 'Flagged'], ['removed', 'Deleted']];
  const RST = { visible: ['pill-ok', 'eye', 'Visible'], flagged: ['pill-warn', 'flag', 'Flagged'], removed: ['pill-paper', 'trash', 'Deleted'] };
  function reviewCard(r) {
    const c = S().creators.find(x => x.name === r.to), b = S().brands.find(x => x.name === r.from), o = r.order && S().orders.find(x => x.id === r.order);
    const from = b ? brWho(b, 'Brand') : who('x', r.from, 'Not linked to a verified brand');
    return `<article class="mk-rev is-${r.status}" data-id="${r.id}">
      <div class="mk-rev-h"><span class="row mk-rev-ppl">${from}<span class="mk-arrow" aria-hidden="true">${ic('arrow')}</span>${c ? crWho(c, 'Creator') : who('c', r.to)}</span><span class="row mk-pills">${pill(...RST[r.status])}</span></div>
      <div class="row mk-rev-s">${stars(r.stars)}<span class="t-small muted">${esc(L.fmtDate(r.at, { year: true }))}</span></div>
      <p class="mk-rev-t">“${esc(r.text)}”</p>
      ${o ? `<p class="mk-rev-o">${ic('check')}<span>Order ${esc(o.id)} · ${esc(o.title)} · ${o.phase === 'released' ? 'paid out' : esc(o.phase)}</span></p>` : `<p class="mx-rule">${ic('alert')}<span>No order between them. Reviews need a completed order.</span></p>`}
      ${r.mod ? `<p class="mx-note">${r.status === 'removed' ? 'Deleted' : 'Kept'} by ${esc(r.mod.by)} · ${esc(r.mod.reason)}</p>` : ''}
      ${r.status !== 'removed' ? `<div class="mx-acts">${r.status === 'flagged' ? `<button class="lq lq-p lq-sm mx-danger" type="button" data-rdel="${r.id}">${ic('trash')}Delete review</button><button class="lq lq-s lq-sm" type="button" data-rkeep="${r.id}">Keep it</button>` : `<button class="btn-q mx-q-danger" type="button" data-rdel="${r.id}">${ic('trash')}Delete</button>`}</div>` : ''}
    </article>`;
  }
  function tabReviews(u) {
    const all = S().reviews, f = u.rf || 'all', list = all.filter(r => f === 'all' || r.status === f).sort((a, b) => (b.status === 'flagged') - (a.status === 'flagged') || b.at.localeCompare(a.at));
    return `<div class="chips mx-filter" role="group" aria-label="Filter reviews">${RF.map(([k, n]) => `<button class="chip" type="button" data-rf="${k}" aria-pressed="${f === k}">${n} <span class="mx-cn">${all.filter(r => k === 'all' || r.status === k).length}</span></button>`).join('')}</div>
      ${list.length ? `<div class="mk-revs">${list.map(reviewCard).join('')}</div>` : `<div class="empty"><p class="t-h2">No reviews here.</p><p class="muted">Flagged and deleted reviews show up in their own filters.</p></div>`}`;
  }
  function reviewAction(kind, id, done) {
    const r = S().reviews.find(x => x.id === id), rep = reportFor(id);
    const set = (status, reason) => L.store.set(s => { const x = s.reviews.find(y => y.id === id); x.status = status; x.mod = { by: s.me.name, at: nowISO(), reason }; }, 'review');
    if (kind === 'del') reasonSheet({
      title: 'Delete this review?', mini: reviewMini(r), danger: true, yes: 'Delete review', action: 'review.delete', target: `Review ${r.id} · ${r.from} on ${r.to}`,
      bullets: [`It comes off ${r.to}’s profile and their rating is worked out again without it.`, 'The reviewer is told it broke the review rules.', rep && rep.status === 'open' ? `Report ${rep.id} is closed as actioned.` : 'This can’t be undone.'],
      reasons: r.order ? ['Abusive language', 'Personal details shared'] : ['Fake review: no order between them', 'Abusive language', 'Posted by a competitor'], preset: !r.order,
      onYes(reason) { set('removed', reason); if (rep) closeReport(rep.id, 'actioned', 'Review deleted', reason); done(); }
    });
    if (kind === 'keep') reasonSheet({
      title: 'Keep this review?', mini: reviewMini(r), yes: 'Keep review', action: 'review.keep', target: `Review ${r.id} · ${r.from} on ${r.to}`,
      bullets: ['The flag clears and the review stays on the profile.'],
      reasons: ['Honest, if harsh', 'Matches the order history'],
      onYes(reason) { set('visible', reason); if (rep) closeReport(rep.id, 'dismissed', 'Review kept', reason); done(); }
    });
  }

  /* ----- tab: featured creators ----- */
  const featOrder = () => {
    const u = ui('marketplace'), ids = S().creators.filter(c => c.featured && c.status === 'active').map(c => c.id);
    if (!u.feat) u.feat = ids.slice();
    u.feat = u.feat.filter(id => ids.includes(id)).concat(ids.filter(id => !u.feat.includes(id)));
    return u.feat;
  };
  function tabFeatured(u) {
    const ord = u.draft || featOrder(), dirty = !!u.draft;
    const pool = S().creators.filter(c => !c.featured && c.status === 'active' && c.kyc === 'verified' && (c.rating || 0) >= 4.4).sort((a, b) => b.rating - a.rating);
    const row = (id, i) => { const c = L.creator(id); return `<li class="mk-feat" data-id="${c.id}">
      <span class="mk-rank t-money num" aria-hidden="true">${i + 1}</span>
      <div class="mk-feat-w">${crWho(c)}<span class="row mk-feat-b">${c.badges.map(b => pill('pill-line', 'verified', b)).join('')}</span></div>
      <dl class="mk-feat-s"><div><dt>Followers</dt><dd class="num">${L.compact(c.followers)}</dd></div><div><dt>Rating</dt><dd class="num">${c.rating ? c.rating.toFixed(1) : '—'}</dd></div><div><dt>Jobs</dt><dd class="num">${c.jobs}</dd></div></dl>
      <span class="row mk-feat-c">
        <button class="ibtn" type="button" data-up="${i}" aria-label="Move ${esc(c.name)} up"${i === 0 ? ' disabled' : ''}>${ic('down')}</button>
        <button class="ibtn" type="button" data-dn="${i}" aria-label="Move ${esc(c.name)} down"${i === ord.length - 1 ? ' disabled' : ''}>${ic('down')}</button>
        <button class="btn-q" type="button" data-unfeat="${c.id}">Unfeature</button></span></li>`; };
    return `<div class="mk-feat-g">
      <section class="stack" aria-labelledby="mkfh"><div class="row between wrap"><h2 class="t-h3" id="mkfh">On Discover, in this order</h2><span class="t-small muted">Brands see the first three on their home</span></div>
        <ol class="mk-feats">${ord.map(row).join('')}</ol>
        ${dirty ? `<div class="mk-save" role="status"><span>Order changed. Brands see it once you save.</span><span class="row"><button class="lq lq-p lq-sm" type="button" data-fsave>Save order</button><button class="btn-q" type="button" data-fundo>Undo</button></span></div>` : ''}
      </section>
      <aside class="stack mk-pool" aria-labelledby="mkph"><h2 class="t-h3" id="mkph">Could be featured</h2><p class="t-small muted">Verified, active, rated 4.4 or more.</p>
        ${pool.length ? `<ul class="stack">${pool.map(c => `<li class="mk-pool-r">${crWho(c, `${L.compact(c.followers)} · ${c.rating.toFixed(1)} rating`)}<button class="lq lq-s lq-sm" type="button" data-feat="${c.id}">${ic('plus')}Feature</button></li>`).join('')}</ul>` : '<p class="muted">Everyone who qualifies is featured.</p>'}
      </aside></div>`;
  }

  /* ----- tab: categories ----- */
  const tagCount = n => S().creators.filter(c => c.tags.includes(n)).length;
  function tabCategories(u) {
    const cats = S().categories;
    return `<form class="mk-catadd" novalidate><div class="field"><label for="mkCat">New category</label><input class="input" id="mkCat" maxlength="28" autocomplete="off" placeholder="For example, Parenting"></div>
        <button class="lq lq-p" type="submit">${ic('plus')}Add</button><p class="err" id="mkCatErr" role="alert" hidden></p></form>
      <ul class="mk-cats">${cats.map(n => { const k = tagCount(n); return `<li class="mk-cat${u.freshCat === n ? ' is-fresh' : ''}"><span class="mk-cat-n">${esc(n)}</span><span class="t-small muted num">${k ? plural(k, 'creator') : 'No creators yet'}</span>
        <span class="row mk-cat-a"><button class="btn-q" type="button" data-ren="${esc(n)}">${ic('edit')}Rename</button><button class="btn-q" type="button" data-merge="${esc(n)}">Merge</button></span></li>`; }).join('')}</ul>`;
  }
  function catSheet(kind, name, done) {
    const others = S().categories.filter(x => x !== name), k = tagCount(name);
    L.openSheet({
      title: kind === 'ren' ? `Rename ${name}` : `Merge ${name}`,
      body: `<form class="stack mx-sheet" novalidate>
        ${kind === 'ren' ? `<div class="field"><label for="mkCn">New name</label><input class="input" id="mkCn" maxlength="28" value="${esc(name)}" autocomplete="off"></div>`
          : `<div class="field"><label for="mkCm">Merge into</label><select class="select" id="mkCm">${others.map(o => `<option>${esc(o)}</option>`).join('')}</select></div>`}
        <ul class="mx-conseq"><li>${kind === 'ren' ? `${k ? plural(k, 'creator') + ' tagged ' + name + ' keep the tag under its new name.' : 'No creators use it yet.'}` : `${k ? plural(k, 'creator') + ' move' + (k === 1 ? 's' : '') + ' to the category you pick.' : 'No creators use it, so nothing moves.'} ${name} is then removed.`}</li><li>Creators and brands see the change on their next search.</li></ul>
        <p class="err" id="mkCe" role="alert" hidden></p>
        <p class="mx-logged">${ic('shield')}<span>Logged as <code>category.${kind === 'ren' ? 'rename' : 'merge'}</code> by ${esc(S().me.name)}.</span></p>
        <div class="row wrap"><button class="lq lq-p" type="submit">${kind === 'ren' ? 'Rename' : 'Merge categories'}</button><button class="lq lq-s" type="button" data-no>Cancel</button></div></form>`,
      onMount(b, close) {
        b.querySelector('[data-no]').addEventListener('click', () => close());
        b.querySelector('form').addEventListener('submit', e => {
          e.preventDefault();
          const err = b.querySelector('#mkCe');
          if (kind === 'ren') {
            const v = b.querySelector('#mkCn').value.trim().replace(/\s+/g, ' ');
            const m = !v ? 'Give it a name.' : v === name ? 'That is the same name.' : others.some(o => o.toLowerCase() === v.toLowerCase()) ? `${v} already exists. Merge into it instead.` : '';
            if (m) { err.textContent = m; err.hidden = false; return; }
            L.store.set(s => { s.categories = s.categories.map(x => (x === name ? v : x)); s.creators.forEach(c => { c.tags = c.tags.map(t => (t === name ? v : t)); }); }, 'cats');
            L.audit('category.rename', 'Category ' + name, `${name} → ${v}`); ui('marketplace').freshCat = v;
          } else {
            const to = b.querySelector('#mkCm').value;
            L.store.set(s => { s.categories = s.categories.filter(x => x !== name); s.creators.forEach(c => { if (c.tags.includes(name)) c.tags = [...new Set(c.tags.map(t => (t === name ? to : t)))]; }); }, 'cats');
            L.audit('category.merge', 'Category ' + name, `${name} merged into ${to}, ${plural(k, 'creator')} moved`); ui('marketplace').freshCat = to;
          }
          close(); L.toast('Logged to audit', 'check'); done();
        });
      }
    });
  }

  L.register('marketplace', {
    title: p => (p && TABS.find(t => t[0] === p) ? TABS.find(t => t[0] === p)[1] + ' · Marketplace' : 'Marketplace'), nav: 'marketplace',
    crumb: p => (p && TABS.find(t => t[0] === p) && p !== 'campaigns' ? `<a href="#marketplace">Marketplace</a> / ${TABS.find(t => t[0] === p)[1]}` : ''),
    render(el, param) {
      const u = ui('marketplace');
      let tab = TABS.some(t => t[0] === param) ? param : 'campaigns', openBrief = null;
      if (param && camp(param)) { tab = 'campaigns'; openBrief = param; }
      const summary = () => {
        const a = S().campaigns.filter(flagged).length, b = openAlerts().length, r = flaggedReviews().length;
        return a + b + r ? `${plural(a, 'flagged campaign')}, ${plural(b, 'bid pattern')} and ${plural(r, 'flagged review')} need a decision.` : 'Nothing waiting. The marketplace is clean right now.';
      };
      const tabsHTML = () => TABS.map(([k, n]) => { const c = { campaigns: S().campaigns.filter(flagged).length, bids: openAlerts().length, reviews: flaggedReviews().length }[k]; return `<a class="chip mk-tab" href="#marketplace-${k}"${k === tab ? ' aria-current="page"' : ''}>${n}${c ? ` <span class="mx-cn is-hot">${c}</span>` : ''}</a>`; }).join('');
      const body = () => ({ campaigns: tabCampaigns, bids: tabBids, reviews: tabReviews, featured: tabFeatured, categories: tabCategories })[tab](u);
      el.innerHTML = `<div class="view-in mk">
        <header class="mx-head"><div class="mx-head-t"><h1 class="t-h1">Marketplace</h1><p class="muted" id="mkSum">${esc(summary())} <span class="sample">Sample data</span></p></div></header>
        <nav class="chips mx-filter mk-tabs" aria-label="Marketplace sections">${tabsHTML()}</nav>
        <p class="sr-only" id="mkLive" aria-live="polite"></p>
        <div class="mk-pane" id="mkPane">${body()}</div>
      </div>`;
      const $ = q => el.querySelector(q);
      const refresh = (msg, animate = true) => {
        const m = () => { $('#mkPane').innerHTML = body(); $('.mk-tabs').innerHTML = tabsHTML(); $('#mkSum').innerHTML = `${esc(summary())} <span class="sample">Sample data</span>`; L.liquid($('#mkPane')); };
        animate ? flip(m, () => L.$$('.mx-slip,.mk-alert,.mk-rev,.mk-feat,.mk-cat', el)) : m();
        if (msg) $('#mkLive').textContent = msg;
      };
      const after = (sel, msg) => () => { refresh(msg); const n = sel && el.querySelector(sel); n && mo('fresh', n); };
      el.addEventListener('click', e => {
        const t = e.target.closest('button'); if (!t || !el.contains(t)) return;
        const d = t.dataset;
        if (d.cf) { u.cf = d.cf; refresh(`Showing ${d.cf} campaigns`); const f = el.querySelector(`[data-cf="${d.cf}"]`); f && f.focus(); }
        else if (d.rf) { u.rf = d.rf; refresh(`Showing ${d.rf} reviews`); const f = el.querySelector(`[data-rf="${d.rf}"]`); f && f.focus(); }
        else if (d.brief) briefSheet(d.brief, after(`[data-id="${d.brief}"]`, 'Campaign updated'));
        else if (d.hide) hideCampaign(d.hide, after(`[data-id="${d.hide}"]`, 'Campaign hidden'));
        else if (d.rm) removeCampaign(d.rm, after(`[data-id="${d.rm}"]`, 'Campaign removed'));
        else if (d.restore) restoreCampaign(d.restore, after(`[data-id="${d.restore}"]`, 'Campaign restored'));
        else if (d.abids) { u.openBids = u.openBids || {}; u.openBids[d.abids] = !u.openBids[d.abids]; refresh('', false); const n = el.querySelector(`[data-abids="${d.abids}"]`); n && n.focus(); const tb = el.querySelector('#mkb-' + d.abids); tb && !tb.hidden && mo('reveal', tb); }
        else if (d.asusp) alertAction('susp', d.asusp, after(`[data-id="${d.asusp}"]`, 'Accounts suspended'));
        else if (d.afreeze) alertAction('freeze', d.afreeze, after(`[data-id="${d.afreeze}"]`, 'Bids frozen'));
        else if (d.awarn) alertAction('warn', d.awarn, after(`[data-id="${d.awarn}"]`, 'Warning sent'));
        else if (d.adis) alertAction('dis', d.adis, after(`[data-id="${d.adis}"]`, 'Alert dismissed'));
        else if (d.rdel) reviewAction('del', d.rdel, after(`[data-id="${d.rdel}"]`, 'Review deleted'));
        else if (d.rkeep) reviewAction('keep', d.rkeep, after(`[data-id="${d.rkeep}"]`, 'Review kept'));
        else if (d.up || d.dn) {
          const ord = (u.draft || featOrder()).slice(), i = +(d.up || d.dn), j = d.up ? i - 1 : i + 1;
          if (j < 0 || j >= ord.length) return;
          [ord[i], ord[j]] = [ord[j], ord[i]]; u.draft = ord.join() === featOrder().join() ? null : ord;
          refresh(`${L.creator(ord[j]).name} moved to number ${j + 1}`);
          const n = el.querySelector(`.mk-feat[data-id="${ord[j]}"] [data-${d.up ? 'up' : 'dn'}]`); (n && !n.disabled ? n : el.querySelector(`.mk-feat[data-id="${ord[j]}"] .btn-q`)).focus();
        }
        else if ('fsave' in d) { const ord = u.draft; u.feat = ord; u.draft = null; L.audit('featured.reorder', 'Featured creators', ord.map((id, i) => `${i + 1}. ${L.creator(id).name}`).join(', ')); L.toast('Logged to audit', 'check'); refresh('Order saved'); }
        else if ('fundo' in d) { u.draft = null; refresh('Order change undone'); }
        else if (d.feat || d.unfeat) {
          const id = d.feat || d.unfeat, c = L.creator(id), on = !!d.feat;
          L.store.set(s => { s.creators.find(x => x.id === id).featured = on; }, 'featured');
          if (on) { u.feat = featOrder().filter(x => x !== id).concat(id); }
          if (u.draft) u.draft = on ? u.draft.concat(id) : u.draft.filter(x => x !== id);
          L.audit(on ? 'creator.feature' : 'creator.unfeature', `${c.name} (${c.id})`, on ? `Added at number ${featOrder().length}` : 'Removed from Discover');
          L.toast('Logged to audit', 'check'); refresh(on ? `${c.name} featured` : `${c.name} unfeatured`);
          const n = el.querySelector(`.mk-feat[data-id="${id}"]`); n && mo('fresh', n);
        }
        else if (d.ren) catSheet('ren', d.ren, () => refresh('Category renamed'));
        else if (d.merge) catSheet('merge', d.merge, () => refresh('Categories merged'));
      });
      el.addEventListener('submit', e => {
        if (!e.target.classList.contains('mk-catadd')) return;
        e.preventDefault();
        const inp = $('#mkCat'), err = $('#mkCatErr'), v = inp.value.trim().replace(/\s+/g, ' ');
        const m = !v ? 'Type a name first.' : v.length < 3 ? 'Use at least 3 letters.' : S().categories.some(x => x.toLowerCase() === v.toLowerCase()) ? `${v} already exists.` : '';
        if (m) { err.textContent = m; err.hidden = false; inp.closest('.field').classList.add('is-err'); mo('shake', inp); inp.focus(); return; }
        L.store.set(s => { s.categories = [...s.categories, v]; }, 'cats'); u.freshCat = v;
        L.audit('category.add', 'Category ' + v, 'New category for creators and briefs'); L.toast('Logged to audit', 'check');
        refresh(`${v} added`); const n = el.querySelector('.mk-cat.is-fresh'); n && mo('fresh', n); $('#mkCat').focus();
      });
      el.addEventListener('input', e => { if (e.target.id === 'mkCat') { $('#mkCatErr').hidden = true; e.target.closest('.field').classList.remove('is-err'); } });
      mo('stagger', L.$$('.mx-slip,.mk-alert,.mk-rev,.mk-feat,.mk-cat', el));
      if (openBrief) requestAnimationFrame(() => briefSheet(openBrief, after(`[data-id="${openBrief}"]`, 'Campaign updated')));
      return () => { u.freshCat = null; };
    }
  });
})();
