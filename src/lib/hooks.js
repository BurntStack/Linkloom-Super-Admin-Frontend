/* React bindings for the core runtime. */
import { useReducer, useSyncExternalStore } from 'react';
import L, { store, router } from './core.js';

/* Re-render whenever the store changes. Returns the state object (mutated in place by store.set). */
export function useStore() {
  useSyncExternalStore(store.on, () => store.version);
  return store.s;
}

/* The current route: { name, param, view, focus, nonce }. */
export function useRoute() {
  return useSyncExternalStore(router.on, () => router.current);
}

/* Sheets with React content, rendered by <SheetHost>. */
export function useSheets() {
  return useSyncExternalStore(L.sheets.on, () => L.sheets.list);
}

/* A plain "render again" for screens that keep their view state in a mutable object. */
export function useRerender() {
  return useReducer(n => n + 1, 0)[1];
}
