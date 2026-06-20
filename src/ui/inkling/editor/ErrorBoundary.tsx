import { Component, type ErrorInfo, type ReactNode } from 'react'

import { reportEditorError } from '@/ui/inkling/editor/error-report'

interface EditorErrorBoundaryProps {
  context: string
  children: ReactNode
  /** Optional fallback. Defaults to a red error box with the message. */
  fallback?: (error: Error, retry: () => void) => ReactNode
}

interface EditorErrorBoundaryState {
  error: Error | null
}

/**
 * React error boundary for the Inkling editor.
 *
 * Without this, a single card's `decorate()` throwing (e.g. a MathPreview
 * oRPC call failing, a MusicCard meta fetch error) crashes the entire
 * LexicalComposer and blanks the editor. This boundary catches render errors
 * from its subtree and shows a compact fallback so the rest of the editor
 * stays usable.
 *
 * Mirrors Ghost Koenig's `KoenigErrorBoundary` pattern.
 */
export class EditorErrorBoundary extends Component<EditorErrorBoundaryProps, EditorErrorBoundaryState> {
  state: EditorErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): EditorErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportEditorError(error, this.props.context)
    // `info.componentStack` is useful for debugging but we don't log it
    // separately — reportEditorError already captures the error.
    if (import.meta.env.DEV) {
      console.warn(`[${this.props.context}] component stack:`, info.componentStack)
    }
  }

  retry = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (error !== null) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback(error, this.retry)
      }
      return (
        <div
          className="inkling-error-boundary flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <span>此区域渲染失败</span>
            <code className="max-w-md truncate font-mono text-xs opacity-70">{error.message}</code>
            <button
              type="button"
              onClick={this.retry}
              className="rounded border border-destructive/30 px-2 py-0.5 text-xs hover:bg-destructive/10"
            >
              重试
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
