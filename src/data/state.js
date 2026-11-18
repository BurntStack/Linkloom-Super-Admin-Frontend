/* The console's starting state. It holds no records: everything is loaded from the Linkloom admin API
   (src/lib/admin.js) after an admin signs in. Money is integer paise. */
const data = {
  session: { signedIn: false, live: false, since: null },
  me: { id: '', name: '', email: '', role: '', adminRole: '' },
  rules: { commissionPct: 0, gatewayPct: 0 },
  creators: [], brands: [], verifications: [], reports: [], campaigns: [], bidAlerts: [], reviews: [], categories: [], featuredOrder: [],
  orders: [], disputes: [], finance: { months: [], subscribers: { creators: 0, brands: 0 }, payouts: [] },
  audit: [], notifications: [], dashboard: null, counts: null,
  refs: { c: {}, b: {} }, res: {},
  ui: {}
};
export default data;
