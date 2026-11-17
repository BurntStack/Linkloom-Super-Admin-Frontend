/* Live data from the existing Linkloom API, for the parts of the console that have a public endpoint today:
   creators (GET /v1/creators/, GET /v1/creators/{id}/) and open campaigns (GET /v1/campaigns/).
   It is read only. Everything an admin does (verify, suspend, hide, approve, release) needs the /v1/admin/
   endpoints, which do not exist yet, so the rest of the console still runs on sample data.
   Turn it off with VITE_LIVE_API=off. */
import { data, store } from './core.js';
import { get, list, paise } from './api.js';

export const LIVE = import.meta.env.VITE_LIVE_API !== 'off';
const TIMEOUT = 45000;                                   // the server sleeps when idle and can take a while to wake

const state = data.live = { status: 'idle', creators: [], campaigns: [], error: '' };
export const live = () => state;

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const handleOf = c => (c.instagram ? '@' + c.instagram : c.youtube ? '@' + c.youtube : '');

export function mapCreator(c) {
  const pf = c.platforms && typeof c.platforms === 'object' ? c.platforms : {};
  const main = pf[c.primaryPlatform] || {};
  const followers = num(c.followerCount) ?? Object.values(pf).map(p => num(p && p.followersCount)).filter(v => v != null).sort((a, b) => b - a)[0] ?? null;
  return {
    id: String(c.id), live: true,
    name: c.displayName || 'Creator', handle: handleOf(c), city: c.city || c.location || '—', region: c.region || '',
    verified: !!c.verified, followers, er: num(main.engagementRate), rating: num(c.rating), reviewCount: num(c.reviewCount) || 0,
    startingPrice: paise(c.startingPrice), tags: Array.isArray(c.categories) ? c.categories : [], languages: Array.isArray(c.languages) ? c.languages : [],
    bio: c.bio || '', primaryPlatform: c.primaryPlatform || '', repliesWithin: c.repliesWithin || '',
    platforms: Object.entries(pf).map(([k, p]) => ({ key: k, handle: (p && p.handle) || '', followers: num(p && p.followersCount), linked: !!(p && p.verified) })),
    packages: Array.isArray(c.packages) ? c.packages.map(p => ({ id: String(p.id), title: p.title || '', platform: p.platform || '', deliverables: p.deliverables || '', price: paise(p.price), deliveryDays: num(p.deliveryDays) })) : null
  };
}
export function mapCampaign(k) {
  return {
    id: String(k.id), live: true, title: k.title || 'Untitled campaign', platform: k.platform || '', deliverables: k.deliverables || '',
    budgetMin: paise(k.budgetMin), budgetMax: paise(k.budgetMax), closesAt: k.closesAt || '', postedAt: k.createdAt || '',
    status: k.status || '', bids: num(k.bidCount) || 0, brandName: (k.brand && (k.brand.name || k.brand.brandName)) || '', brief: k.brief || ''
  };
}

const timed = () => { const c = new AbortController(); const t = setTimeout(() => c.abort(), TIMEOUT); return { signal: c.signal, done: () => clearTimeout(t) }; };

async function load() {
  const t = timed();
  try {
    const [creators, campaigns] = await Promise.all([list('/v1/creators/', { signal: t.signal }), list('/v1/campaigns/', { signal: t.signal })]);
    store.set(() => { state.creators = creators.map(mapCreator); state.campaigns = campaigns.map(mapCampaign); state.status = 'ready'; state.error = ''; }, 'live');
  } catch (e) {
    store.set(() => { state.status = 'failed'; state.error = (e && e.message) || 'Could not reach the Linkloom API.'; }, 'live');
  } finally { t.done(); }
}

/* Start loading once; screens call this when they mount and re-render on the store's 'live' event. */
export function ensureLive() { if (LIVE && state.status === 'idle') { state.status = 'loading'; load(); } }
export function retryLive() { if (LIVE && state.status !== 'loading') { store.set(() => { state.status = 'loading'; }, 'live'); load(); } }

/* One creator's public profile, with packages. */
export async function fetchCreator(id) {
  const t = timed();
  try { return mapCreator(await get(`/v1/creators/${encodeURIComponent(id)}/`, { signal: t.signal })); }
  finally { t.done(); }
}
