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

## Sign in

The sign-in screen takes either the sample account, which opens the console on sample data, or a real Linkloom admin account, which signs in to the API (see Signing in below). The sample email, password and code are printed on the sign-in screen itself and are defined in `src/screens/Auth.jsx`.

**Most of the console still runs on sample data** (see Live data below). Sample data comes from `src/data/sample.js` and lives in memory, so changes reset on reload. Sign-in, MFA, the audit log and every admin action are simulated in the browser and must be replaced with real API calls before this is used with real accounts.

## Live data

Parts of the console read from the existing Linkloom API; everything else is sample data.

| Screen | Endpoint | Needs an admin sign-in |
|---|---|---|
| Accounts, creators list | `GET /v1/creators/` | No |
| Accounts, creator page | `GET /v1/creators/{id}/` | No |
| Accounts, creator reviews | `GET /v1/creators/{id}/reviews/` | Yes |
| Marketplace, campaigns | `GET /v1/campaigns/` | No |
| Verification desk, queue | `GET /v1/admin/verifications/` | Yes |
| Verification desk, one request | `GET /v1/admin/verifications/{id}/` | Yes |
| Verification desk, ID document | `GET /v1/uploads/{id}/download-url/` | Yes |

All of it is read only. The backend has no endpoints yet for approving, rejecting, suspending, hiding or moving money, so those buttons are switched off on live records and the screens say why. If the API cannot be reached, the public parts fall back to sample data and say so.

### Signing in

- **Sample account** (shown on the sign-in screen): opens the console on sample data, with the two-step sign-in, exactly as designed. No request is sent to the API.
- **Any other email and password:** sent to `POST /v1/auth/login/`. Only an account whose `role` is `admin` gets in; any other account's tokens are thrown away at once. The backend has no authenticator step yet, so a live sign-in is one step.
- **Tokens:** kept in `sessionStorage` (closing the tab signs out) and refreshed with `POST /v1/auth/token/refresh/` when they expire. If refresh fails, the console goes back to sign-in with the "session ended" message. Signing out calls `POST /v1/auth/logout/`.

Admin emails must end in `@linkloom.in`; set `VITE_ADMIN_EMAIL_DOMAIN` to change that, or to an empty value to allow any address.

The verification records' shape is not documented, so `src/lib/live.js` reads them with the KYC field names the website uses (`status`, `steps.pan / id / bank`, `rejectionReason`, `submittedAt`) and shows any other fields as they came, under "Other fields from the API".

### The API proxy

The API sends no CORS headers, so the browser calls it through a same-origin `/api` proxy. `vite.config.js` sets that up for `npm run dev` and `npm run preview`, and `vercel.json` does it on Vercel. Any other host needs the same rule: `/api/*` forwarded to the backend. Settings are in `.env.example`; `VITE_LIVE_API=off` runs everything on sample data.

## Layout

| Path | What it holds |
|---|---|
| `index.html` | Vite entry page |
| `src/main.jsx` | Entry: styles, runtime, screens, then the React root |
| `src/App.jsx` | App shell and the route outlet |
| `src/components/` | Shared components: `Shell` (sidebar, top bar, tab bar), `Icon`, `Lq` (liquid button), `Select`, `Count`, `SheetHost`, `AlertsSheet` |
| `src/screens/` | One file per screen; each registers its route(s) |
| `src/lib/core.js` | Runtime: hash router (`#name` or `#name-param`), store, audit log, sheets, toasts, formatting helpers |
| `src/lib/api.js`, `src/lib/live.js` | Client for the existing Linkloom API, and the live creators and campaigns it loads |
| `src/lib/hooks.js` | React bindings: `useStore`, `useRoute`, `useSheets`, `useRerender` |
| `src/lib/motion.js` | The animation layer (respects `prefers-reduced-motion`) |
| `src/lib/ui-select.js` | Custom listbox behind `<Select>` |
| `src/lib/adm.jsx`, `src/lib/mx.jsx` | Confirm and reason sheets shared between screens |
| `src/data/sample.js` | Sample data; money is integer paise |
| `src/styles/` | Design tokens and shared styles (`core.css`, `motion.css`), one stylesheet per screen |
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
- **A keyed fragment** redraws a list from scratch where the design calls for rows to arrive fresh after a change.
- **`.no-anchor`** on a region turns off the browser's scroll anchoring there, so scrolling behaves as designed while lists change.
- **No `StrictMode`**: it would run every entrance animation twice in development.
