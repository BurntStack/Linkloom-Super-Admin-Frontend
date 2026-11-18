/* Moderation (#moderation). Reported profiles, messages, files, reviews and campaigns.
   Not connected: the backend has no endpoint for reports yet (see the backend requirements doc, Moderation). */
import L from '../lib/core.js';
import NotConnected from '../components/NotConnected.jsx';

const Moderation = () => <NotConnected title="Moderation" what="Moderation" needs={['POST /v1/abuse-reports/', 'GET /v1/admin/abuse-reports/', 'POST /v1/admin/abuse-reports/{id}/remove/']} />;

L.register('moderation', { title: 'Moderation', nav: 'moderation', Component: Moderation });
