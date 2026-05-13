import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LanguageContext } from '../i18n/context';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <LanguageContext.Consumer>
          {(ctx) => {
            const t = ctx?.t || ((s: string) => s);
            return (
              <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
                <div className="max-w-md w-full bg-gray-900 border border-red-500/30 rounded-2xl p-8 text-center">
                  <div className="text-red-400 text-5xl mb-4">⚠</div>
                  <h1 className="text-white font-black text-xl mb-2">{t('common.unexpectedError')}</h1>
                  <p className="text-gray-400 text-sm mb-6 font-mono">
                    {this.state.error?.message ?? t('common.unknownError')}
                  </p>
                  <button
                    onClick={() => this.setState({ hasError: false, error: null })}
                    className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-lg transition-colors"
                  >
                    {t('common.retry')}
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="ml-3 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded-lg transition-colors"
                  >
                    {t('common.reloadPage')}
                  </button>
                </div>
              </div>
            );
          }}
        </LanguageContext.Consumer>
      );
    }
    return this.props.children;
  }
}
