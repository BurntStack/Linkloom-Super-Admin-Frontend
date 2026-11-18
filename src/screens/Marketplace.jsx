/* Marketplace (#marketplace, #marketplace-<tab>).
   Campaigns come from GET /v1/campaigns/. Read only: approving, hiding or removing a campaign needs admin endpoints
   the backend does not have yet. Bid alerts, reviews, featured creators and categories have no endpoint at all, so
   those tabs say they are not connected. Creators read coral, brands violet. Money is integer paise. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import L, { store } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { live as liveData, ensureLive, retryLive } from '../lib/live.js';
import { mo, plat, plural, Glyph, Who, Pill } from '../lib/mx.jsx';
import Lq from '../components/Lq.jsx';
import { NotConnectedNote } from '../components/NotConnected.jsx';

const TABS = [['campaigns', 'Campaigns'], ['bids', 'Bids'], ['reviews', 'Reviews'], ['featured', 'Featured'], ['categories', 'Categories']];

/* ----- tab: campaigns ----- */
const budgetRange = c => (c.budgetMin != null && c.budgetMax != null && c.budgetMin !== c.budgetMax ? `${L.inr(c.budgetMin)} to ${L.inr(c.budgetMax)}` : c.budgetMax != null ? L.inr(c.budgetMax) : c.budgetMin != null ? L.inr(c.budgetMin) : '—');
function Campaigns({ list }) {
  const box = useRef(null);
  useLayoutEffect(() => { mo('stagger', L.$$('.mx-slip', box.current)); }, []);
  return (
    <div className="stack" ref={box}>
      <p className="mk-lede">Approving, hiding or removing a campaign is not connected yet: the backend has no admin endpoints for it.</p>
      <div className="mx-board">{list.length
        ? <section className="mx-group" aria-labelledby="mkgl"><h2 className="mx-gh" id="mkgl"><span className="t-h3">Open now</span><span className="mx-gn num">{list.length}</span></h2><div className="mx-list">{list.map(c => (
          <article className="mx-slip mk-camp is-live" data-id={c.id} aria-labelledby={`mkc-${c.id}`} key={c.id}>
            <div className="mx-stub"><p className="mx-stub-l">Budget, up to</p><p className="mx-price t-money">{c.budgetMax != null ? L.inr(c.budgetMax) : '—'}</p><p className="mx-stub-d">{c.postedAt ? `Posted ${L.fmtDate(c.postedAt)}` : ''}</p></div>
            <div className="mx-body">
              <div className="mx-top">{c.brandName ? <Who kind="b" name={c.brandName} sub="Brand" /> : <Who kind="x" name="Brand not given" sub="The API did not return it" />}<span className="row mk-pills"><Pill cls="pill-ok" icon="eye" label={c.status === 'open' ? 'Open' : c.status} /></span></div>
              <h3 className="mx-t" id={`mkc-${c.id}`}>{c.title}</h3>
              <dl className="mx-meta"><div><dt>Platform</dt><dd><span className="mx-plat-i"><Glyph p={c.platform} /></span>{plat(c.platform)}</dd></div><div><dt>Bids</dt><dd>{c.bids}</dd></div>{c.closesAt ? <div><dt>Closes</dt><dd>{L.fmtDate(c.closesAt)}</dd></div> : null}</dl>
              <p className="mx-note">{`Budget ${budgetRange(c)}` + (c.deliverables ? ` · Deliverables: ${c.deliverables}` : '')}</p>
              {c.brief ? <p className="mx-note">{c.brief}</p> : null}
            </div></article>))}</div></section>
        : <div className="empty"><p className="t-h2">No open campaigns.</p><p className="muted">New campaigns show up here once brands post them.</p></div>}</div>
    </div>
  );
}
function TabCampaigns() {
  const lv = liveData();
  if (lv.status === 'ready') return <Campaigns list={lv.campaigns} />;
  if (lv.status === 'failed') return <div className="empty"><p className="t-h2">Campaigns did not load.</p><p className="muted">{lv.error}</p><Lq className="lq-s lq-sm" onClick={retryLive}>Try again</Lq></div>;
  return <div className="empty"><p className="t-h2">Loading campaigns</p><p className="muted">The Linkloom server can take up to a minute to wake up.</p></div>;
}

/* ----- tabs with no endpoint yet ----- */
const TabBids = () => <NotConnectedNote what="Bid alerts" needs={['GET /v1/admin/bid-alerts/', 'POST /v1/admin/bid-alerts/{id}/freeze-bids/']} />;
const TabReviews = () => <NotConnectedNote what="Review moderation" needs={['GET /v1/admin/reviews/', 'POST /v1/admin/reviews/{id}/delete/']} />;
const TabFeatured = () => <NotConnectedNote what="Featured creators" needs={['GET /v1/admin/featured-creators/', 'PUT /v1/admin/featured-creators/order/']} />;
const TabCategories = () => <NotConnectedNote what="Categories" needs={['GET /v1/admin/categories/', 'POST /v1/admin/categories/']} />;
const PANES = { campaigns: TabCampaigns, bids: TabBids, reviews: TabReviews, featured: TabFeatured, categories: TabCategories };

function Marketplace({ param }) {
  const root = useRef(null);
  const rerender = useRerender();
  const tab = TABS.some(t => t[0] === param) ? param : 'campaigns';
  useEffect(() => { ensureLive(); return store.on(why => { if (why === 'live') rerender(); }); }, []);
  useLayoutEffect(() => { mo('stagger', [...root.current.querySelectorAll('.mk-pane > *')]); }, []);
  const lv = liveData();
  const summary = lv.status === 'ready' ? `${plural(lv.campaigns.length, 'open campaign')} on Linkloom.` : 'Campaigns on Linkloom.';
  const counts = { campaigns: lv.status === 'ready' ? lv.campaigns.length : 0 };
  const Pane = PANES[tab];
  return (
    <div className="view-in mk" ref={root}>
      <header className="mx-head"><div className="mx-head-t"><h1 className="t-h1">Marketplace</h1><p className="muted" id="mkSum">{summary}</p></div></header>
      <nav className="chips mx-filter mk-tabs" aria-label="Marketplace sections">{TABS.map(([k, n]) => <a className="chip mk-tab" href={`#marketplace-${k}`} aria-current={k === tab ? 'page' : undefined} key={k}>{n}{counts[k] ? <> <span className="mx-cn">{counts[k]}</span></> : null}</a>)}</nav>
      <div className="mk-pane no-anchor" id="mkPane"><Pane /></div>
    </div>
  );
}

L.register('marketplace', {
  title: p => (p && TABS.find(t => t[0] === p) ? TABS.find(t => t[0] === p)[1] + ' · Marketplace' : 'Marketplace'), nav: 'marketplace',
  Component: Marketplace
});
