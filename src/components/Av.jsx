import { useState } from 'react';
import L from '../lib/core.js';

/* A link the browser can load. The API may send full links, protocol-relative ones, or paths on its own server
   ("/media/avatars/x.jpg"); those go through the same /api proxy as every other call. */
const BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '');
export const mediaUrl = s => {
  s = typeof s === 'string' ? s.trim() : '';
  if (!s) return '';
  if (/^(https?:|data:image\/|blob:)/i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  if (s.startsWith('/') || /^(media|uploads?|static)\//i.test(s)) return BASE + (s.startsWith('/') ? s : '/' + s);
  return '';
};
const KEYS = new Set(['avatarurl', 'avatar', 'logourl', 'logo', 'photourl', 'photo', 'profilephoto', 'profilephotourl', 'profilepicture', 'profilepictureurl', 'profilepic',
  'profilepicurl', 'profileimage', 'profileimageurl', 'picture', 'pictureurl', 'image', 'imageurl', 'brandlogo', 'brandlogourl', 'companylogo', 'companylogourl', 'dp', 'displaypicture']);
const urlIn = x => mediaUrl(typeof x === 'string' ? x : x && typeof x === 'object' ? (x.url || x.src || x.secureUrl || x.downloadUrl || x.signedUrl || '') : '');
/* The photo or logo an API record carries (avatarUrl, logo_url, profilePicture, { url }...), on the record or its user/profile, or ''. */
export const photoOf = r => {
  if (!r || typeof r !== 'object') return '';
  for (const o of [r, r.user, r.profile, r.creator, r.brand, r.company, r.account]) {
    if (!o || typeof o !== 'object') continue;
    for (const [k, x] of Object.entries(o)) if (KEYS.has(k.replace(/[_-]/g, '').toLowerCase())) { const u = urlIn(x); if (u) return u; }
  }
  return '';
};

/* The photo over the initials: without a link, or when the image fails to load, the initials show. */
export function Photo({ src, children }) {
  const [bad, setBad] = useState('');
  if (!src || bad === src) return children;
  return <img className="av-ph" src={src} alt="" loading="lazy" decoding="async" onError={() => setBad(src)} />;
}

/* One-letter avatar: creators coral, brands violet (class `v`); the account's photo or logo when it has one. */
const Av = ({ kind, name, cls = '', src = '' }) => <span className={`avatar ${kind === 'brand' ? 'v' : ''} ${cls}`} aria-hidden="true"><Photo src={src}>{L.initials(name)}</Photo></span>;
export default Av;
