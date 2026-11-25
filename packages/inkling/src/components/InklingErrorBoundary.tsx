import { useInklingHostEssentials } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'
import { type ReactNode, type ErrorInfo, Component } from 'react'
interface InklingErrorBoundaryInnerProps {
  children?: ReactNode
  fallback: ReactNode
  onError: (error: unknown, info: ErrorInfo) => void
}

class InklingErrorBoundaryInner extends Component<InklingErrorBoundaryInnerProps, { error: unknown }> {
  state = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError(error, info)
  }

  render() {
    if (this.state.error !== null) {
      return this.props.fallback
    }
    return this.props.children
  }
}

export default function InklingErrorBoundary({ children }: { children: ReactNode }) {
  const { onError } = useInklingHostEssentials()
  const labels = useInklingLabels()

  return (
    <InklingErrorBoundaryInner
      fallback={<div className="border-red border p-2">{labels['error.boundary']}</div>}
      onError={onError}
    >
      {children}
    </InklingErrorBoundaryInner>
  )
}
