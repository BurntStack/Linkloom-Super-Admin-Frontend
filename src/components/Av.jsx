import { useState } from 'react';
import L from '../lib/core.js';

/* The photo or logo link an API record carries (creators: avatarUrl, brands: logoUrl), or ''. */
export const photoOf = r => {
  if (!r || typeof r !== 'object') return '';
  const u = r.user && typeof r.user === 'object' ? r.user : {};
  const v = [r.avatarUrl, r.avatar_url, r.logoUrl, r.logo_url, r.photoUrl, r.avatar, r.logo, r.image, r.photo, u.avatarUrl, u.avatar]
    .find(x => typeof x === 'string' && /^(https?:|data:image\/)/.test(x));
  return v || '';
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
