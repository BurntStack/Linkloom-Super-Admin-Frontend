import { useLayoutEffect, useRef } from 'react';
import { mo } from '../lib/mo.js';

/* A screen, or part of one, that has no backend endpoint yet. It says so plainly and names what it needs,
   instead of showing records that are not real. */
export function NotConnectedNote({ what, needs = [] }) {
  return (
    <div className="empty">
      <img src="assets/step-04-orbit.svg" width="160" height="117" alt="" />
      <p className="t-h3">{`${what} is not connected yet.`}</p>
      <p className="muted">The Linkloom backend does not have the endpoints for it yet, so there is nothing real to show here.</p>
      {needs.length ? <p className="muted">{'Needs: '}{needs.map((n, i) => <span key={n}>{i ? ', ' : ''}<code>{n}</code></span>)}</p> : null}
    </div>
  );
}

export default function NotConnected({ eyebrow, title, what, needs }) {
  const root = useRef(null);
  useLayoutEffect(() => { mo('stagger', [...root.current.children]); }, []);
  return (
    <div className="view-in" ref={root}>
      <header className="page-h"><div className="t">{eyebrow ? <p className="t-eyebrow">{eyebrow}</p> : null}<h1 className="t-h1">{title}</h1></div></header>
      <NotConnectedNote what={what || title} needs={needs} />
    </div>
  );
}
