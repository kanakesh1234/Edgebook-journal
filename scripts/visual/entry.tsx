import "@fontsource-variable/inter/opsz.css";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/instrument-serif";
import { Component, createElement, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/toast";
import { routes } from "./routes.generated";
import { ParamsContext, RedirectSignal, navigate, usePathname } from "./shims/next-navigation";

/** Catches next/navigation redirect()/notFound() thrown while rendering a page. */
class Boundary extends Component<{ children: ReactNode; resetKey: string }, { to: string | null }> {
  state = { to: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    if (e instanceof RedirectSignal) return { to: e.url };
    throw e;
  }
  componentDidUpdate(p: { resetKey: string }) { if (p.resetKey !== this.props.resetKey && this.state.to) this.setState({ to: null }); }
  componentDidCatch(e: unknown) { if (e instanceof RedirectSignal) queueMicrotask(() => navigate(e.url, true)); }
  render() { return this.state.to ? null : this.props.children; }
}

function App() {
  const pathname = usePathname();
  let match: { route: (typeof routes)[number]; params: Record<string, string> } | null = null;
  for (const route of routes) {
    const m = route.pattern.exec(pathname);
    if (m) { match = { route, params: Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) }; break; }
  }
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!match) return <div id="not-found">404 — {pathname}</div>;
  let tree: ReactNode = createElement(match.route.page as never, { params: Promise.resolve(match.params) });
  for (const C of [...match.route.chain].reverse()) tree = createElement(C, null, tree);
  return (
    <ParamsContext.Provider value={match.params}>
      <Boundary resetKey={pathname}>{tree}</Boundary>
      <Toaster />
      <i id="harness-ready" hidden={!ready} />
    </ParamsContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
