import React from 'react'

import { useInklingHostEssentials } from '@/context/InklingHostIntegrationContext'
import { useInklingLabels } from '@/hooks/useInklingLabels'

interface InklingErrorBoundaryInnerProps {
  children?: React.ReactNode
  fallback: React.ReactNode
  onError: (error: unknown, info: React.ErrorInfo) => void
}

// The error boundary itself (replacing react-error-boundary with the ~40
// lines it wraps): catch render errors, report through the host's onError
// sink, and render the fallback until the boundary remounts.
class InklingErrorBoundaryInner extends React.Component<InklingErrorBoundaryInnerProps, { error: unknown }> {
  state = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    this.props.onError(error, info)
  }

  render() {
    if (this.state.error !== null) {
      return this.props.fallback
    }
    return this.props.children
  }
}

export default function InklingErrorBoundary({ children }: { children: React.ReactNode }) {
  const { onError } = useInklingHostEssentials()
  const labels = useInklingLabels()

  return (
    <InklingErrorBoundaryInner
      fallback={<div className="border border-red p-2">{labels['error.boundary']}</div>}
      onError={onError}
    >
      {children}
    </InklingErrorBoundaryInner>
  )
}
