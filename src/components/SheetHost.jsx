import { createPortal } from 'react-dom';
import { useSheets } from '../lib/hooks.js';

/* Renders the React body of every open sheet into the sheet element that core.js put on <body>. */
export default function SheetHost() {
  return useSheets().map(p => createPortal(p.node, p.el, String(p.key)));
}
