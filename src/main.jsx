import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import './styles/core.css';
import './styles/motion.css';
import './styles/screens/auth.css';
import './styles/screens/home.css';
import './styles/screens/security.css';
import './styles/screens/audit.css';
import './styles/screens/verify.css';
import './styles/screens/accounts.css';
import './styles/screens/marketplace.css';
import './styles/screens/moderation.css';
import './styles/screens/orders.css';
import './styles/screens/finance.css';
import './styles/shell.css';

import L, { data } from './lib/core.js';
import { auth, signedInLive } from './lib/api.js';
import { ensureVerifications } from './lib/live.js';
import './lib/ui-select.js';
import './lib/motion.js';
import './screens/index.js';
import App from './App.jsx';

/* signed in only while this tab holds a real admin token; the API checks it on the first call */
if (signedInLive()) {
  const u = auth().user;
  data.session.signedIn = true; data.session.live = true;
  data.me = { id: String(u.id || ''), name: u.fullName || u.displayName || u.email || 'Admin', email: u.email || '', role: 'Admin' };
}

const root = createRoot(document.getElementById('root'));
if (data.session.live) ensureVerifications();
L.boot();
flushSync(() => root.render(<App />));
