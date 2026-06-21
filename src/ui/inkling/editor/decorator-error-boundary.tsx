import type { JSX, ReactNode } from 'react'

import { Component } from 'react'

import { reportEditorError } from '@/ui/inkling/editor/error-report'

/**
 * Error boundary matching Lexical's `ErrorBoundaryType`
 * (`{ children, onError }`) — the shape required by `<RichTextPlugin>`'s
 * `ErrorBoundary` prop, which wraps each card's `decorate()` output.
 *
 * Without this, a throwing card (e.g. a MathPreview fetch failure inside a
 * math card, or a bad image URL) would crash the whole editor. With it, the
 * single card shows a compact fallback and the rest of the editor stays
 * usable. Mirrors Ghost Koenig's `KoenigErrorBoundary`.
 *
 * This is intentionally a distinct, minimal component from
 * `EditorErrorBoundary` (which guards the editor shell and takes a
 * `context` label) so it can satisfy the exact `ErrorBoundaryType` contract
 * without forcing every call site to pass a `context` string.
 */
interface DecoratorErrorBoundaryProps {
  children: JSX.Element
  onError: (error: Error) => void
  fallback?: (error: Error, retry: () => void) => ReactNode
}

interface DecoratorErrorBoundaryState {
  error: Error | null
}

export class DecoratorErrorBoundary extends Component<DecoratorErrorBoundaryProps, DecoratorErrorBoundaryState> {
  state: DecoratorErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): DecoratorErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    reportEditorError(error, 'card-decorator')
    this.props.onError(error)
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
          className="inkling-card-error flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          role="alert"
        >
          <span>卡片渲染失败</span>
        </div>
      )
    }
    return this.props.children
  }
}
