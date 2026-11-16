# Linkloom Super Admin — Frontend

The Linkloom admin console: verification, accounts, marketplace, moderation, orders and escrow, financials, security and the audit log.

It is a static, no-build front end written in plain HTML, CSS and JavaScript. Animations use GSAP 3.12.5 (with ScrollTrigger), loaded from cdnjs with integrity hashes. Fonts are Faculty Glyphic, Figtree and Mynerve from Google Fonts.

## Run it

```bash
npm run dev
```

Then open http://localhost:5173. Any static file server works, for example `python3 -m http.server 5173`. Opening `index.html` directly from disk also works.

## Sign in

The sign-in screen (email and password, then a 6-digit authenticator code) is a front-end sample. The sample email, password and code are printed on the sign-in screen itself and are defined in `screens/auth.js`.

**There is no backend yet.** All data comes from `data.js` and lives in memory, so changes reset on reload. Sign-in, MFA, the audit log and every admin action are simulated in the browser and must be replaced with real API calls before this is used with real accounts.

## Layout

| Path | What it holds |
|---|---|
| `index.html` | App shell: sidebar, top bar, phone tab bar, script order |
| `core.css` | Design tokens and shared components |
| `core.js` | Router (`#name` or `#name-param`), store, helpers, overlays, icons |
| `data.js` | Sample data (`window.LLD_DATA`); money is integer paise |
| `motion.css`, `motion.js` | Animation system (respects `prefers-reduced-motion`) |
| `ui-select.js` | Custom select control |
| `screens/` | One `.js` and `.css` pair per screen; each calls `LLD.register()` |
| `assets/` | SVG artwork and icons |

## Screens

`#login`, `#home` (Command), `#verify`, `#accounts`, `#marketplace`, `#moderation`, `#orders`, `#finance`, `#audit`, `#security`.
