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

**The console holds no sample or demo data.** Everything it shows comes from the Linkloom API. Where the backend has no endpoint yet, the screen says it is not connected and names the endpoint it needs.

| Screen | Endpoint | State |
|---|---|---|
| Sign-in | `POST /v1/auth/login/`, `POST /v1/auth/token/refresh/`, `POST /v1/auth/logout/` | Connected |
| Command | creators, campaigns and the verification queue below | Partly connected |
| Verification desk, queue and request | `GET /v1/admin/verifications/`, `GET /v1/admin/verifications/{id}/` | Connected, read only |
| Verification desk, ID document | `GET /v1/uploads/{id}/download-url/` | Connected (the backend may refuse admins) |
| Accounts, creators | `GET /v1/creators/`, `GET /v1/creators/{id}/`, `GET /v1/creators/{id}/reviews/` | Connected, read only |
| Accounts, brands | none yet | Not connected |
| Marketplace, campaigns | `GET /v1/campaigns/` | Connected, read only |
| Marketplace, bids, reviews, featured, categories | none yet | Not connected |
| Moderation, Orders and escrow, Financials, Audit log | none yet | Not connected |
| Security | `GET /v1/auth/me/`, `POST /v1/auth/password/change/`, `POST /v1/auth/logout-all/` | Connected; admin team, sessions and MFA not connected |
| Notifications (the bell) | `GET /v1/notifications/`, `GET /v1/notifications/unread-count/`, `POST /v1/notifications/read-all/` | Connected |

Nothing an admin decides can be sent yet (approve, reject, suspend, hide, release, refund): the backend has no endpoints for it, so those buttons are switched off and the screens say why. The endpoints the backend team needs are in the backend requirements document.

### Signing in

- **Who can sign in:** an admin signs in with the email and password of their Linkloom account. Only an account whose `role` is `admin` gets in; any other account's tokens are thrown away at once.
- **No second step yet:** the backend has no authenticator step for admins, so sign-in is one step.
- **Tokens:** kept in `sessionStorage` (closing the tab signs out) and refreshed with `POST /v1/auth/token/refresh/` when they expire. If refresh fails, the console goes back to sign-in with the "session ended" message.

Admin emails must end in `@linkloom.in`; set `VITE_ADMIN_EMAIL_DOMAIN` to change that, or to an empty value to allow any address.

The verification records' shape is not documented, so `src/lib/live.js` reads them with the KYC field names the website uses (`status`, `steps.pan / id / bank`, `rejectionReason`, `submittedAt`) and shows any other fields as they came, under "Other fields from the API".

### The API proxy

The API sends no CORS headers, so the browser calls it through a same-origin `/api` proxy. `vite.config.js` sets that up for `npm run dev` and `npm run preview`, and `vercel.json` does it on Vercel. Any other host needs the same rule: `/api/*` forwarded to the backend. Settings are in `.env.example`.

## Layout

| Path | What it holds |
|---|---|
| `index.html` | Vite entry page |
| `src/main.jsx` | Entry: styles, runtime, screens, then the React root |
| `src/App.jsx` | App shell and the route outlet |
| `src/components/` | Shared components: `Shell` (sidebar, top bar, tab bar), `Icon`, `Lq` (liquid button), `Av` (avatar), `Count`, `SheetHost`, `AlertsSheet`, `NotConnected` |
| `src/screens/` | One file per screen; each registers its route(s) |
| `src/lib/core.js` | Runtime: hash router (`#name` or `#name-param`), store, sheets, toasts, formatting helpers |
| `src/lib/api.js`, `src/lib/live.js` | Client for the Linkloom API (sign-in, tokens, requests), and everything the console loads from it |
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
| `#moderation` | Moderation | `Moderation.jsx` |
| `#orders` | Orders and escrow | `Orders.jsx` |
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
