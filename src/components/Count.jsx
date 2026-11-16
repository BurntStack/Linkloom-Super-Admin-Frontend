import { useLayoutEffect, useRef } from 'react';
import { mo } from '../lib/mo.js';

/* A number the motion layer may tick into place. The element's text belongs to the motion layer (it swaps in
   per-digit spans while ticking), so React renders the element empty and never touches its children.
   It ticks once, when the screen arrives; a later value is simply shown. */
export default function Count({ value, fmt, as: Tag = 'span', animate = true, ...rest }) {
  const el = useRef(null), first = useRef(true);
  useLayoutEffect(() => {
    if (first.current && animate && value) mo('count', el.current, value, fmt);
    else el.current.textContent = fmt ? fmt(value) : String(value);
    first.current = false;
  }, [value]);
  return <Tag key={String(value)} ref={el} {...rest} />;
}
