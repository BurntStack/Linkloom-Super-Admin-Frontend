/* Small display helpers for the Marketplace screen: people chips, pills, platform names.
   Creators read coral, brands violet. Money is integer paise. */
import L from './core.js';
import Icon from '../components/Icon.jsx';

export const mo = (fn, ...a) => { try { return (L.motion[fn] && L.motion[fn](...a)) || null; } catch (e) { return null; } };
export const plat = p => (p === 'youtube' ? 'YouTube' : p === 'instagram' ? 'Instagram' : p ? p.charAt(0).toUpperCase() + p.slice(1) : '—');
export const Glyph = ({ p }) => <Icon n={p === 'youtube' ? 'yt' : 'ig'} />;
export const plural = (n, a, b) => `${n} ${n === 1 ? a : (b || a + 's')}`;

/* people: creators coral, brands violet, unknown accounts a quiet outline */
export function Who({ kind, name, sub = '', href = '' }) {
  const inner = <><span className={`avatar mx-av is-${kind}`} aria-hidden="true">{L.initials(name)}</span><span className="mx-who-t"><b>{name}</b>{sub ? <span>{sub}</span> : null}</span></>;
  return href ? <a className={`mx-who is-${kind}`} href={href}>{inner}</a> : <span className={`mx-who is-${kind}`}>{inner}</span>;
}
export const Pill = ({ cls, icon, label }) => <span className={`pill ${cls}`}>{icon ? <Icon n={icon} /> : null}{label}</span>;
