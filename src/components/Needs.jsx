/* Wraps a screen: loads the admin API data it needs (lib/admin.js), shows a loading or error state until it is there,
   then renders the screen. Re-renders the screen whenever loaded data changes. */
import { useEffect } from 'react';
import { store } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { ensure, retry, state } from '../lib/admin.js';
import Lq from './Lq.jsx';

const LABEL = { creators: 'creators', brands: 'brands', verifications: 'verification queue', reports: 'abuse reports', bidAlerts: 'bid alerts', reviews: 'reviews', campaigns: 'campaigns',
  categories: 'categories', featured: 'featured creators', orders: 'orders', disputes: 'disputes', payouts: 'payouts', rules: 'platform rules', summary: 'financial summary', audit: 'audit log',
  dashboard: 'dashboard', counts: 'counts', notifications: 'notifications' };

export function Waiting({ title = 'Loading from Linkloom', text = 'The server can take up to a minute to wake up.' }) {
  return <div className="view-in"><div className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" /><p className="t-h3">{title}</p><p className="muted">{text}</p></div></div>;
}
export function Failed({ keys, errs }) {
  return (
    <div className="view-in"><div className="empty"><img src="assets/step-04-orbit.svg" width="160" height="117" alt="" />
      <p className="t-h3">{`The ${keys.map(k => LABEL[k] || k).join(', ')} did not load.`}</p>
      <p className="muted">{errs[0]}</p><Lq className="lq-s lq-sm" onClick={() => retry(keys)}>Try again</Lq></div></div>
  );
}
/* keys: must load before the screen shows. soft: loaded too, but the screen shows without them */
export default function needs(keys, Screen, soft = []) {
  return function Gated(props) {
    const rerender = useRerender();
    useEffect(() => { ensure([...keys, ...soft]); return store.on(why => { if (why === 'live') rerender(); }); }, []);
    const st = keys.map(k => [k, state(k)]);
    if (st.some(([, r]) => !r.loaded && (r.status === 'loading' || r.status === 'idle'))) return <Waiting />;
    const bad = st.filter(([, r]) => !r.loaded && r.status === 'failed');
    if (bad.length) return <Failed keys={bad.map(x => x[0])} errs={bad.map(x => x[1].error)} />;
    const denied = [...keys, ...soft].filter(k => state(k).status === 'forbidden');
    return <>
      {denied.length ? <p className="needs-note muted" role="status">{`Your admin role cannot see the ${denied.map(k => LABEL[k] || k).join(', ')}, so they are left out here.`}</p> : null}
      <Screen {...props} />
    </>;
  };
}
