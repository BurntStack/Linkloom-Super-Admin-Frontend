/* The console's starting state. It holds no records of its own: everything shown comes from the Linkloom API
   (src/lib/api.js, src/lib/live.js) and is kept under `live`. `me` is filled from the signed-in admin's account. */
const data = {
  session: { signedIn: false, live: false, since: null },
  me: { id: '', name: '', email: '', role: '' },
  ui: {}
};

export default data;
