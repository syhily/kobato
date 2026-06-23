import { createPortal } from 'react-dom'

import { useKoenigComposerContext } from '@/ui/inkling/context/KoenigComposerContext'

/** Faithful copy of Koenig's Portal.jsx */
export function Portal({
  children,
  to,
  className,
  ...props
}: {
  children: React.ReactNode
  to?: HTMLElement
  className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  const { darkMode } = useKoenigComposerContext()

  const container = to ?? (typeof document !== 'undefined' ? document.body : null)
  if (!container) {
    return children
  }

  function cancelEvents(event: React.MouseEvent) {
    // prevent card from losing selection when interacting with element in portal
    event.stopPropagation()
  }

  return createPortal(
    <div
      className="koenig-lexical"
      style={{ width: 'fit-content' }}
      data-kg-portal
      onMouseDown={cancelEvents}
      {...props}
    >
      <div className={`${darkMode ? 'dark' : ''} ${className ?? ''}`}>{children}</div>
    </div>,
    container,
  )
}
