import type React from 'react'

import { useInklingSelectedCardContext } from '@/ui/inkling-editor/context/InklingSelectedCardContext'

export function ActionToolbar({
  isVisible,
  children,
  ...props
}: {
  isVisible?: boolean
  children?: React.ReactNode
  [key: string]: unknown
}) {
  const { isDragging } = useInklingSelectedCardContext()

  if (isVisible && !isDragging) {
    return (
      <div
        className="not-inkling-prose pointer-events-none absolute top-[-46px] left-1/2 z-[1000] -translate-x-1/2"
        {...props}
      >
        {children}
      </div>
    )
  }
}
