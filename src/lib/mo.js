import L from './core.js';

/* Call a motion function by name; a missing function or an error never breaks the screen. */
export const mo = (k, ...a) => { const f = L.motion && L.motion[k]; if (typeof f === 'function') { try { return f(...a); } catch (e) {} } };
