'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="glass-card rounded-2xl p-8 max-w-md space-y-4">
            <p className="text-2xl">⚠️</p>
            <h2 className="text-lg font-semibold text-slate-100">Something went wrong</h2>
            <p className="text-sm text-slate-400">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <button
              className="mt-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white transition-colors"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
