/* Financials (#finance). Revenue, escrow volume, commission, gateway cost and payouts.
   Not connected: the backend has no finance or payout endpoints for admins yet
   (see the backend requirements doc, Dashboard, alerts and financials). */
import L from '../lib/core.js';
import NotConnected from '../components/NotConnected.jsx';

const Finance = () => <NotConnected title="Financials" what="Financials" needs={['GET /v1/admin/finance/summary/', 'GET /v1/admin/payouts/', 'GET /v1/admin/payouts/export/']} />;

L.register('finance', { title: 'Financials', nav: 'finance', Component: Finance });
