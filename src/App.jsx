import { useLayoutEffect, useRef } from 'react';
import L from './lib/core.js';
import { useRoute } from './lib/hooks.js';
import { Sidebar, TopBar, TabBar } from './components/Shell.jsx';
import SheetHost from './components/SheetHost.jsx';

let routed = false;

/* The element a screen renders into. It is keyed by the route's nonce, so every navigation starts from a fresh
   element; after the screen is in the DOM the route's entrance runs (title, scroll, focus, motion). */
function Outlet({ route }) {
  const { view, name, param, focus } = route;
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    let cleanup = null;
    if (!view.Component) {            // a screen that still draws itself (not yet a component)
      try { cleanup = view.render(el, param) || null; } catch (e) { console.error(e); el.innerHTML = '<div class="empty"><p class="t-h2">This screen could not load.</p><p class="muted">Reload the page to try again.</p></div>'; }
      L.liquid(el);
    }
    document.title = (view.title ? (typeof view.title === 'function' ? view.title(param) : view.title) + ' · ' : '') + 'Linkloom';
    if (!focus) window.scrollTo({ top: 0, behavior: 'auto' });
    if (routed) el.focus({ preventScroll: true });
    routed = true;
    L.motion.enter(el, { name });
    return () => { if (cleanup) { try { cleanup(); } catch (e) {} } };
  }, []);
  const C = view.Component;
  const body = C ? <C param={param} /> : null;
  return focus
    ? <div id="focusRoot" tabIndex={-1} ref={ref}>{body}</div>
    : <main className="view light" id="view" tabIndex={-1} ref={ref}>{body}</main>;
}

export default function App() {
  const route = useRoute();
  if (!route) return null;
  const nav = route.view.nav || route.name;
  const skip = e => { e.preventDefault(); const v = document.getElementById('view'); v && v.focus(); };
  return (
    <>
      <a className="skip" href="#view" data-skip="" onClick={skip}>Skip to content</a>
      <div id="app" className="app" hidden={route.focus}>
        <Sidebar nav={nav} />
        <div className="main">
          <TopBar />
          {route.focus ? <main className="view light" id="view" tabIndex={-1}></main> : <Outlet key={route.nonce} route={route} />}
        </div>
        <TabBar nav={nav} />
      </div>
      {route.focus ? <Outlet key={route.nonce} route={route} /> : <div id="focusRoot" hidden></div>}
      <SheetHost />
    </>
  );
}
