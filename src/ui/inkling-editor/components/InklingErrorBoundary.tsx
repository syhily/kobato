import React from 'react'
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary'

import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'

export default function InklingErrorBoundary({ children }: { children: React.ReactNode }) {
  const { onError } = React.useContext(InklingComposerContext)

  return (
    <ReactErrorBoundary fallback={<div className="border-red border p-2">An error was thrown.</div>} onError={onError}>
      {children}
    </ReactErrorBoundary>
  )
}
