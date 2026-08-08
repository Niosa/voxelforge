import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-100 p-8">
          <div className="text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold text-red-400">Something went wrong</h1>
          <p className="max-w-xl text-center text-sm text-slate-400">
            An error occurred while loading the map. Check the browser console for details.
          </p>
          <pre className="max-w-2xl overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-red-300 border border-red-900">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-sky-600 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-500 transition"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
