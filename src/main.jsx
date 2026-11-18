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

import L, { data, store } from './lib/core.js';
import { auth, signedInLive } from './lib/api.js';
import { ensureVerifications } from './lib/live.js';
import './lib/ui-select.js';
import './lib/motion.js';
import './screens/index.js';
import App from './App.jsx';

/* secure console: start signed out unless this tab already passed password + MFA */
try { if (!sessionStorage.getItem('ll-admin-in')) data.session.signedIn = false; } catch (e) { data.session.signedIn = false; }
/* this tab is signed in to the real API: carry on as that admin (the token is checked on the first call) */
data.session.live = false;
if (import.meta.env.VITE_LIVE_API !== 'off' && signedInLive()) {
  const u = auth().user;
  data.session.signedIn = true; data.session.live = true; data.session.mfa = false;
  data.me = { ...data.me, name: u.fullName || u.displayName || u.email || 'Admin', email: u.email || '', role: 'Admin', photo: null };
}
store.on(() => { try { if (data.session.signedIn) sessionStorage.setItem('ll-admin-in', '1'); else sessionStorage.removeItem('ll-admin-in'); } catch (e) {} });

const root = createRoot(document.getElementById('root'));
if (data.session.live) ensureVerifications();
L.boot();
flushSync(() => root.render(<App />));
