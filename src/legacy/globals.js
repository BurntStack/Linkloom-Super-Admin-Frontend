/* Bridge for screens that have not been converted to components yet: they read the runtime from window. */
import L, { data } from '../lib/core.js';
window.LLD = L;
window.LLD_DATA = data;
