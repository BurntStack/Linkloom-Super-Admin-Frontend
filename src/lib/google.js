/* Google sign-in, the same way the Linkloom website does it: Google Identity Services gives the browser an ID token,
   and the console sends that token to the backend's POST /v1/auth/google/ (src/lib/api.js, googleLogin).
   The client ID is the website's own, so the backend already accepts its tokens. Its Google Cloud settings must list
   this console's address under "Authorised JavaScript origins", or Google refuses to show the button. */
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '591280470035-mamos86blk66gpr7bufpv48ln9dntsef.apps.googleusercontent.com';
const SRC = 'https://accounts.google.com/gsi/client';

export const googleEnabled = () => !!CLIENT_ID;

let loading = null, onToken = null;
function load(hostedDomain) {
  if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve(window.google);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => {
      const g = window.google;
      if (!g || !g.accounts || !g.accounts.id) { loading = null; reject(new Error('Google sign-in did not load.')); return; }
      g.accounts.id.initialize({
        client_id: CLIENT_ID, ...(hostedDomain ? { hd: hostedDomain } : {}),
        callback: r => { if (r && r.credential && onToken) onToken(r.credential); },
        ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true, itp_support: true
      });
      resolve(g);
    };
    s.onerror = () => { loading = null; reject(new Error('Google sign-in could not load. Check your connection, or sign in with your password.')); };
    document.head.appendChild(s);
  });
  return loading;
}

/* Draws Google's own button into `el`. onCredential gets the ID token; onError gets a message.
   Returns a function that detaches it. */
export function renderGoogleButton(el, { onCredential, onError, hostedDomain }) {
  let gone = false;
  onToken = token => { if (!gone) onCredential(token); };
  load(hostedDomain).then(g => {
    if (gone || !el.isConnected) return;
    const width = Math.max(200, Math.min(400, Math.round(el.getBoundingClientRect().width || 320)));
    g.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'left', width });
  }, e => { if (!gone) onError(e.message); });
  return () => { gone = true; onToken = null; el.textContent = ''; };
}

/* What the token says about the account, read without verifying it (the backend verifies it). Used only to turn away
   an address outside the admin domain before the token is sent, so no account is created for it. */
export function tokenEmail(idToken) {
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(decodeURIComponent(escape(atob(part.padEnd(part.length + (4 - part.length % 4) % 4, '=')))));
    return { email: String(claims.email || '').toLowerCase(), verified: claims.email_verified !== false };
  } catch (e) { return { email: '', verified: false }; }
}
