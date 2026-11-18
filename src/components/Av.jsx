import L from '../lib/core.js';

/* One-letter avatar: creators coral, brands violet (class `v`). */
const Av = ({ kind, name, cls = '' }) => <span className={`avatar ${kind === 'brand' ? 'v' : ''} ${cls}`} aria-hidden="true">{L.initials(name)}</span>;
export default Av;
