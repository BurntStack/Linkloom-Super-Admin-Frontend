/* Audit log (#audit). Every admin action, with its reason, sealed in a hash chain.
   Not connected: the log has to live on the backend to mean anything, and there is no endpoint for it yet
   (see the backend requirements doc, Audit log). */
import L from '../lib/core.js';
import NotConnected from '../components/NotConnected.jsx';

const Audit = () => <NotConnected eyebrow="Platform financials & audit" title="Audit log" what="The audit log" needs={['GET /v1/admin/audit-log/', 'GET /v1/admin/audit-log/verify/']} />;

L.register('audit', { title: 'Audit log', nav: 'audit', Component: Audit });
