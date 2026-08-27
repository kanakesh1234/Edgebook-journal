"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Workspace ErrorBoundary — a runtime error in one page must never blank
 * the app or show an uncaught Next.js error screen. Renders a controlled
 * recovery panel with the option to reload.
 */
interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Keep a console trace for debugging without crashing the tree.
    console.error("[EdgeBook] Runtime error caught by boundary:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel mx-auto mt-16 max-w-md p-6 text-center">
        <p className="font-display text-lg font-semibold text-ink">Something went off-script.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          A component failed to render. Your journal data is safe. If this keeps happening, note
          what you clicked before it occurred.
        </p>
        <p className="mt-3 truncate rounded-control border border-line bg-raised/60 px-3 py-2 font-mono text-[11px] text-faint">
          {this.state.error.message || "Unknown error"}
        </p>
        <div className="mt-5 flex justify-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button variant="gold" size="sm" onClick={() => window.location.reload()}>
            Reload EdgeBook
          </Button>
        </div>
      </div>
    );
  }
}
