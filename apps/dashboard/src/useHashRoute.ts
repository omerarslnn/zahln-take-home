import { useMemo, useSyncExternalStore } from 'react';
import { parseRoute, type Route } from './routing';

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

const currentHash = () => window.location.hash;

/** The route in the address bar's hash; links are plain anchors, so back/forward just work. */
export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, currentHash);
  return useMemo(() => parseRoute(hash), [hash]);
}

export function navigate(href: string): void {
  window.location.hash = href;
}
