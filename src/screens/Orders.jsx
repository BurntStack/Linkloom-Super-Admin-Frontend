/* Orders and escrow (#orders). Every order, where its money is, and dispute arbitration.
   Not connected: the backend has no admin endpoints for orders, disputes or escrow yet
   (see the backend requirements doc, Orders and escrow). */
import L from '../lib/core.js';
import NotConnected from '../components/NotConnected.jsx';

const Orders = () => <NotConnected title="Orders & escrow" what="Orders and escrow" needs={['GET /v1/admin/orders/', 'GET /v1/admin/disputes/', 'POST /v1/admin/orders/{id}/force-release/', 'POST /v1/admin/orders/{id}/refund/']} />;

L.register('orders', { title: 'Orders & escrow', nav: 'orders', Component: Orders });
