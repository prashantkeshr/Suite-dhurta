import { Component, type ReactNode } from 'react';
import { ErrorState } from '@/components/ui/states';
import { t } from '@/i18n';

/** Contains a failure to one tool so the rest of the app keeps working. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: unknown) {
    console.error('[tool error]', error);
  }

  render() {
    if (this.state.error) {
      const isChunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(String((this.state.error as Error)?.message));
      return (
        <ErrorState
          error={this.state.error}
          friendly={
            isChunk
              ? {
                  title: t('tool.loadFailed'),
                  reasons: ['You may be offline and this tool has not been cached yet', 'The app was updated since this page was opened'],
                  suggestions: ['Reload the page', 'Check your connection'],
                  technical: String((this.state.error as Error)?.message),
                }
              : undefined
          }
          onRetry={() => (isChunk ? location.reload() : this.setState({ error: null }))}
        />
      );
    }
    return this.props.children;
  }
}
