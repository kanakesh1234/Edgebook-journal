/**
 * Test-only stand-in for next/navigation. The real app runs on Next.js; this
 * harness renders the real components in a plain browser bundle, so routing is
 * emulated with the History API. Only the hooks the app actually uses exist.
 */
import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};
if (typeof window !== "undefined") window.addEventListener("popstate", emit);

export function navigate(url: string, replace = false) {
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  emit();
  window.scrollTo(0, 0);
}

export const ParamsContext = createContext<Record<string, string>>({});

export function usePathname() {
  return useSyncExternalStore(subscribe, () => location.pathname, () => "/");
}
export function useSearchParams() {
  const s = useSyncExternalStore(subscribe, () => location.search, () => "");
  return useMemo(() => new URLSearchParams(s), [s]);
}
export function useParams() {
  return useContext(ParamsContext);
}

const router = {
  push: (u: string) => navigate(u),
  replace: (u: string) => navigate(u, true),
  back: () => history.back(),
  forward: () => history.forward(),
  refresh: () => emit(),
  prefetch: () => undefined,
};
export const useRouter = () => router;

export class RedirectSignal { constructor(public url: string) {} }
export function redirect(url: string): never { throw new RedirectSignal(url); }
export function notFound(): never { throw new RedirectSignal("/__404"); }
