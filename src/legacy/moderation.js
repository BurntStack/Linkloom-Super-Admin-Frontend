/* Super Admin · Moderation (#moderation, #moderation-<reportId>). Reported profiles, messages, content, reviews and campaigns.
   Severity, count, excerpt and context, then Remove / Warn / Suspend account / Dismiss: each takes a reason (LLD.mx.reasonSheet) and is logged.
   Uses the Builder C kit from marketplace.js (loaded first). */
(() => {
  const L = window.LLD, esc = L.esc, ic = L.icon;
  const S = () => window.LLD_DATA;
  const X = () => L.mx;

  const TYPES = { profile: ['Profile', 'user', 'Profiles'], message: ['Message', 'chat', 'Messages'], content: ['Content', 'file', 'Content'], review: ['Review', 'star', 'Reviews'], campaign: ['Campaign', 'brief', 'Campaigns'] };
  const RST = { open: ['pill-warn', 'clock', 'Open'], actioned: ['pill-ok', 'check', 'Actioned'], dismissed: ['pill-paper', '', 'Dismissed'] };
  const SEVN = { high: 0, medium: 1, low: 2 };
  /* context the data file does not carry: who the report is about, who reported it, what surrounds it (sample) */
  const CTX = {
    r1: { acct: ['b', 'b6'], reporters: [['Riya Thomas', '2026-11-04T08:12:00+05:30'], ['Tanvi Shah', '2026-11-03T19:02:00+05:30'], ['Ishita Banerjee', '2026-11-03T14:40:00+05:30'], ['Dev Malhotra', '2026-11-02T21:15:00+05:30']] },
    r2: { acct: ['b', 'b6'], reporters: [['Tanvi Shah', '2026-11-03T21:40:00+05:30']],
      thread: [['b', '2026-11-03T21:31:00+05:30', 'Hi Tanvi, loved your profile. We have a paid collab for you this week.'], ['c', '2026-11-03T21:33:00+05:30', 'Thanks! Is this the brief on Linkloom?'],
        ['b', '2026-11-03T21:36:00+05:30', 'Pay outside Linkloom to my UPI glowcash@ybl and get 2x', true], ['c', '2026-11-03T21:39:00+05:30', 'I will only work through Linkloom escrow.']] },
    r3: { acct: ['c', 'cr11'], reporters: [['System · bid-pattern check', '2026-10-29T23:40:00+05:30'], ['System · device match', '2026-10-29T23:48:00+05:30'], ['System · payout UPI match', '2026-10-29T23:55:00+05:30']], alert: 'ba1' },
    r4: { acct: ['x', 'Brand user 2291'], reporters: [['Meher Gill', '2026-11-02T15:00:00+05:30']] },
    r5: { acct: ['c', 'cr7'], reporters: [['Roz Fit', '2026-09-10T11:00:00+05:30']], file: ['SPF_runtest_final.mp4', '48 s · uploaded 9 Sep', 'Caption: “This SPF cures acne in 3 days, tested on my run.”'] }
  };
  const REMOVE = { campaign: 'Remove campaign', message: 'Remove message', content: 'Remove file', review: 'Delete review', profile: 'Hide profile' };
  const DONE = { campaign: 'Campaign removed', message: 'Message removed', content: 'File removed', review: 'Review deleted', profile: 'Profile hidden' };
  const rep = id => S().reports.find(r => r.id === id) || null;
  const acctOf = r => {
    const c = (CTX[r.id] || {}).acct; if (!c) return null;
    if (c[0] === 'b') { const b = L.brand(c[1]); return b && { kind: 'b', id: b.id, name: b.name, rec: b }; }
    if (c[0] === 'c') { const k = L.creator(c[1]); return k && { kind: 'c', id: k.id, name: k.name, rec: k }; }
    return { kind: 'x', id: null, name: c[1], rec: null };
  };
  const personKind = n => (S().creators.some(c => c.name === n) ? 'c' : S().brands.some(b => b.name === n) ? 'b' : /^System/.test(n) ? 's' : 'x');
  const typeTag = r => { const t = TYPES[r.type] || TYPES.content; return `<span class="md-type">${ic(t[1])}${esc(t[0])}</span>`; };
  const stPill = r => { const m = RST[r.status] || RST.open; return X().pill(m[0], m[1], m[2]); };

  const reportMini = r => `<div class="mx-mini"><p class="row md-mini-h">${typeTag(r)}<span class="t-small muted">${esc(r.id)} · ${X().plural(r.count, 'report')}</span></p><p class="t-label">${esc(r.target)}</p>${r.excerpt ? `<p class="mx-quote">“${esc(r.excerpt)}”</p>` : `<p class="t-small muted">${esc(r.reason)}</p>`}</div>`;

  function act(kind, id, done) {
    const r = rep(id), a = acctOf(r), x = X(), tgt = `Report ${r.id} · ${a ? a.name : r.target}`;
    const fin = (status, label, reason) => x.closeReport(r.id, status, label, reason);
    if (kind === 'remove') x.reasonSheet({
      title: REMOVE[r.type] + '?', mini: reportMini(r), danger: true, yes: REMOVE[r.type], action: 'report.remove', target: tgt, preset: true,
      bullets: {
        campaign: ['The campaign comes down for good and its open bids are declined.', 'Every bidder is told it was a scam, so nobody pays the brand.'],
        message: ['The message is replaced with “Removed by Linkloom” for both sides.', 'The rest of the chat stays, so the creator keeps their record.'],
        content: ['The file comes off the delivery. The order stays open so the creator can upload again.', 'No money moves.'],
        review: ['It comes off the profile and the rating is worked out again without it.'],
        profile: ['The profile is hidden from search and Discover. The account can still sign in.']
      }[r.type].concat('The person who reported it is told it was actioned.'),
      reasons: [r.reason, 'Breaks the community rules', 'Scam or fraud'],
      onYes(reason) {
        if (r.type === 'campaign' && r.link) L.store.set(s => { const k = s.campaigns.find(c => c.id === r.link); if (k) { k.status = 'removed'; k.mod = { by: s.me.name, at: x.nowISO(), reason }; } }, 'campaign');
        if (r.type === 'review' && r.link) L.store.set(s => { const v = s.reviews.find(c => c.id === r.link); if (v) { v.status = 'removed'; v.mod = { by: s.me.name, at: x.nowISO(), reason }; } }, 'review');
        fin('actioned', DONE[r.type], reason);
        done();
      }
    });
    if (kind === 'warn') x.reasonSheet({
      title: `Warn ${a.name}?`, mini: reportMini(r), yes: 'Send warning', action: 'report.warn', target: tgt,
      bullets: [`${a.name} gets a plain note in their Linkloom inbox naming the rule. Nothing is taken down.`, 'The warning shows on the account for other admins. A second one usually means suspension.'],
      reasons: [r.reason, 'First offence', 'Breaks the community rules'], preset: true,
      onYes(reason) { fin('actioned', 'Warned', reason); done(); }
    });
    if (kind === 'suspend') x.reasonSheet({
      title: `Suspend ${a.name}?`, mini: reportMini(r), danger: true, yes: 'Suspend account', action: 'account.suspend', target: `${a.name}${a.id ? ' (' + a.id + ')' : ''}`,
      bullets: ['They are signed out on every device and can’t post, bid, message or withdraw.', a.kind === 'b' ? `Its ${a.rec.open} open campaigns are hidden, and creators who bid are told why.` : 'Their open bids are withdrawn. Money in escrow stays put until each order is decided.', `Report ${r.id} is closed as actioned. You can reactivate the account from Accounts.`],
      reasons: [r.reason, 'Repeat offence', 'Scam or fraud'], preset: true,
      onYes(reason) {
        if (a.id) x.suspend(a.kind, a.id, reason);
        if (a.kind === 'b') L.store.set(s => s.campaigns.forEach(k => { if (k.brand === a.id && k.status === 'live') { k.status = 'hidden'; k.mod = { by: s.me.name, at: x.nowISO(), reason: 'Brand suspended' }; } }), 'campaign');
        fin('actioned', 'Account suspended', reason); done();
      }
    });
    if (kind === 'dismiss') x.reasonSheet({
      title: 'Dismiss this report?', mini: reportMini(r), yes: 'Dismiss report', action: 'report.dismiss', target: tgt,
      bullets: ['Nothing changes for the account. The report closes.', 'The person who reported it is thanked and told no rule was broken.'],
      reasons: ['No rule broken', 'Already handled', 'Duplicate report'],
      onYes(reason) { fin('dismissed', 'Dismissed', reason); done(); }
    });
  }

  /* ---------- list ---------- */
  function row(r) {
    const c = CTX[r.id] || {}, first = (c.reporters || [[r.by]])[0][0], more = r.count - 1;
    return `<article class="mx-slip md-row is-${r.status} sev-${r.severity}" data-id="${r.id}" aria-labelledby="mdt-${r.id}">
      <div class="mx-stub md-stub"><p class="mx-stub-l">Reports</p><p class="mx-price t-money num">${r.count}</p><p class="mx-stub-d">${esc(L.ago(r.at))}</p></div>
      <div class="mx-body">
        <div class="mx-top">${typeTag(r)}<span class="row mk-pills">${X().sev(r.severity)}${stPill(r)}</span></div>
        <h3 class="mx-t" id="mdt-${r.id}"><a href="#moderation-${r.id}">${esc(r.target)}</a></h3>
        <p class="md-reason">${esc(r.reason)}</p>
        ${r.excerpt ? `<p class="mx-quote">“${esc(r.excerpt)}”</p>` : ''}
        <p class="mx-note">Reported by <b class="md-by is-${personKind(first)}">${esc(first)}</b>${more > 0 ? ` and ${more} other${more === 1 ? '' : 's'}` : ''}${r.status !== 'open' ? ` · ${esc(r.action || RST[r.status][2])}${r.by_admin ? ' by ' + esc(r.by_admin) : ''}` : ''}</p>
        <div class="mx-acts"><a class="lq ${r.status === 'open' ? 'lq-p' : 'lq-s'} lq-sm" href="#moderation-${r.id}">${r.status === 'open' ? 'Review report' : 'Open report'}</a></div>
      </div></article>`;
  }
  function list(el) {
    const u = X().ui('moderation'); u.st = u.st || 'open'; u.ty = u.ty || 'all';
    const byS = r => u.st === 'all' || (u.st === 'open' ? r.status === 'open' : r.status !== 'open');
    const sum = () => {
      const o = S().reports.filter(r => r.status === 'open'), hi = o.filter(r => r.severity === 'high').length;
      if (!o.length) return 'No open reports. Closed ones stay here with their reasons.';
      const oldest = o.reduce((m, r) => (r.at < m ? r.at : m), o[0].at);
      return `${X().plural(o.length, 'open report')}, ${hi} high severity. The oldest came in ${L.ago(oldest)}.`;
    };
    const chips = () => [['all', 'All']].concat(Object.entries(TYPES).map(([k, v]) => [k, v[2]])).map(([k, n]) => `<button class="chip" type="button" data-ty="${k}" aria-pressed="${u.ty === k}">${n} <span class="mx-cn">${S().reports.filter(r => byS(r) && (k === 'all' || r.type === k)).length}</span></button>`).join('');
    const seg = () => [['open', 'Open'], ['closed', 'Closed'], ['all', 'All']].map(([k, n]) => `<button type="button" data-st="${k}" aria-pressed="${u.st === k}">${n}</button>`).join('');
    const board = () => {
      const rows = S().reports.filter(r => byS(r) && (u.ty === 'all' || r.type === u.ty)).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || SEVN[a.severity] - SEVN[b.severity] || b.count - a.count || b.at.localeCompare(a.at));
      if (rows.length) return `<div class="mx-list">${rows.map(row).join('')}</div>`;
      return `<div class="empty"><img src="assets/step-05-stamp.svg" width="96" height="96" alt=""><p class="t-h2">${u.st === 'open' ? 'Nothing waiting.' : 'Nothing here.'}</p><p class="muted">${u.st === 'open' ? 'Every report in this view has a decision. New ones land here first.' : 'No reports match this filter.'}</p>${u.ty !== 'all' || u.st !== 'all' ? '<button class="lq lq-s" type="button" data-reset>Show every report</button>' : ''}</div>`;
    };
    el.innerHTML = `<div class="view-in md">
      <header class="mx-head"><div class="mx-head-t"><h1 class="t-h1">Moderation</h1><p class="muted" id="mdSum">${esc(sum())} <span class="sample">Sample data</span></p></div>
        <div class="seg md-seg" role="group" aria-label="Report status">${seg()}</div></header>
      <div class="chips mx-filter" role="group" aria-label="Report type">${chips()}</div>
      <p class="sr-only" id="mdLive" aria-live="polite"></p>
      <div class="mx-board" id="mdBoard">${board()}</div>
    </div>`;
    const $ = q => el.querySelector(q);
    const refresh = msg => { X().flip(() => { $('#mdBoard').innerHTML = board(); $('.mx-filter').innerHTML = chips(); $('.md-seg').innerHTML = seg(); L.liquid($('#mdBoard')); }, () => L.$$('.md-row', el)); $('#mdLive').textContent = msg; };
    el.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t || !el.contains(t)) return;
      if (t.dataset.ty) { u.ty = t.dataset.ty; refresh(`Showing ${u.ty === 'all' ? 'all types' : TYPES[u.ty][2].toLowerCase()}`); const f = el.querySelector(`[data-ty="${u.ty}"]`); f && f.focus(); }
      else if (t.dataset.st) { u.st = t.dataset.st; refresh(`Showing ${u.st} reports`); const f = el.querySelector(`[data-st="${u.st}"]`); f && f.focus(); }
      else if ('reset' in t.dataset) { u.st = 'all'; u.ty = 'all'; refresh('Showing every report'); }
    });
    X().mo('stagger', L.$$('.md-row', el));
  }

  /* ---------- detail ---------- */
  function context(r) {
    const c = CTX[r.id] || {}, x = X();
    if (r.type === 'campaign' && r.link) {
      const k = S().campaigns.find(y => y.id === r.link), b = k && L.brand(k.brand);
      if (!k) return '';
      return `<div class="md-ctx-camp"><div class="row between wrap">${x.brWho(b)}<span class="t-money md-ctx-p">${L.inr(k.budget)}</span></div>
        <p class="t-label">${esc(k.title)}</p>
        <dl class="mx-meta"><div><dt>Bids</dt><dd>${k.bids}</dd></div><div class="${k.status === 'live' ? '' : 'is-done'}"><dt>Status</dt><dd>${esc({ live: 'Live', hidden: 'Hidden', removed: 'Removed' }[k.status])}</dd></div><div class="is-bad"><dt>Brand posts</dt><dd>${b.postsLast30} in 2 days</dd></div></dl>
        ${k.rule ? `<p class="mx-rule">${ic('alert')}<span>${esc(k.rule)}</span></p>` : ''}
        <a class="btn-q" href="#marketplace-${esc(k.id)}">Inspect the brief in Marketplace ${ic('arrow')}</a></div>`;
    }
    if (r.type === 'message' && c.thread) {
      return `<ol class="md-chat" aria-label="Chat around the reported message">${c.thread.map(([k, at, t, hit]) => `<li class="md-msg is-${k}${hit ? ' is-hit' : ''}"><p>${esc(t)}</p><span class="t-cap">${k === 'b' ? 'GlowCash Deals' : 'Tanvi Shah'} · ${esc(x.time(at))}${hit ? ' · reported' : ''}</span></li>`).join('')}</ol>
        <p class="t-small muted">Showing two messages either side. Admins see chats only when one is reported.</p>`;
    }
    if (r.type === 'review' && r.link) {
      const v = S().reviews.find(y => y.id === r.link);
      return v ? `<div class="md-ctx-rev">${x.stars(v.stars)}<p class="mx-quote">“${esc(v.text)}”</p><p class="t-small muted">${esc(v.from)} on ${esc(v.to)} · ${esc(L.fmtDate(v.at, { year: true }))}</p>
        ${v.order ? '' : `<p class="mx-rule">${ic('alert')}<span>No order between them. The reviewer’s account is 3 days old and has never hired.</span></p>`}
        <a class="btn-q" href="#marketplace-reviews">All reviews ${ic('arrow')}</a></div>` : '';
    }
    if (r.type === 'profile') {
      const k = L.creator(c.acct[1]), al = c.alert && S().bidAlerts.find(a => a.id === c.alert);
      return `<div class="md-ctx-camp">${x.crWho(k)}
        <dl class="mx-meta"><div><dt>Joined</dt><dd>${esc(L.fmtDate(k.joined, { year: true }))}</dd></div><div><dt>Engagement</dt><dd class="${k.er > 12 ? 'md-hot' : ''}">${k.er}%</dd></div><div><dt>Jobs</dt><dd>${k.jobs}</dd></div></dl>
        ${al ? `<p class="mx-rule">${ic('alert')}<span>${esc(al.pattern)}, risk ${al.risk}/100. ${esc(al.detail)}</span></p><a class="btn-q" href="#marketplace-bids">See the bid pattern ${ic('arrow')}</a>` : ''}</div>`;
    }
    if (r.type === 'content' && c.file) {
      return `<div class="md-file"><span class="md-file-i">${ic('file')}</span><span class="stack md-file-t"><b>${esc(c.file[0])}</b><span class="t-small muted">${esc(c.file[1])}</span></span></div><p class="mx-quote">${esc(c.file[2])}</p>`;
    }
    return '';
  }
  function detail(el, id) {
    const r = rep(id);
    if (!r) { el.innerHTML = `<div class="view-in"><div class="empty"><p class="t-h2">That report isn’t here.</p><p class="muted">It may have a different number. Every report is in the list.</p><a class="lq lq-p" href="#moderation">All reports</a></div></div>`; return; }
    const x = X(), c = CTX[r.id] || {}, a = acctOf(r), open = r.status === 'open';
    const reporters = (c.reporters || [[r.by, r.at]]).slice(0, r.count);
    const log = S().audit.filter(e => e.target.includes(`Report ${r.id}`) || (a && a.name && e.target.includes(a.name)) || (r.link && e.target.includes(`${r.link} `))).slice().reverse();
    const acctStatus = a && a.rec ? (a.rec.status === 'suspended' ? x.pill('pill-err', 'alert', 'Suspended') : x.pill('pill-ok', 'check', 'Active')) : x.pill('pill-line', '', 'Unlinked account');
    const decide = open ? `<div class="stack md-acts">
        <button class="lq lq-p mx-danger" type="button" data-act="remove">${ic('trash')}${esc(REMOVE[r.type])}</button>
        ${a && a.kind !== 'x' ? `<button class="lq lq-s" type="button" data-act="warn">${ic('flag')}Warn ${esc(a.name.split(' ')[0])}</button>` : ''}
        ${a && a.kind !== 'x' && a.rec.status !== 'suspended' ? `<button class="lq lq-s md-susp" type="button" data-act="suspend">${ic('lock')}Suspend account</button>` : a && a.kind === 'x' ? '<p class="t-small muted">The reviewer has no verified account to warn or suspend.</p>' : '<p class="t-small muted">The account is already suspended.</p>'}
        <button class="btn-q md-dis" type="button" data-act="dismiss">Dismiss report</button>
        <p class="mx-logged">${ic('shield')}<span>Each action asks for a reason and is written to the audit log.</span></p></div>`
      : `<div class="md-out">${stPill(r)}<p class="t-label">${esc(r.action || RST[r.status][2])}</p><p class="t-small muted">${r.by_admin ? `By ${esc(r.by_admin)}, ${esc(x.when(r.closedAt))}` : 'Decided before this session'}${r.note ? ` · ${esc(r.note)}` : ''}</p></div>`;
    el.innerHTML = `<div class="view-in md md-d">
      <a class="btn-q md-back" href="#moderation">${ic('back')}All reports</a>
      <header class="md-dh"><p class="row md-dh-e">${typeTag(r)}<span class="t-small muted">Report ${esc(r.id)} · ${esc(x.when(r.at))}</span></p>
        <h1 class="t-h1">${esc(r.target)}</h1>
        <p class="row wrap mk-pills">${x.sev(r.severity)}${x.pill('pill-line', 'flag', x.plural(r.count, 'report'))}${stPill(r)}<span class="sample">Sample data</span></p></header>
      <div class="md-grid">
        <div class="stack md-main">
          <section class="card md-card" aria-labelledby="mdw"><h2 class="t-eyebrow" id="mdw">What was reported</h2><p class="t-h3">${esc(r.reason)}</p>${r.excerpt ? `<p class="mx-quote md-ex">“${esc(r.excerpt)}”</p>` : ''}</section>
          ${context(r) ? `<section class="card md-card" aria-labelledby="mdc"><h2 class="t-eyebrow" id="mdc">Context</h2>${context(r)}</section>` : ''}
          <section class="card md-card" aria-labelledby="mdr"><h2 class="t-eyebrow" id="mdr">Who reported it · ${r.count}</h2>
            <ul class="md-reps">${reporters.map(([n, at]) => { const k = personKind(n); return `<li><span class="avatar mx-av is-${k === 's' ? 'x' : k}" aria-hidden="true">${k === 's' ? ic('shield') : esc(L.initials(n))}</span><span class="md-rep-t"><b class="md-by is-${k}">${esc(n)}</b><span class="t-small muted">${k === 'c' ? 'Creator' : k === 'b' ? 'Brand' : k === 's' ? 'Automatic check' : 'User'} · ${esc(L.ago(at))}</span></span></li>`; }).join('')}</ul></section>
          <section class="card md-card" aria-labelledby="mdl"><h2 class="t-eyebrow" id="mdl">In the audit log</h2>
            ${log.length ? `<ol class="md-log">${log.map(e => `<li><span class="md-log-a"><code>${esc(e.action)}</code><span class="t-small muted">${esc(e.who)} · ${esc(x.when(e.at))}</span></span><span class="t-small">${esc(e.detail)}</span><span class="md-hash num" title="Entry hash">#${esc(e.hash)}</span></li>`).join('')}</ol><a class="btn-q" href="#audit">${ic('shield')}Full audit log</a>` : '<p class="muted">No admin action on this yet.</p>'}</section>
        </div>
        <aside class="stack md-side" aria-label="Decision">
          <section class="card md-card"><h2 class="t-eyebrow">Account</h2>
            ${a ? (a.kind === 'b' ? x.brWho(a.rec) : a.kind === 'c' ? x.crWho(a.rec) : x.who('x', a.name, 'No verified account')) : ''}
            <p class="row wrap">${acctStatus}${a && a.rec && a.rec.reports ? `<span class="t-small muted">${x.plural(a.rec.reports, 'report')} on this account</span>` : ''}</p>
            ${a && a.rec && a.rec.suspended ? `<p class="t-small muted">Suspended ${esc(L.fmtDate(a.rec.suspended.at))}: ${esc(a.rec.suspended.reason)}</p>` : ''}</section>
          <section class="card md-card md-decide"><h2 class="t-eyebrow">${open ? 'Decide' : 'Decision'}</h2>${decide}</section>
        </aside>
      </div>
    </div>`;
  }
  function detailView(el, id) {
    detail(el, id);
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-act]'); if (!t || !rep(id)) return;
      act(t.dataset.act, id, () => { detail(el, id); L.liquid(el); const o = el.querySelector('.md-out'); if (o) { X().mo('fresh', o); o.setAttribute('tabindex', '-1'); o.focus({ preventScroll: true }); } });
    });
    X().mo('stagger', L.$$('.md-card', el));
  }

  L.register('moderation', {
    title: p => (p ? 'Report ' + p + ' · Moderation' : 'Moderation'), nav: 'moderation',
    crumb: p => (p ? `<a href="#moderation">Moderation</a> / Report ${esc(p)}` : ''),
    render(el, param) { if (param) detailView(el, param); else list(el); }
  });
})();
