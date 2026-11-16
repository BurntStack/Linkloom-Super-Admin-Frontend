/* Linkloom Super Admin: sample data. Money is integer paise. Today is 4 Nov 2026, 10:42 IST (LLD.today()).
   Same sample world as the creator app (Ananya Iyer) and the brand app (Mirevo Skincare, Meera Kapoor); the new
   accounts from sign-up (Priya Shah, creator; Rohan Mehta of Salt & Soil Foods, brand) wait in the verification desk.
   Business model: subscriptions. Commission rate is 0% (no per-deal fee); the payment-gateway fee is a platform cost. */
const data = {
  session: { signedIn: true, mfa: true, since: '2026-11-04T09:58:00+05:30' },
  me: { name: 'Kavya Menon', role: 'Super admin', email: 'kavya@linkloom.in', city: 'Bengaluru', photo: null },
  rules: { commissionPct: 0, gatewayPct: 2, gatewayNote: 'Gateway fee is paid by Linkloom, never by brands or creators.' },

  /* ---------- accounts ---------- */
  creators: [
    { id: 'cr1', name: 'Ananya Iyer', handle: '@ananyamakes', city: 'Mumbai', status: 'active', kyc: 'action_needed', joined: '2026-01-12', followers: 220000, er: 6.5, rating: 4.9, jobs: 14, earned: 7400000, badges: ['Verified Pro'], tags: ['Skincare', 'Beauty', 'Lifestyle'], featured: true, reports: 0, lastActive: '2026-11-04T09:15:00+05:30' },
    { id: 'cr2', name: 'Kabir Sethi', handle: '@kabirskin', city: 'New Delhi', status: 'active', kyc: 'verified', joined: '2025-11-02', followers: 340000, er: 4.1, rating: 4.7, jobs: 21, earned: 52000000, badges: ['Verified Pro'], tags: ['Skincare', 'Grooming'], featured: true, reports: 0, lastActive: '2026-11-03T22:10:00+05:30' },
    { id: 'cr3', name: 'Riya Thomas', handle: '@riyaglows', city: 'Kochi', status: 'active', kyc: 'verified', joined: '2026-03-18', followers: 92000, er: 7.8, rating: 4.8, jobs: 9, earned: 10800000, badges: [], tags: ['Beauty', 'Skincare'], featured: false, reports: 0, lastActive: '2026-11-04T08:40:00+05:30' },
    { id: 'cr4', name: 'Arjun Rao', handle: '@arjunexplains', city: 'Bengaluru', status: 'active', kyc: 'verified', joined: '2025-08-30', followers: 610000, er: 3.4, rating: 4.6, jobs: 17, earned: 64600000, badges: ['Verified Pro'], tags: ['Science', 'Skincare', 'Tech'], featured: true, reports: 0, lastActive: '2026-11-03T22:42:00+05:30' },
    { id: 'cr6', name: 'Meher Gill', handle: '@meherdoesmakeup', city: 'Chandigarh', status: 'active', kyc: 'verified', joined: '2026-06-01', followers: 260000, er: 3.8, rating: 4.4, jobs: 6, earned: 12000000, badges: [], tags: ['Makeup', 'Beauty'], featured: false, reports: 1, lastActive: '2026-11-02T19:00:00+05:30' },
    { id: 'cr7', name: 'Dev Malhotra', handle: '@devfitdaily', city: 'Pune', status: 'active', kyc: 'verified', joined: '2026-02-11', followers: 185000, er: 5.2, rating: 4.5, jobs: 8, earned: 11200000, badges: [], tags: ['Fitness', 'Grooming'], featured: false, reports: 0, lastActive: '2026-11-01T07:30:00+05:30' },
    { id: 'cr8', name: 'Ishita Banerjee', handle: '@ishitareads', city: 'Kolkata', status: 'active', kyc: 'verified', joined: '2026-04-15', followers: 64000, er: 8.4, rating: 4.8, jobs: 11, earned: 8100000, badges: [], tags: ['Lifestyle', 'Books', 'Skincare'], featured: false, reports: 0, lastActive: '2026-11-03T09:20:00+05:30' },
    { id: 'cr9', name: 'Tanvi Shah', handle: '@tanvi.tries', city: 'Ahmedabad', status: 'active', kyc: 'verified', joined: '2026-09-20', followers: 41000, er: 9.1, rating: null, jobs: 0, earned: 0, badges: [], tags: ['Beauty', 'Lifestyle'], featured: false, reports: 0, lastActive: '2026-11-03T18:00:00+05:30' },
    { id: 'cr11', name: 'Rahul Verma', handle: '@rahul.reviews.daily', city: 'Lucknow', status: 'suspended', kyc: 'verified', joined: '2026-08-04', followers: 12000, er: 14.9, rating: 3.1, jobs: 2, earned: 900000, badges: [], tags: ['Tech'], featured: false, reports: 3, suspended: { at: '2026-10-30T12:00:00+05:30', reason: 'Bid ring with two linked accounts (same device, same payout UPI).' }, lastActive: '2026-10-29T23:50:00+05:30' },
    { id: 'cr12', name: 'Priya Shah', handle: '', city: 'Mumbai', status: 'active', kyc: 'under_review', joined: '2026-11-04', followers: 0, er: null, rating: null, jobs: 0, earned: 0, badges: [], tags: [], featured: false, reports: 0, lastActive: '2026-11-04T10:30:00+05:30' }
  ],
  brands: [
    { id: 'b1', name: 'Mirevo Skincare', contact: 'Meera Kapoor', email: 'meera@mirevo.in', mailVerified: true, legal: 'Mirevo Skincare Private Limited', gstin: '27AABCM1234F1Z5', regVerified: true, city: 'Mumbai', status: 'active', verify: 'verified', joined: '2026-05-01', postsLast30: 3, postsAvg: 2.4, spent: 6800000, open: 2, reports: 0 },
    { id: 'b2', name: 'Kaapi Kulture', contact: 'Arvind Swaminathan', email: 'team@kaapikulture.in', mailVerified: true, legal: 'Kaapi Kulture LLP', gstin: '33AAKFK5521L1ZQ', regVerified: true, city: 'Chennai', status: 'active', verify: 'verified', joined: '2026-02-14', postsLast30: 4, postsAvg: 3.1, spent: 9200000, open: 1, reports: 0 },
    { id: 'b3', name: 'Gamla Co.', contact: 'Nisha Pillai', email: 'hello@gamla.co', mailVerified: true, legal: 'Gamla Green Ventures Pvt Ltd', gstin: '29AAHCG7781K1Z2', regVerified: true, city: 'Bengaluru', status: 'active', verify: 'verified', joined: '2026-04-09', postsLast30: 2, postsAvg: 1.8, spent: 3600000, open: 1, reports: 0 },
    { id: 'b4', name: 'Konkan Kinara Stays', contact: 'Sameer Desai', email: 'stay@konkankinara.in', mailVerified: true, legal: 'Konkan Kinara Hospitality', gstin: '27AAIFK3302M1Z9', regVerified: true, city: 'Lonavala', status: 'active', verify: 'verified', joined: '2026-03-03', postsLast30: 1, postsAvg: 1.2, spent: 7600000, open: 1, reports: 0 },
    { id: 'b5', name: 'Roz Fit', contact: 'Ishaan Khurana', email: 'brand@rozfit.in', mailVerified: true, legal: 'Roz Fitness Pvt Ltd', gstin: '07AAECR6610P1Z4', regVerified: true, city: 'Gurugram', status: 'active', verify: 'verified', joined: '2026-01-20', postsLast30: 1, postsAvg: 1.0, spent: 900000, open: 0, reports: 1 },
    { id: 'b6', name: 'GlowCash Deals', contact: 'Unknown', email: 'glowcashdeals2026@gmail.com', mailVerified: false, legal: '', gstin: '', regVerified: false, city: '—', status: 'active', verify: 'not_started', joined: '2026-11-02', postsLast30: 11, postsAvg: 0, spent: 0, open: 11, reports: 4 },
    { id: 'b7', name: 'Salt & Soil Foods', contact: 'Rohan Mehta', email: 'rohan@saltandsoil.in', mailVerified: true, legal: 'Salt and Soil Foods Private Limited', gstin: '27AAKCS9087Q1Z6', regVerified: false, city: 'Pune', status: 'active', verify: 'under_review', joined: '2026-11-04', postsLast30: 0, postsAvg: 0, spent: 0, open: 0, reports: 0 }
  ],

  /* ---------- verification desk ---------- */
  verifications: [
    { id: 'v1', kind: 'creator', account: 'cr12', name: 'Priya Shah', submitted: '2026-11-04T10:31:00+05:30', status: 'pending',
      id_doc: { type: 'Aadhaar', masked: 'XXXX XXXX 4417', name: 'PRIYA SHAH', dob: '1999-07-21', match: 'ok' },
      pan: { masked: 'BXQPS••••K', name: 'PRIYA SHAH', match: 'ok' }, bank: { kind: 'UPI', masked: 'priya••••@okicici', holder: 'PRIYA SHAH', match: 'ok' },
      selfie: { liveness: 'passed', faceMatch: 96 },
      socials: [{ p: 'instagram', handle: '@priya.shah.makes', followers: 24000, linked: true, age: '3 years' }] },
    { id: 'v2', kind: 'creator', account: 'cr1', name: 'Ananya Iyer', submitted: '2026-11-02T18:20:00+05:30', status: 'pending', note: 'Re-check after payout change',
      id_doc: { type: 'Aadhaar', masked: 'XXXX XXXX 2291', name: 'ANANYA IYER', dob: '2001-03-14', match: 'ok' },
      pan: { masked: 'ABCDE••••F', name: 'ANANYA IYER', match: 'ok' }, bank: { kind: 'Bank', masked: '••••4821', holder: 'ANANYA S IYER', match: 'mismatch' },
      selfie: { liveness: 'passed', faceMatch: 94 },
      socials: [{ p: 'instagram', handle: '@ananyamakes', followers: 180000, linked: true, age: '5 years' }, { p: 'youtube', handle: '@AnanyaMakes', followers: 40000, linked: true, age: '2 years' }] },
    { id: 'v3', kind: 'creator', account: null, name: 'Aman Gupta', submitted: '2026-11-03T14:05:00+05:30', status: 'pending',
      id_doc: { type: 'Driving licence', masked: 'DL-14••••••7731', name: 'AMAN GUPTA', dob: '2009-02-10', match: 'under18' },
      pan: { masked: 'CKLPG••••R', name: 'AMAN GUPTA', match: 'ok' }, bank: { kind: 'UPI', masked: 'aman••••@paytm', holder: 'SUNITA GUPTA', match: 'mismatch' },
      selfie: { liveness: 'passed', faceMatch: 91 },
      socials: [{ p: 'instagram', handle: '@aman.unboxes', followers: 8800, linked: false, age: '7 months' }] },
    { id: 'v4', kind: 'brand', account: 'b7', name: 'Salt & Soil Foods', submitted: '2026-11-04T10:36:00+05:30', status: 'pending',
      business: { legal: 'Salt and Soil Foods Private Limited', gstin: '27AAKCS9087Q1Z6', gstinStatus: 'Active', pan: 'AAKCS9087Q', panFromGstin: true, cin: 'U15400PN2024PTC231876' },
      person: { name: 'Rohan Mehta', designation: 'Founder', mail: 'rohan@saltandsoil.in', mailVerified: true }, billing: { address: '2nd floor, Kalyani Nagar, Pune 411006', email: 'accounts@saltandsoil.in' } },
    { id: 'v5', kind: 'brand', account: 'b6', name: 'GlowCash Deals', submitted: '2026-11-02T09:00:00+05:30', status: 'pending',
      business: { legal: '', gstin: '', gstinStatus: 'Not provided', pan: '', panFromGstin: false, cin: '' },
      person: { name: '—', designation: '—', mail: 'glowcashdeals2026@gmail.com', mailVerified: false }, billing: { address: '', email: '' } }
  ],

  /* ---------- moderation: reported profiles, messages, content ---------- */
  reports: [
    { id: 'r1', type: 'campaign', target: 'GlowCash Deals · “Earn ₹50,000 a week, pay ₹999 to join”', by: 'Riya Thomas', reason: 'Scam: asks creators to pay to apply', at: '2026-11-04T08:12:00+05:30', status: 'open', severity: 'high', count: 4, link: 'k9' },
    { id: 'r2', type: 'message', target: 'Chat · GlowCash Deals → Tanvi Shah', excerpt: 'Pay outside Linkloom to my UPI glowcash@ybl and get 2x', by: 'Tanvi Shah', reason: 'Asked to pay off-platform', at: '2026-11-03T21:40:00+05:30', status: 'open', severity: 'high', count: 1 },
    { id: 'r3', type: 'profile', target: 'Rahul Verma (@rahul.reviews.daily)', by: 'System', reason: 'Linked accounts in a bid ring', at: '2026-10-29T23:55:00+05:30', status: 'actioned', severity: 'high', count: 3, action: 'Suspended' },
    { id: 'r4', type: 'review', target: 'Review of Meher Gill by “Brand user 2291”', excerpt: '1★ Worst creator, total fraud, never use!!!', by: 'Meher Gill', reason: 'Fake review: no order between them', at: '2026-11-02T15:00:00+05:30', status: 'open', severity: 'medium', count: 1, link: 'rv3' },
    { id: 'r5', type: 'content', target: 'Delivery file · “Sweat-proof SPF run test”', by: 'Roz Fit', reason: 'Product claim not allowed (“cures acne”)', at: '2026-09-10T11:00:00+05:30', status: 'dismissed', severity: 'low', count: 1 }
  ],

  /* ---------- marketplace ---------- */
  campaigns: [
    { id: 'k1', brand: 'b1', title: 'Barrier Repair Serum launch', platform: 'instagram', budget: 1800000, bids: 14, posted: '2026-11-03T17:40:00+05:30', status: 'live', flags: 0 },
    { id: 'k2', brand: 'b1', title: 'Night routine for oily skin', platform: 'youtube', budget: 1500000, bids: 6, posted: '2026-10-30T11:00:00+05:30', status: 'live', flags: 0 },
    { id: 'k3', brand: 'b2', title: 'Filter coffee at home, Diwali edition', platform: 'instagram', budget: 1200000, bids: 31, posted: '2026-11-02T11:00:00+05:30', status: 'live', flags: 0 },
    { id: 'k4', brand: 'b4', title: 'Weekend in Alibaug, travel vlog', platform: 'youtube', budget: 4500000, bids: 9, posted: '2026-11-01T10:00:00+05:30', status: 'live', flags: 0 },
    { id: 'k5', brand: 'b3', title: 'Balcony herbs in 30 days', platform: 'instagram', budget: 800000, bids: 12, posted: '2026-10-28T09:00:00+05:30', status: 'live', flags: 0 },
    { id: 'k9', brand: 'b6', title: 'Earn ₹50,000 a week, pay ₹999 to join', platform: 'instagram', budget: 5000000, bids: 63, posted: '2026-11-02T09:30:00+05:30', status: 'live', flags: 4, rule: 'Asks creators to pay; off-platform payment' },
    { id: 'k10', brand: 'b6', title: 'DM us for instant paid collab', platform: 'instagram', budget: 2500000, bids: 40, posted: '2026-11-03T12:00:00+05:30', status: 'live', flags: 2, rule: 'Contact details in brief' }
  ],
  /* suspicious bidding patterns found by the system */
  bidAlerts: [
    { id: 'ba1', pattern: 'Bid ring', detail: '3 accounts on one device and one payout UPI bid on the same 6 jobs within 4 minutes.', accounts: ['cr11', 'Two linked accounts (blocked at sign-up)'], at: '2026-10-29T23:40:00+05:30', status: 'actioned', risk: 92 },
    { id: 'ba2', pattern: 'Bid flooding', detail: '41 bids in 12 minutes on GlowCash Deals jobs, all at the exact budget, same pitch text.', accounts: ['Accounts created in the last 48 h (17)'], at: '2026-11-03T12:30:00+05:30', status: 'open', risk: 81 },
    { id: 'ba3', pattern: 'Lowball undercutting', detail: 'Tanvi Shah bid ₹7,000 on a ₹18,000 brief. 61% under budget, but within the platform minimum.', accounts: ['cr9'], at: '2026-11-03T18:00:00+05:30', status: 'open', risk: 28 }
  ],
  reviews: [
    { id: 'rv1', from: 'Mirevo Skincare', to: 'Ananya Iyer', stars: 5, text: 'Clear, on time and the comments were full of real questions.', at: '2026-05-23', order: 'o6', status: 'visible' },
    { id: 'rv2', from: 'Kaapi Kulture', to: 'Riya Thomas', stars: 5, text: 'Lovely Story, real kitchen, real coffee.', at: '2026-10-02', order: 'o9', status: 'visible' },
    { id: 'rv3', from: 'Brand user 2291', to: 'Meher Gill', stars: 1, text: 'Worst creator, total fraud, never use!!!', at: '2026-11-02', order: null, status: 'flagged' },
    { id: 'rv4', from: 'Roz Fit', to: 'Dev Malhotra', stars: 2, text: 'Missed the deadline, refunded. Communication was okay.', at: '2026-09-19', order: 'o7', status: 'visible' }
  ],
  categories: ['Skincare', 'Beauty', 'Makeup', 'Lifestyle', 'Food & drink', 'Travel', 'Fitness', 'Grooming', 'Tech', 'Science', 'Books', 'Fashion'],

  /* ---------- orders and escrow (every hire across the platform) ----------
     phase: invited → accepted → funded → in_progress → submitted → revision → approved → released (or refunded / disputed) */
  orders: [
    { id: 'o1', brand: 'b1', creator: 'cr1', title: 'Sunscreen reapplication, office day', amount: 1600000, phase: 'revision', funded: '2026-10-24', due: '2026-11-08' },
    { id: 'o2', brand: 'b1', creator: 'cr4', title: 'Barrier cream, winter care', amount: 3800000, phase: 'submitted', funded: '2026-10-15', due: '2026-11-10' },
    { id: 'o3', brand: 'b4', creator: 'cr1', title: 'Weekend in Lonavala', amount: 3800000, phase: 'approved', funded: '2026-10-13', due: '2026-10-31' },
    { id: 'o4', brand: 'b3', creator: 'cr1', title: 'Indoor plants for small flats', amount: 800000, phase: 'in_progress', funded: '2026-10-31', due: '2026-11-20' },
    { id: 'o5', brand: 'b2', creator: 'cr3', title: 'Pongal filter coffee Story', amount: 600000, phase: 'disputed', funded: '2026-10-20', due: '2026-10-30', dispute: 'd1' },
    { id: 'o6', brand: 'b1', creator: 'cr1', title: 'Summer SPF myths', amount: 1000000, phase: 'released', funded: '2026-05-05', released: '2026-05-22' },
    { id: 'o7', brand: 'b5', creator: 'cr7', title: 'Sweat-proof SPF run test', amount: 900000, phase: 'refunded', funded: '2026-09-01', refunded: '2026-09-18' },
    { id: 'o8', brand: 'b1', creator: 'cr1', title: 'Vitamin C gel, first impressions', amount: 1400000, phase: 'released', funded: '2026-09-28', released: '2026-10-14' },
    { id: 'o9', brand: 'b2', creator: 'cr3', title: 'Monsoon kitchen hacks', amount: 900000, phase: 'released', funded: '2026-09-10', released: '2026-10-01' },
    { id: 'o10', brand: 'b1', creator: 'cr8', title: 'Winter night routine Carousel', amount: 700000, phase: 'accepted', funded: null, due: '2026-11-22' },
    { id: 'o11', brand: 'b2', creator: 'cr6', title: 'Diwali hampers unboxing', amount: 2000000, phase: 'disputed', funded: '2026-10-18', due: '2026-10-28', dispute: 'd2' }
  ],
  /* payment-related complaints and disputes */
  disputes: [
    { id: 'd1', order: 'o5', opened: '2026-11-01T10:00:00+05:30', by: 'creator', claim: 'Delivered the Story on 29 Oct; brand has not approved or replied for 5 days.',
      evidence: ['Story live link, posted 29 Oct', 'Chat: delivery note sent 29 Oct 19:10'], other: 'No response from Kaapi Kulture.', status: 'open', sla: '2026-11-06' },
    { id: 'd2', order: 'o11', opened: '2026-10-30T16:20:00+05:30', by: 'brand', claim: 'Creator delivered a different product than briefed and refuses a revision.',
      evidence: ['Brief: Diwali hamper A', 'Delivery shows hamper C', 'Chat: revision request 29 Oct'], other: 'Meher says the hamper A courier never arrived.', status: 'open', sla: '2026-11-05' },
    { id: 'd3', order: 'o7', opened: '2026-09-15T09:00:00+05:30', by: 'brand', claim: 'Nothing delivered by the due date.', evidence: ['Due 15 Sep, no upload'], other: 'Creator injured; agreed to refund.', status: 'resolved', outcome: 'Refunded in full', sla: '2026-09-18' },
    { id: 'd4', order: 'o3', opened: '2026-11-03T20:00:00+05:30', by: 'creator', claim: 'Approved on 3 Nov but payout not received yet.', evidence: ['Approved 3 Nov 17:44'], other: 'Release is scheduled within 24 h of approval.', status: 'open', sla: '2026-11-05', kind: 'payment' }
  ],

  /* ---------- financials (sample figures) ---------- */
  finance: {
    months: [ { m: '2026-06', subs: 18200000, gmv: 9800000, gateway: 196000 }, { m: '2026-07', subs: 21400000, gmv: 14600000, gateway: 292000 },
              { m: '2026-08', subs: 24900000, gmv: 21300000, gateway: 426000 }, { m: '2026-09', subs: 27600000, gmv: 26800000, gateway: 536000 },
              { m: '2026-10', subs: 31200000, gmv: 34900000, gateway: 698000 }, { m: '2026-11', subs: 8400000, gmv: 6200000, gateway: 124000 } ],
    subscribers: { creators: 1840, brands: 212 },
    payouts: [
      { id: 'po1', creator: 'cr1', amount: 1400000, order: 'o8', at: '2026-10-14', method: 'UPI ananya••••@upi', utr: 'UTR 428711093344', status: 'paid' },
      { id: 'po2', creator: 'cr3', amount: 900000, order: 'o9', at: '2026-10-01', method: 'Bank ••••7710', utr: 'UTR 427402218871', status: 'paid' },
      { id: 'po3', creator: 'cr1', amount: 1000000, order: 'o6', at: '2026-05-22', method: 'UPI ananya••••@upi', utr: 'UTR 414219980012', status: 'paid' },
      { id: 'po4', creator: 'cr1', amount: 3800000, order: 'o3', at: null, method: 'UPI ananya••••@upi', utr: null, status: 'scheduled' }
    ]
  },

  /* ---------- identity and security ---------- */
  admins: [
    { id: 'a1', name: 'Kavya Menon', email: 'kavya@linkloom.in', role: 'Super admin', mfa: true, lastSeen: '2026-11-04T10:42:00+05:30' },
    { id: 'a2', name: 'Farhan Ali', email: 'farhan@linkloom.in', role: 'Trust & safety', mfa: true, lastSeen: '2026-11-04T09:20:00+05:30' },
    { id: 'a3', name: 'Neha Joshi', email: 'neha@linkloom.in', role: 'Finance', mfa: true, lastSeen: '2026-11-03T18:05:00+05:30' }
  ],
  sessions: [
    { id: 's1', who: 'Kavya Menon (you)', device: 'Chrome · macOS', ip: '49.207.••.18 · Bengaluru', since: '2026-11-04T09:58:00+05:30', current: true },
    { id: 's2', who: 'Farhan Ali', device: 'Firefox · Windows', ip: '103.48.••.77 · Hyderabad', since: '2026-11-04T08:41:00+05:30' },
    { id: 's3', who: 'Neha Joshi', device: 'Safari · iPhone', ip: '157.32.••.9 · Mumbai', since: '2026-11-03T17:50:00+05:30' }
  ],

  /* ---------- audit log: append-only, hash-chained (see LLD.audit in core.js) ---------- */
  audit: [
    { id: 'al1', at: '2026-10-29T23:58:00+05:30', who: 'Farhan Ali', action: 'account.suspend', target: 'Rahul Verma (cr11)', detail: 'Bid ring with two linked accounts' },
    { id: 'al2', at: '2026-10-30T09:12:00+05:30', who: 'Kavya Menon', action: 'verification.approve', target: 'Tanvi Shah (cr9)', detail: 'ID, PAN, UPI and Instagram match' },
    { id: 'al3', at: '2026-10-31T11:40:00+05:30', who: 'Neha Joshi', action: 'payouts.export', target: 'October payouts', detail: '38 rows, CSV' },
    { id: 'al4', at: '2026-11-02T15:30:00+05:30', who: 'Farhan Ali', action: 'report.dismiss', target: 'Report r5', detail: 'Claim was in the brand’s own brief' },
    { id: 'al5', at: '2026-11-04T09:58:00+05:30', who: 'Kavya Menon', action: 'auth.login', target: 'Admin console', detail: 'Password + authenticator code' }
  ],

  notifications: [
    { id: 'n1', kind: 'verify', text: 'Priya Shah submitted KYC', at: '2026-11-04T10:31:00+05:30', go: '#verify-v1', read: false },
    { id: 'n2', kind: 'verify', text: 'Salt & Soil Foods submitted brand verification', at: '2026-11-04T10:36:00+05:30', go: '#verify-v4', read: false },
    { id: 'n3', kind: 'report', text: '4 reports on a GlowCash Deals campaign', at: '2026-11-04T08:12:00+05:30', go: '#moderation-r1', read: false },
    { id: 'n4', kind: 'dispute', text: 'Dispute d2 is due tomorrow', at: '2026-11-04T09:00:00+05:30', go: '#orders-d2', read: false },
    { id: 'n5', kind: 'bids', text: 'Bid flooding on GlowCash Deals jobs', at: '2026-11-03T12:30:00+05:30', go: '#marketplace-bids', read: true }
  ],
  ui: {}
};

export default data;
