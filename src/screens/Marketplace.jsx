/* Marketplace (#marketplace, #marketplace-<tab>, #campaign-<id>).
   - Campaigns   GET /v1/admin/campaigns/?filter=pending|all|live|hidden|rejected|removed|flagged&brandId=
                 GET /v1/admin/campaigns/<id>/ (changedFields, bidsSummary, signals)
                 POST .../approve/ · reject/ { reason, ruleBroken } · hide/ · remove/ · restore/ { reason }
   - Bids        GET /v1/admin/moderation/bid-alerts/ · POST .../<id>/freeze-bids|suspend-accounts|warn|dismiss/ { reason }
   - Reviews     GET /v1/admin/moderation/reviews/?status=visible|flagged|removed · POST .../<id>/delete/ · keep/
   - Featured    GET /v1/admin/users/featured-creators/ · PUT /v1/admin/users/featured-creators/order/ { creatorIds }
   - Categories  GET/POST /v1/admin/users/categories/ · PATCH .../<id>/ · POST .../<id>/merge/
   Creators coral, brands violet. Money is integer paise. */
import { Fragment, useEffect, useRef, useState } from 'react';
import L, { data } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { api, can, str, pick, num, arr, nameOf, idOf, label } from '../lib/admin.js';
import { refreshCounts } from '../lib/live.js';
import { plat, Glyph, Who } from '../lib/mx.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import { usePaged, useLoad, useStagger, Failed, Loading, Empty, More, Row, Status, Fields, Lists, Table, RoleNote, ActBtn, Seg, decide, reason, errText, inr, when } from '../components/Admin.jsx';

const TABS = [['campaigns', 'Campaigns'], ['bids', 'Bid alerts'], ['reviews', 'Reviews'], ['featured', 'Featured'], ['categories', 'Categories']];
const ui = () => (data.ui.mk = data.ui.mk || { filter: 'pending', rstatus: 'flagged' });

/* ----- campaigns ----- */
/* The review state (pending / live / hidden / rejected / removed) is separate from `status`, which is the brief's own
   lifecycle ("open" for bids). Its field name differs between the public and admin APIs, so look for it under every
   likely name, then any field named like moderation/review/approval. Returns '' when the record does not say. */
function reviewOf(k) {
  if (!k || typeof k !== 'object') return '';
  const m = k.moderation && typeof k.moderation === 'object' ? k.moderation : null;
  const direct = pick(k.moderationStatus, m && pick(m.status, m.state), typeof k.moderation === 'string' ? k.moderation : null,
    k.reviewStatus, k.reviewState, k.moderationState, k.approvalStatus, k.adminStatus, k.listingStatus, k.visibility);
  if (str(direct)) return str(direct).toLowerCase();
  for (const [key, v] of Object.entries(k)) if (/moderat|review|approv/i.test(key) && typeof v === 'string' && v) return v.toLowerCase();
  if (k.isApproved === false || k.approved === false) return 'pending';
  if (k.isApproved === true || k.approved === true) return 'live';
  if (k.isHidden === true || k.hidden === true) return 'hidden';
  return '';
}
const camp = k => ({
  id: str(k.id), title: str(pick(k.title, k.name, 'Untitled campaign')),
  review: reviewOf(k), lifecycle: str(k.status).toLowerCase(),
  status: reviewOf(k) || str(k.status).toLowerCase(),
  brand: nameOf(pick(k.brand, k.brandName, k.owner)), brandId: idOf(pick(k.brand, k.brandId)), platform: str(k.platform),
  budgetMin: pick(k.budgetMin, k.budget && k.budget.min), budgetMax: pick(k.budgetMax, k.budget && k.budget.max, k.budget),
  bids: num(pick(k.bidCount, k.bids && typeof k.bids === 'number' ? k.bids : null, k.bidsSummary && k.bidsSummary.count)) || 0,
  closesAt: str(k.closesAt), createdAt: str(pick(k.submittedAt, k.createdAt)), flags: num(pick(k.flagCount, k.reportCount)) || 0
});
/* waiting for an admin decision, whatever the backend calls it */
const isPending = s => /pending|review|submitted|awaiting|queued/.test(s);
const budget = c => (c.budgetMin != null && c.budgetMax != null && c.budgetMin !== c.budgetMax ? `${inr(c.budgetMin)} to ${inr(c.budgetMax)}` : c.budgetMax != null ? inr(c.budgetMax) : c.budgetMin != null ? inr(c.budgetMin) : '—');

function TabCampaigns() {
  const box = useRef(null);
  const rerender = useRerender();
  const u = ui();
  const p = usePaged(api.campaigns, { filter: u.filter });
  useStagger(box, '.adm-row', [p.loading, u.filter]);
  const rows = p.rows.map(camp);
  const counts = (p.meta && p.meta.counts) || {};
  /* decide straight from the queue; the brief leaves the "To review" list once decided */
  const quick = (c, action) => () => decide(action === 'approve'
    ? { title: `Approve “${c.title}”?`, confirm: 'Approve', toast: 'Campaign approved', intro: 'It goes live and creators can bid on it.', fields: [],
        run: b => api.campaignAction(c.id, 'approve', b), done: () => { refreshCounts(); u.filter === 'pending' ? p.drop(c.id) : p.reload(); } }
    : { title: `Reject “${c.title}”?`, confirm: 'Reject', tone: 'danger', toast: 'Campaign rejected',
        fields: [reason(4, 'Reason', 'Shown to the brand. At least 4 characters.'), { k: 'ruleBroken', label: 'Rule broken', type: 'select', options: RULES }],
        run: b => api.campaignAction(c.id, 'reject', b), done: () => { refreshCounts(); u.filter === 'pending' ? p.drop(c.id) : p.reload(); } });
  return (
    <div className="stack" ref={box}>
      <Seg label="Show" value={u.filter} onChange={v => { u.filter = v; rerender(); }} opts={[['pending', 'To review'], ['flagged', 'Flagged'], ['live', 'Live'], ['hidden', 'Hidden'], ['rejected', 'Rejected'], ['removed', 'Removed'], ['all', 'All']].map(([k, t]) => [k, t, num(counts[k]) ?? undefined])} />
      <RoleNote area="campaigns" doing="Moderating campaigns" />
      {p.err ? <Failed err={p.err} retry={p.reload} what="Campaigns" /> : p.loading ? <Loading what="campaigns" />
        : rows.length ? <ul className="adm-list no-anchor">{rows.map(c => <Fragment key={c.id}><Row href={`#campaign-${c.id}`} kind="brand" title={c.title}
            sub={[c.brand || 'Brand not given', plat(c.platform), c.createdAt ? `Sent ${when(c.createdAt)}` : ''].filter(Boolean).join(' · ')}
            pills={<><Status s={c.status} />{c.flags ? <span className="pill pill-err"><Icon n="flag" />{c.flags}</span> : null}<span className="pill pill-line">{`${c.bids} bid${c.bids === 1 ? '' : 's'}`}</span></>}
            right={budget(c)} />
            {u.filter === 'pending' || isPending(c.review) ? <li className="adm-acts mk-quick" aria-label={`Decide on ${c.title}`}>
              <ActBtn area="campaigns" ic="check" tone="p" onClick={quick(c, 'approve')}>Approve</ActBtn>
              <ActBtn area="campaigns" ic="close" onClick={quick(c, 'reject')}>Reject</ActBtn>
              <a className="btn-q" href={`#campaign-${c.id}`}>Review details</a>
            </li> : null}</Fragment>)}</ul>
        : <Empty title={u.filter === 'pending' ? 'No campaigns waiting for review.' : 'No campaigns here.'} text="New campaigns show up when brands post them." />}
      <More p={p} />
    </div>
  );
}

const RULES = [['', 'Pick a rule (optional)'], ['prohibited_content', 'Prohibited content'], ['misleading', 'Misleading claims'], ['off_platform_payment', 'Off-platform payment'], ['unrealistic_budget', 'Unrealistic budget'], ['spam', 'Spam or duplicate'], ['ip_violation', 'IP violation'], ['other', 'Other']];
function CampaignDetail({ id }) {
  const root = useRef(null);
  const r = useLoad(() => api.campaign(id), [id]);
  useStagger(root, '.adm-card', [!!r.data]);
  const back = <a className="btn-q adm-back" href="#marketplace-campaigns"><Icon n="back" />Campaigns</a>;
  if (r.err) return <div className="view-in adm">{back}<Failed err={r.err} retry={r.reload} what="This campaign" /></div>;
  if (!r.data) return <div className="view-in">{back}<Loading what="this campaign" /></div>;
  const d = r.data, c = camp(d);
  document.title = c.title + ' · Linkloom';
  const after = () => { refreshCounts(); r.reload(); };
  const act = (action, t, o = {}) => () => decide({
    title: t, confirm: o.confirm || label(action), tone: o.tone, toast: o.toast || 'Done', intro: o.intro,
    fields: o.fields || [reason(4)], run: b => api.campaignAction(c.id, action, b), done: after
  });
  /* Which actions apply. When the record names no review state, every action is offered: hiding a decision because
     the field is missing is what left admins with only "Remove". The backend refuses any action that does not apply. */
  const rv = c.review, known = !!rv;
  const isLive = /^(live|approved|published|active|visible)$/.test(rv), isOff = /hidden|removed|rejected/.test(rv), isRemoved = /removed/.test(rv);
  const show = {
    approve: !known || isPending(rv) || /flagged|hidden|rejected/.test(rv),
    reject: !known || (!isOff && !isRemoved),
    hide: !known || (!isOff && !isRemoved),
    remove: !isRemoved,
    restore: !known || isOff
  };
  const signals = arr(pick(d.signals, d.briefSignals)), changed = d.changedFields;
  return (
    <div className="view-in adm" ref={root}>
      {back}
      <header className="adm-mast">
        <div className="adm-mast-t"><p className="row wrap">{known ? <Status s={rv} text={`Review: ${label(rv)}`} /> : <span className="pill pill-warn">Review state not sent</span>}{c.lifecycle ? <Status s={c.lifecycle} text={`Brief: ${label(c.lifecycle)}`} /> : null}{c.platform ? <span className="pill pill-line"><Glyph p={c.platform} />{plat(c.platform)}</span> : null}</p>
          <h1 className="t-h1">{c.title}</h1>
          <p className="muted">{c.brand ? <Who kind="b" name={c.brand} sub="Brand" href={c.brandId ? `#brand-${c.brandId}` : ''} /> : 'Brand not given'}</p></div>
        <dl className="adm-band" style={{ flex: '1 1 320px' }}><div><dt>Budget</dt><dd>{budget(c)}</dd></div><div><dt>Bids</dt><dd>{c.bids}</dd></div>{c.closesAt ? <div><dt>Closes</dt><dd>{L.fmtDate(c.closesAt)}</dd></div> : null}</dl>
      </header>
      <div className="adm-grid">
        <div className="adm-col">
          {signals.length ? <section className="card adm-card"><h2 className="t-h3">Brief signals</h2><ul className="stack">{signals.map((s, i) => {
            const o = s && typeof s === 'object' ? s : { label: String(s) };
            const sev = str(pick(o.severity, o.level, o.status)).toLowerCase(), tone = /high|block|err|fail|critical/.test(sev) ? 'err' : /low|ok|info/.test(sev) ? 'ok' : 'warn';
            return <li className={`adm-check is-${tone}`} key={i}><Icon n={tone === 'ok' ? 'info' : 'alert'} /><span><b>{str(pick(o.label, o.name, o.code, o.type, 'Signal'))}</b>{str(pick(o.message, o.detail, o.reason, sev))}</span></li>;
          })}</ul></section> : null}
          {changed && (Array.isArray(changed) ? changed.length : Object.keys(changed).length) ? <section className="card adm-card"><h2 className="t-h3">Changed since last review</h2>
            {Array.isArray(changed) ? (changed.some(x => x && typeof x === 'object') ? <Table rows={changed} /> : <p>{changed.map(x => label(x)).join(', ')}</p>) : <Table rows={Object.entries(changed).map(([field, v]) => ({ field: label(field), ...(v && typeof v === 'object' ? v : { value: v }) }))} />}</section> : null}
          <section className="card adm-card"><h2 className="t-h3">Campaign</h2><Fields obj={d} skip={['id', 'signals', 'changedFields', 'bidsSummary']} /></section>
          <Lists obj={d} skip={['signals', 'changedFields']} />
        </div>
        <div className="adm-col">
          {d.bidsSummary && typeof d.bidsSummary === 'object' ? <section className="card adm-card"><h2 className="t-h3">Bids summary</h2><Fields obj={d.bidsSummary} /></section> : null}
          <section className="card adm-card"><h2 className="t-h3">Moderation</h2>
            <RoleNote area="campaigns" doing="Moderating campaigns" />
            <p className="muted">{isPending(rv) ? 'This brief is waiting for your decision. Approve it to put it live for creators, or reject it with a reason the brand will see.'
              : isLive ? 'This brief is live. Creators can see it and bid.'
              : isOff ? `This brief is ${label(rv).toLowerCase()}. Creators cannot see it.`
              : known ? `Review state: ${label(rv)}.` : 'The API did not say whether this brief has been reviewed, so every action is offered.'}</p>
            <div className="adm-acts">
              {show.approve ? <ActBtn area="campaigns" ic="check" tone="p" onClick={act('approve', 'Approve this campaign?', { fields: [], intro: 'It goes live and creators can bid on it.', toast: 'Campaign approved' })}>Approve</ActBtn> : null}
              {show.reject ? <ActBtn area="campaigns" ic="close" onClick={act('reject', 'Reject this campaign?', { tone: 'danger', toast: 'Campaign rejected', fields: [reason(4, 'Reason', 'Shown to the brand. At least 4 characters.'), { k: 'ruleBroken', label: 'Rule broken', type: 'select', options: RULES }] })}>Reject</ActBtn> : null}
              {show.hide ? <ActBtn area="campaigns" ic="eye" onClick={act('hide', 'Hide this campaign?', { toast: 'Campaign hidden', intro: 'Creators stop seeing it; the brand keeps it.' })}>Hide</ActBtn> : null}
              {show.restore ? <ActBtn area="campaigns" ic="refund" onClick={act('restore', 'Restore this campaign?', { toast: 'Campaign restored' })}>Restore</ActBtn> : null}
              {show.remove ? <ActBtn area="campaigns" ic="trash" onClick={act('remove', 'Remove this campaign?', { tone: 'danger', toast: 'Campaign removed' })}>Remove</ActBtn> : null}
            </div></section>
        </div>
      </div>
    </div>
  );
}

/* ----- bid alerts ----- */
function TabBids() {
  const box = useRef(null);
  const p = usePaged(api.bidAlerts, {});
  useStagger(box, '.adm-card', [p.loading]);
  const act = (a, action, t, tone) => () => decide({ title: t, confirm: label(action), tone, toast: 'Done', fields: [reason(4)], run: b => api.bidAlertAction(a.id, action, b), done: () => { refreshCounts(); p.drop(a.id); } });
  return (
    <div className="stack" ref={box}>
      <RoleNote area="moderation" doing="Acting on bid alerts" />
      {p.err ? <Failed err={p.err} retry={p.reload} what="Bid alerts" /> : p.loading ? <Loading what="bid alerts" />
        : p.rows.length ? p.rows.map(a => (
          <section className="card adm-card" key={a.id}>
            <div className="row between wrap"><h2 className="t-h3">{str(pick(a.title, a.pattern, a.type, a.kind, 'Bid alert'))}</h2><Status s={pick(a.status, a.severity)} /></div>
            <Fields obj={a} skip={['id']} /><Lists obj={a} />
            <div className="adm-acts">
              <ActBtn area="moderation" ic="lock" onClick={act(a, 'freeze-bids', 'Freeze these bids?', 'danger')}>Freeze bids</ActBtn>
              <ActBtn area="moderation" ic="users" onClick={act(a, 'suspend-accounts', 'Suspend the accounts involved?', 'danger')}>Suspend accounts</ActBtn>
              <ActBtn area="moderation" ic="alert" onClick={act(a, 'warn', 'Warn the accounts involved?')}>Warn</ActBtn>
              <ActBtn area="moderation" ic="close" onClick={act(a, 'dismiss', 'Dismiss this alert?')}>Dismiss</ActBtn>
            </div></section>))
        : <Empty title="No bid alerts." text="Unusual bidding patterns show up here." />}
      <More p={p} />
    </div>
  );
}

/* ----- reviews ----- */
function TabReviews() {
  const box = useRef(null);
  const rerender = useRerender();
  const u = ui();
  const p = usePaged(api.reviews, { status: u.rstatus });
  useStagger(box, '.adm-card', [p.loading, u.rstatus]);
  const del = rv => () => decide({ title: 'Delete this review?', confirm: 'Delete', tone: 'danger', toast: 'Review deleted', intro: "The creator's rating is recalculated.", fields: [reason(4)], run: b => api.reviewAction(rv.id, 'delete', b), done: () => { refreshCounts(); p.drop(rv.id); } });
  const keep = rv => async () => { try { await api.reviewAction(rv.id, 'keep', {}); L.toast('Review kept', 'check'); refreshCounts(); p.drop(rv.id); } catch (e) { L.toast(errText(e), 'alert'); } };
  return (
    <div className="stack" ref={box}>
      <Seg label="Status" value={u.rstatus} onChange={v => { u.rstatus = v; rerender(); }} opts={[['flagged', 'Flagged'], ['visible', 'Visible'], ['removed', 'Removed']]} />
      <RoleNote area="moderation" doing="Moderating reviews" />
      {p.err ? <Failed err={p.err} retry={p.reload} what="Reviews" /> : p.loading ? <Loading what="reviews" />
        : p.rows.length ? p.rows.map(rv => {
          const stars = num(pick(rv.stars, rv.rating)) || 0;
          return (
            <section className="card adm-card" key={rv.id}>
              <div className="row between wrap"><h2 className="t-h3">{`${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))} ${nameOf(pick(rv.brand, rv.author, rv.from)) || 'Brand'}`}</h2><Status s={pick(rv.status, u.rstatus)} /></div>
              <p>{str(pick(rv.text, rv.body, rv.comment))}</p>
              <p className="muted t-small">{[nameOf(rv.creator) && 'About ' + nameOf(rv.creator), str(pick(rv.flagReason, rv.reportReason)), when(rv.createdAt)].filter(Boolean).join(' · ')}</p>
              {u.rstatus !== 'removed' ? <div className="adm-acts"><ActBtn area="moderation" ic="trash" onClick={del(rv)}>Delete</ActBtn>{u.rstatus === 'flagged' ? <ActBtn area="moderation" ic="check" onClick={keep(rv)}>Keep</ActBtn> : null}</div> : null}
            </section>);
        }) : <Empty title={`No ${u.rstatus} reviews.`} />}
      <More p={p} />
    </div>
  );
}

/* ----- featured creators ----- */
function TabFeatured() {
  const r = useLoad(() => api.featured(), []);
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (r.data) setOrder(r.data.rows); }, [r.data]);
  if (r.err) return <Failed err={r.err} retry={r.reload} what="Featured creators" />;
  if (!order) return <Loading what="featured creators" />;
  const cid = c => str(pick(c.creatorId, c.creator && c.creator.id, c.id));
  const dirty = r.data && order.map(cid).join() !== r.data.rows.map(cid).join();
  const move = (i, d) => { const n = [...order]; [n[i], n[i + d]] = [n[i + d], n[i]]; setOrder(n); };
  const save = async () => { setBusy(true); try { await api.orderFeatured(order.map(cid)); L.toast('Featured order saved', 'check'); r.reload(); } catch (e) { L.toast(errText(e), 'alert'); } setBusy(false); };
  return (
    <div className="stack">
      <RoleNote area="catalog" doing="Reordering featured creators" />
      {order.length ? <ol className="adm-list">{order.map((c, i) => <li key={cid(c)}><div className="adm-row adm-order">
        <span className="adm-pos">{i + 1}</span><span className="avatar adm-av" aria-hidden="true">{L.initials(nameOf(c.creator || c))}</span>
        <span className="adm-row-t"><b>{nameOf(c.creator || c)}</b><span>{str(pick(c.handle, c.creator && c.creator.handle, c.city))}</span></span>
        <button className="ibtn" type="button" aria-label="Move up" disabled={!i || !can('catalog')} onClick={() => move(i, -1)}><Icon n="down" style={{ transform: 'rotate(180deg)' }} /></button>
        <button className="ibtn" type="button" aria-label="Move down" disabled={i === order.length - 1 || !can('catalog')} onClick={() => move(i, 1)}><Icon n="down" /></button>
        <a className="btn-q" href={`#creator-${cid(c)}`}>Open</a></div></li>)}</ol>
        : <Empty title="No featured creators." text="Feature a creator from their account page." />}
      {order.length ? <div className="row wrap"><Lq className="lq-p lq-sm" onClick={save} disabled={!dirty || busy || !can('catalog')}>{busy ? 'Saving…' : 'Save order'}</Lq>{dirty ? <button className="btn-q" type="button" onClick={() => setOrder(r.data.rows)}>Undo changes</button> : null}</div> : null}
    </div>
  );
}

/* ----- categories ----- */
function TabCategories() {
  const p = usePaged(api.categories, {});
  const cname = c => str(pick(c.name, c.label, c.title, c.slug));
  const add = () => decide({ title: 'New category', confirm: 'Create', toast: 'Category created', fields: [{ k: 'name', label: 'Name', required: true }, { k: 'slug', label: 'Slug', help: 'Leave empty to make one from the name.' }], run: b => api.addCategory(b), done: () => p.reload() });
  const edit = c => () => decide({ title: `Edit ${cname(c)}`, confirm: 'Save', toast: 'Category saved', fields: [{ k: 'name', label: 'Name', required: true, value: cname(c) }, { k: 'slug', label: 'Slug', value: str(c.slug) }], run: b => api.updateCategory(c.id, b), done: () => p.reload() });
  const merge = c => () => decide({
    title: `Merge ${cname(c)} into…`, confirm: 'Merge', tone: 'danger', toast: 'Categories merged', intro: 'Every creator in this category moves to the one you pick; this one goes away.',
    fields: [{ k: 'targetId', label: 'Merge into', type: 'select', required: true, options: [['', 'Pick a category'], ...p.rows.filter(x => x.id !== c.id).map(x => [str(x.id), cname(x)])] }],
    run: b => api.mergeCategory(c.id, b.targetId), done: () => p.reload()
  });
  return (
    <div className="stack">
      <div className="row between wrap"><RoleNote area="catalog" doing="Changing categories" /><ActBtn area="catalog" ic="plus" tone="p" onClick={add}>New category</ActBtn></div>
      {p.err ? <Failed err={p.err} retry={p.reload} what="Categories" /> : p.loading ? <Loading what="categories" />
        : p.rows.length ? <ul className="adm-list">{p.rows.map(c => <li key={c.id}><div className="adm-row">
          <span className="adm-row-t"><b>{cname(c)}</b><span>{[c.slug, num(pick(c.creatorCount, c.count)) != null ? `${num(pick(c.creatorCount, c.count))} creators` : ''].filter(Boolean).join(' · ')}</span></span>
          {c.active === false || c.isActive === false ? <Status s="hidden" text="Inactive" /> : null}
          <div className="adm-acts"><ActBtn area="catalog" ic="edit" onClick={edit(c)}>Edit</ActBtn><ActBtn area="catalog" ic="link" onClick={merge(c)}>Merge</ActBtn></div></div></li>)}</ul>
        : <Empty title="No categories yet." />}
      <More p={p} />
    </div>
  );
}
const PANES = { campaigns: TabCampaigns, bids: TabBids, reviews: TabReviews, featured: TabFeatured, categories: TabCategories };

function Marketplace({ param }) {
  const root = useRef(null);
  const tab = TABS.some(t => t[0] === param) ? param : 'campaigns';
  useStagger(root, '.mk-pane > *', []);
  const Pane = PANES[tab];
  return (
    <div className="view-in mk adm" ref={root}>
      <header className="mx-head"><div className="mx-head-t"><h1 className="t-h1">Marketplace</h1><p className="muted">Campaign moderation, bidding, reviews and what creators see first.</p></div></header>
      <nav className="chips mx-filter mk-tabs" aria-label="Marketplace sections">{TABS.map(([k, n]) => <a className="chip mk-tab" href={`#marketplace-${k}`} aria-current={k === tab ? 'page' : undefined} key={k}>{n}</a>)}</nav>
      <div className="mk-pane no-anchor" id="mkPane"><Pane key={tab} /></div>
    </div>
  );
}

L.register('marketplace', {
  title: p => (p && TABS.find(t => t[0] === p) ? TABS.find(t => t[0] === p)[1] + ' · Marketplace' : 'Marketplace'), nav: 'marketplace',
  Component: Marketplace
});
L.register('campaign', { title: 'Campaign', nav: 'marketplace', Component: ({ param }) => <CampaignDetail id={param} key={param} /> });
