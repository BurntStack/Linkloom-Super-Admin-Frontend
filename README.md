# Linkloom Super Admin — Frontend

The Linkloom admin console: verification, accounts, marketplace, moderation, orders and escrow, financials, security and the audit log.

It is a React 18 app built with Vite. Animations use GSAP 3.12.5 and the Web Animations API. Fonts are Faculty Glyphic, Figtree and Mynerve from Google Fonts.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

To make a production build (output in `dist/`, deployable to any static host):

```bash
npm run build
```

```bash
npm run preview
```

## Data

**The console holds no sample or demo data.** Everything it shows comes from the Linkloom admin API (`/v1/admin/`), loaded by `src/lib/admin.js` after an admin signs in. Every admin action is sent to the API, and the server writes the audit log entry.

| Screen | Reads | Actions |
|---|---|---|
| Command | `GET /v1/admin/system/dashboard/`, `counts/`, and the lists below | — |
| Verification desk | `GET /v1/admin/verifications/`, `GET /v1/admin/verifications/{id}/` | `POST …/{id}/approve/`, `reject/`, `request-info/` |
| Accounts | `GET /v1/admin/users/creators/`, `brands/` (lists and details), `GET /v1/admin/users/accounts/{user_id}/sessions/` | `PATCH /v1/admin/users/creators/{id}/` (badges, tags, featured); `POST /v1/admin/users/accounts/{user_id}/suspend/`, `reactivate/`, `password-reset/`, `sessions/revoke/` |
| Marketplace | `GET /v1/admin/campaigns/`, `GET /v1/admin/moderation/bid-alerts/`, `reviews/`, `GET /v1/admin/users/featured-creators/`, `categories/` | `POST /v1/admin/campaigns/{id}/approve/`, `reject/`, `hide/`, `remove/`, `restore/`; bid alerts `freeze-bids/`, `suspend-accounts/`, `warn/`, `dismiss/`; reviews `delete/`, `keep/`; `PUT …/featured-creators/order/`; categories `POST`, `PATCH`, `merge/` |
| Moderation | `GET /v1/admin/moderation/abuse-reports/`, `…/{id}/` | `POST …/{id}/remove/`, `warn/`, `suspend-account/`, `dismiss/` |
| Orders and escrow | `GET /v1/admin/finance/orders/`, `…/{id}/`, `disputes/`, `rules/` | `POST …/orders/{id}/force-release/`, `refund/` (with an `Idempotency-Key`), `POST …/disputes/{id}/resolve/` |
| Financials | `GET /v1/admin/finance/summary/?months=6`, `rules/`, `payouts/` | `GET …/payouts/export/` (CSV) |
| Audit log | `GET /v1/admin/system/audit-log/` | `GET …/audit-log/verify/`, `GET …/audit-log/export/` (CSV) |
| Alerts (the bell) | `GET /v1/admin/system/notifications/` | `POST …/{id}/read/`, `read-all/` |
| Security | `GET /v1/auth/me/` | `POST /v1/auth/password/change/`, `POST /v1/auth/logout-all/` |

Every new or edited campaign waits under **Needs approval** in Marketplace until an admin approves or rejects it.

What each admin can see depends on their `adminRole` (`super_admin`, `trust_safety`, `finance`). A list the role cannot read is left out, and the screen says so.

The backend guide names the endpoints but not every field, so the mappers in `src/lib/admin.js` read the obvious field names and fall back to empty values, never to made-up ones. If a screen shows "Not provided" where the API does send a value, the field name needs adding to the mapper.

Still not connected: the admin team list and admin sessions on Security (no endpoint yet).

### Signing in

- **Two steps:** email and password (`POST /v1/admin/auth/login/`, which returns an MFA challenge), then the 6-digit code from the admin's authenticator app (`POST /v1/admin/auth/mfa/verify/`, which returns the tokens). "Trust this device for 7 days" sends `trustDevice`.
- **Who can sign in:** only an account whose `role` is `admin`; any other account's tokens are thrown away at once. The website's `/v1/auth/login/` and Google sign-in are not used, because they skip the code step.
- **Lockout:** wrong-attempt counting is the backend's. The screen shows `ACCOUNT_LOCKED` (with `details.retryAfter`), `MFA_INVALID` and `RATE_LIMITED` as they come, and the tries left when `details.attemptsRemaining` is sent.
- **Tokens:** kept in `sessionStorage` (closing the tab signs out) and refreshed with `POST /v1/auth/token/refresh/` when they expire. If refresh fails, the console goes back to sign-in with the "session ended" message.

Admin emails must end in `@linkloom.in`; set `VITE_ADMIN_EMAIL_DOMAIN` to change that, or to an empty value to allow any address.


### The API proxy

The API sends no CORS headers, so the browser calls it through a same-origin `/api` proxy. `vite.config.js` sets that up for `npm run dev` and `npm run preview`, and `vercel.json` does it on Vercel. Any other host needs the same rule: `/api/*` forwarded to the backend. Settings are in `.env.example`.

## Layout

| Path | What it holds |
|---|---|
| `index.html` | Vite entry page |
| `src/main.jsx` | Entry: styles, runtime, screens, then the React root |
| `src/App.jsx` | App shell and the route outlet |
| `src/components/` | Shared components: `Shell` (sidebar, top bar, tab bar), `Icon`, `Lq` (liquid button), `Av` (avatar), `Count`, `SheetHost`, `AlertsSheet`, `Needs` (loads a screen's data first), `Select`, `NotConnected` |
| `src/screens/` | One file per screen; each registers its route(s) |
| `src/lib/core.js` | Runtime: hash router (`#name` or `#name-param`), store, sheets, toasts, formatting helpers |
| `src/lib/api.js`, `src/lib/admin.js` | Client for the Linkloom API (sign-in, tokens, requests), and everything the console loads from and sends to `/v1/admin/` |
| `src/lib/adm.jsx`, `src/lib/mx.jsx` | The confirm and reason sheets every admin action goes through (they wait for the API's answer) |
| `src/lib/hooks.js` | React bindings: `useStore`, `useRoute`, `useSheets`, `useRerender` |
| `src/lib/motion.js` | The animation layer (respects `prefers-reduced-motion`) |
| `src/lib/ui-select.js` | Custom listbox for `<select class="select">` controls |
| `src/lib/mx.jsx` | Display helpers for the Marketplace screen |
| `src/data/state.js` | The console's empty starting state; money from the API is integer paise |
| `src/styles/` | Design tokens and shared styles (`core.css`, `motion.css`), one stylesheet per screen (kept for screens that are not connected yet) |
| `public/assets/` | SVG artwork and icons |

## Screens

| Route | Screen | File |
|---|---|---|
| `#login` | Sign-in | `Auth.jsx` |
| `#home` | Command | `Home.jsx` |
| `#verify`, `#verify-<id>` | Verification desk | `Verify.jsx` |
| `#accounts`, `#creator-<id>`, `#brand-<id>` | Accounts | `Accounts.jsx` |
| `#marketplace`, `#marketplace-<tab>` | Marketplace | `Marketplace.jsx` |
| `#moderation`, `#moderation-<id>` | Moderation | `Moderation.jsx` |
| `#orders`, `#orders-disputes`, `#orders-<id>` | Orders and escrow | `Orders.jsx` |
| `#finance` | Financials | `Finance.jsx` |
| `#audit` | Audit log | `Audit.jsx` |
| `#security` | Security | `Security.jsx` |

## How the animations work with React

The animation layer in `src/lib/motion.js` works directly on the DOM: route entrances, staggered lists, FLIP reordering, number ticks, the nav indicators, sheets and toasts. Screens call it from effects and event handlers through `mo('name', ...)`.

A few conventions keep React and the animation layer from stepping on each other:

- **`<Count>`** renders a number the animation layer ticks into place. React leaves that element's contents alone.
- **`flushSync`** is used where an animation has to measure the page right after a change (for example FLIP).
- **`.no-anchor`** on a region turns off the browser's scroll anchoring there, so scrolling behaves as designed while lists change.
- **No `StrictMode`**: it would run every entrance animation twice in development.
