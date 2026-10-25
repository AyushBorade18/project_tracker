import React from "react";

interface State { error: Error | null }

/** If something unexpected breaks while rendering, show a calm recovery screen instead of a blank page. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Hook for an error-reporting service (Sentry etc.) if you add one later.
    console.error("ProjectTrack crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-4xl font-semibold tracking-wide">Something went wrong</h1>
          <p className="mt-3 text-sm text-muted">
            The page hit an unexpected problem. Your work is saved in the database, so nothing is lost. Reload to continue.
          </p>
          <pre className="mt-4 max-h-28 overflow-auto rounded-md border border-line bg-surface2 p-3 text-left text-xs text-muted">{this.state.error.message}</pre>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-90">Reload</button>
            <button type="button" onClick={() => this.setState({ error: null })} className="rounded-md border border-line bg-surface2 px-4 py-2 text-sm font-medium">Try again</button>
          </div>
        </div>
      </div>
    );
  }
}
