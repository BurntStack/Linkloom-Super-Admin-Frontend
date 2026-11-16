import { useLayoutEffect, useRef } from 'react';

/* <select class="select"> with the custom listbox from lib/ui-select.js. React owns the <select> and its wrapper;
   the enhancer adds the chevron and (on fine pointers) the trigger button inside the wrapper. */
export default function Select({ className = 'select', children, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const u = ref.current && ref.current._ui; if (u && u.sync) u.sync(); });   // keep the trigger in step with React
  return <span className="ui-sel"><select className={className} ref={ref} {...rest}>{children}</select></span>;
}
