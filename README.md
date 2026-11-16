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

The sign-in screen (email and password, then a 6-digit authenticator code) is a front-end sample. The sample email, password and code are printed on the sign-in screen itself and are defined in `src/screens/Auth.jsx`.

**There is no backend yet.** All data comes from `src/data/sample.js` and lives in memory, so changes reset on reload. Sign-in, MFA, the audit log and every admin action are simulated in the browser and must be replaced with real API calls before this is used with real accounts.

## Layout

| Path | What it holds |
|---|---|
| `index.html` | Vite entry page |
| `src/main.jsx` | Entry: styles, runtime, screens, then the React root |
| `src/App.jsx` | App shell and the route outlet |
| `src/components/` | Shared components: `Shell` (sidebar, top bar, tab bar), `Icon`, `Lq` (liquid button), `Select`, `Count`, `SheetHost`, `AlertsSheet` |
| `src/screens/` | One file per screen; each registers its route(s) |
| `src/lib/core.js` | Runtime: hash router (`#name` or `#name-param`), store, audit log, sheets, toasts, formatting helpers |
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
