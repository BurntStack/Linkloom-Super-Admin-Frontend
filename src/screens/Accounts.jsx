/* Accounts (#accounts, #creator-<id>, #brand-<id>).
   Creators come from GET /v1/creators/ and each profile from GET /v1/creators/{id}/, with its reviews. Read only: the
   backend has no admin endpoints for accounts yet (suspend, badges, tags, featured), and none that lists brands, so
   the Brands tab and brand pages say they are not connected. Classes are .acc-*. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import L, { data, store } from '../lib/core.js';
import { mo } from '../lib/mo.js';
import { useRerender } from '../lib/hooks.js';
import { live, ensureLive, retryLive, fetchCreator, fetchReviews } from '../lib/live.js';
import Av from '../components/Av.jsx';
import Icon from '../components/Icon.jsx';
import Lq from '../components/Lq.jsx';
import NotConnected, { NotConnectedNote } from '../components/NotConnected.jsx';

const ui = () => (data.ui.accounts = data.ui.accounts || { tab: 'creator', q: '', f: [] });
const None = ({ t = 'Not provided' }) => <span className="muted">{t}</span>;
const BRAND_NEEDS = ['GET /v1/admin/brands/', 'GET /v1/admin/brands/{id}/'];

/* ---------- list ---------- */
/* the public API says whether a creator is verified; it has no badges, reports or suspension status */
const QF = [['ver', 'Verified', c => c.verified], ['unv', 'Not verified', c => !c.verified]];
const Row = ({ c }) => (
  <li><a className="acc-row" href={`#creator-${c.id}`}>
    <Av kind="creator" name={c.name} />
    <span className="acc-id"><b>{c.name}</b><span>{(c.handle ? c.handle + ' · ' : '') + c.city}</span></span>
    <span className="acc-tags">{c.tags.slice(0, 2).map(t => <span className="pill pill-line" key={t}>{t}</span>)}</span>
    <span className="acc-n"><b className="t-money">{c.followers ? L.compact(c.followers) : '—'}</b><span>followers</span></span>
    <span className="acc-k">{c.verified ? <span className="pill pill-ok"><Icon n="check" />Verified</span> : <span className="pill pill-paper"><Icon n="minus" />Not verified</span>}</span>
    <span className="acc-s"></span><span className="acc-go"><Icon n="chevron" /></span></a></li>
);

function List() {
  const root = useRef(null), search = useRef(null);
  const rerender = useRerender();
  const u = ui(), lv = live();
  const isCreators = u.tab === 'creator';
  const ready = lv.status === 'ready', loading = lv.status === 'loading' || lv.status === 'idle', failed = lv.status === 'failed';
  useEffect(() => { ensureLive(); return store.on(why => { if (why === 'live') rerender(); }); }, []);
  useLayoutEffect(() => { mo('stagger', [...root.current.querySelectorAll('.acc-row')]); }, [lv.status, u.tab]);

  const q = u.q.trim().toLowerCase();
  const fs = QF.filter(([k]) => u.f.includes(k));
  const rows = ready ? lv.creators.filter(a => fs.every(([, , fn]) => fn(a)) && (!q || [a.name, a.handle, a.city].some(x => x && String(x).toLowerCase().includes(q)))) : [];
  const dirty = u.q || fs.length;

  const set = fn => () => { fn(); flushSync(rerender); };
  const setTab = k => set(() => { u.tab = k; });
  const toggle = k => set(() => { u.f = u.f.includes(k) ? u.f.filter(x => x !== k) : [...u.f, k]; });
  const clear = set(() => { u.q = ''; u.f = []; search.current.value = ''; });

  return (
    <div className="view-in acc" ref={root}>
      <header className="page-h acc-head">
        <div className="t"><p className="t-eyebrow">Accounts</p><h1 className="t-h1">People and brands on Linkloom</h1>
          <p className="muted">{ready ? `${lv.creators.length} creator${lv.creators.length === 1 ? '' : 's'} on Linkloom. Read only for now.` : 'Creators and brands on Linkloom.'}</p></div>
        {isCreators ? <div className="acc-search"><Icon n="search" /><label className="sr-only" htmlFor="accQ">Search creators</label>
          <input className="input" id="accQ" type="search" autoComplete="off" spellCheck="false" placeholder="Name, @handle or city" defaultValue={u.q} ref={search} onInput={e => { u.q = e.currentTarget.value; rerender(); }} /></div> : null}
      </header>
      <div className="acc-bar">
        <div className="seg acc-seg" role="group" aria-label="Account type">
          <button type="button" data-tab="creator" aria-pressed={isCreators} onClick={setTab('creator')}><i className="dot acc-dot-c"></i>Creators</button>
          <button type="button" data-tab="brand" aria-pressed={!isCreators} onClick={setTab('brand')}><i className="dot acc-dot-b"></i>Brands</button>
        </div>
        {isCreators ? <div className="chips acc-qf no-anchor" role="group" aria-label="Filters" id="accQf">{QF.map(([k, t]) => <button className="chip" type="button" data-f={k} aria-pressed={u.f.includes(k)} key={k} onClick={toggle(k)}>{t}</button>)}</div> : null}
      </div>
      {!isCreators ? <NotConnectedNote what="The brand list" needs={BRAND_NEEDS} /> : <>
        <div className="acc-count"><p id="accCount" aria-live="polite">{ready ? <><b>{rows.length}</b>{` of ${lv.creators.length} creators`}</> : loading ? 'Loading creators…' : 'Creators did not load.'}</p><button className="btn-q" type="button" data-clear="" hidden={!dirty || !ready} onClick={clear}>Clear filters</button></div>
        <ul className="acc-list no-anchor" id="accList">
          {loading ? <li className="empty"><p className="t-h3">Loading creators</p><p className="muted">The Linkloom server can take up to a minute to wake up.</p></li>
            : failed ? <li className="empty"><p className="t-h3">Creators did not load.</p><p className="muted">{lv.error}</p><Lq className="lq-s lq-sm" onClick={retryLive}>Try again</Lq></li>
            : rows.length ? rows.map(c => <Row c={c} key={c.id} />)
            : <li className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h3">{lv.creators.length ? 'No creators match' : 'No creators yet'}</p><p className="muted">{lv.creators.length ? 'Try another name, or clear the filters.' : 'Creators show up here once they sign up on Linkloom.'}</p></li>}
        </ul>
      </>}
    </div>
  );
}

const Missing = ({ kind }) => <div className="view-in"><div className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h2">{`No ${kind} with that link.`}</p><p className="muted">Search the accounts list instead.</p><Lq className="lq-p" data-go="#accounts">Accounts</Lq></div></div>;

/* ---------- creator detail: the public profile from GET /v1/creators/{id}/ and its reviews, read only ---------- */
const PLATFORM = { instagram: 'Instagram', youtube: 'YouTube' };
function LiveCreator({ id }) {
  const root = useRef(null);
  const rerender = useRerender();
  const [got, setGot] = useState({ c: null, done: false });
  const [revs, setRevs] = useState({ list: null, err: '' });
  useEffect(() => {
    ensureLive();
    let on = true;
    fetchCreator(id).then(c => on && setGot({ c, done: true }), () => on && setGot({ c: null, done: true }));
    fetchReviews(id).then(list => on && setRevs({ list, err: '' }), e => on && setRevs({ list: null, err: (e && e.message) || 'They did not load.' }));
    const off = store.on(why => { if (why === 'live') rerender(); });
    return () => { on = false; off(); };
  }, []);
  const lv = live(), c = got.c || lv.creators.find(x => x.id === id) || null;
  const shown = !!c;
  useEffect(() => { if (c) document.title = c.name + ' · Linkloom'; }, [c && c.name]);
  useLayoutEffect(() => { if (shown) mo('stagger', [...root.current.querySelectorAll('.acc-sec')]); }, [shown]);
  if (!c) {
    if (got.done && lv.status !== 'loading') return <Missing kind="creator" />;
    return <div className="view-in"><div className="empty"><p className="t-h2">Loading this creator</p><p className="muted">Asking the Linkloom API. The server can take up to a minute to wake up.</p></div></div>;
  }
  ui().tab = 'creator';
  const place = [c.city, c.region].filter((x, i, a) => x && x !== '—' && a.indexOf(x) === i).join(', ');
  return (
    <div className="view-in acc acc-d" ref={root}>
      <a className="btn-q acc-back" href="#accounts"><Icon n="back" />Accounts</a>
      <header className="acc-mast">
        <Av kind="creator" name={c.name} cls="acc-av" />
        <div className="acc-mast-t"><p className="acc-kind acc-kind--c"><i className="dot"></i>{'Creator' + (place ? ' · ' + place : '')}</p>
          <h1 className="t-h1">{c.name}</h1>
          <p className="acc-mast-m">{c.handle ? <span className="acc-handle">{c.handle}</span> : <span className="muted">No handle yet</span>}{c.verified ? <span className="pill pill-ok"><Icon n="check" />Verified</span> : <span className="pill pill-paper"><Icon n="minus" />Not verified</span>}</p></div>
      </header>
      <dl className="acc-band">
        <div><dt>Followers</dt><dd className="t-money">{c.followers ? L.compact(c.followers) : '—'}</dd><p>{c.followers ? 'across linked platforms' : 'not reported yet'}</p></div>
        <div><dt>Engagement</dt><dd className="t-money">{c.er != null ? c.er.toFixed(1) + '%' : '—'}</dd><p>{c.er != null ? 'average per post' : 'not reported yet'}</p></div>
        <div><dt>Rating</dt><dd className="t-money">{c.rating != null ? c.rating.toFixed(1) : '—'}</dd><p>{`${c.reviewCount} review${c.reviewCount === 1 ? '' : 's'}`}</p></div>
        <div><dt>Starting price</dt><dd className="t-money">{c.startingPrice != null ? L.inr(c.startingPrice) : '—'}</dd><p>{c.startingPrice != null ? 'lowest active package' : 'no active package'}</p></div>
      </dl>
      <div className="acc-grid">
        <div className="acc-col">
          <section className="acc-sec" aria-labelledby="accProf"><h2 className="t-h2" id="accProf">Public profile</h2>
            {c.bio ? <p className="muted">{c.bio}</p> : null}
            <dl className="acc-kv">
              <div><dt>Categories</dt><dd>{c.tags.length ? c.tags.join(', ') : <None t="None chosen" />}</dd></div>
              <div><dt>Languages</dt><dd>{c.languages.length ? c.languages.join(', ') : <None t="None listed" />}</dd></div>
              <div><dt>Main platform</dt><dd>{PLATFORM[c.primaryPlatform] || c.primaryPlatform || <None t="Not set" />}</dd></div>
              {c.platforms.map(p => <div key={p.key}><dt>{PLATFORM[p.key] || p.key}</dt><dd>{p.handle ? '@' + p.handle : <None t="No handle" />}{p.linked ? <span className="acc-m is-ok"><Icon n="check" />Linked by login</span> : <span className="acc-m is-warn"><Icon n="info" />Not linked by login</span>}</dd></div>)}
              <div><dt>Replies within</dt><dd>{c.repliesWithin || <None t="Not set" />}</dd></div>
            </dl>
          </section>
          <section className="acc-sec" aria-labelledby="accRev"><h2 className="t-h2" id="accRev">Reviews</h2>
            {revs.err ? <p className="muted">{`Reviews did not load: ${revs.err}`}</p>
              : revs.list == null ? <p className="muted">Loading reviews.</p>
              : revs.list.length ? <ul className="acc-reps">{revs.list.map((r, i) => <li key={r.id || i}><span className="acc-reps-t"><b>{`${'★'.repeat(r.stars)}${'☆'.repeat(Math.max(0, 5 - r.stars))} ${r.from}`}</b><span>{r.text + (r.at ? ' · ' + L.fmtDate(r.at) : '')}</span></span></li>)}</ul>
              : <p className="muted">No reviews yet.</p>}
          </section>
          <section className="acc-sec" aria-labelledby="accPkg"><h2 className="t-h2" id="accPkg">Packages</h2>
            {c.packages == null ? <p className="muted">Loading packages.</p>
              : c.packages.length ? <dl className="acc-kv">{c.packages.map(p => <div key={p.id}><dt>{p.title}</dt><dd>{[PLATFORM[p.platform] || p.platform, p.deliverables, p.deliveryDays != null ? `${p.deliveryDays} days` : '', p.price != null ? L.inr(p.price) : ''].filter(Boolean).join(' · ')}</dd></div>)}</dl>
              : <p className="muted">No active packages.</p>}
          </section>
        </div>
        <div className="acc-col acc-col--side">
          <section className="acc-sec acc-card" aria-labelledby="accAct"><h2 className="t-h3" id="accAct">Admin actions</h2>
            <p className="muted">Suspend, badges, tags, featured, password-reset help and device sign-out are not connected yet: the backend has no admin endpoints for them.</p>
            <p className="muted">Nothing on this page can be changed from here.</p>
          </section>
          <section className="acc-sec acc-card" aria-labelledby="accMiss"><h2 className="t-h3" id="accMiss">Not shown yet</h2>
            <p className="muted">KYC details are on the Verification desk. Orders and reports have no admin endpoint yet.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

const Brand = () => <NotConnected eyebrow="Accounts" title="Brand" what="Brand pages" needs={BRAND_NEEDS} />;

L.register('accounts', { title: 'Accounts', nav: 'accounts', Component: List });
L.register('creator', { title: id => (live().creators.find(c => c.id === id) || {}).name || 'Creator', nav: 'accounts', Component: ({ param }) => <LiveCreator id={param} /> });
L.register('brand', { title: 'Brand', nav: 'accounts', Component: Brand });
