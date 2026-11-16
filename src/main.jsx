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
import './legacy/globals.js';
import './lib/ui-select.js';
import './lib/motion.js';
import './screens/index.js';
import App from './App.jsx';

/* secure console: start signed out unless this tab already passed password + MFA */
try { if (!sessionStorage.getItem('ll-admin-in')) data.session.signedIn = false; } catch (e) { data.session.signedIn = false; }
store.on(() => { try { if (data.session.signedIn) sessionStorage.setItem('ll-admin-in', '1'); else sessionStorage.removeItem('ll-admin-in'); } catch (e) {} });

const root = createRoot(document.getElementById('root'));
L.boot();
flushSync(() => root.render(<App />));
