import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { type ReactNode, type MouseEvent, useContext } from 'react'
import { createPortal } from 'react-dom'

function Portal({
  children,
  to,
  className,
  'data-testid': dataTestId,
}: {
  children?: ReactNode
  to?: HTMLElement
  className?: string
  'data-testid'?: string
}) {
  const { darkMode } = useContext(InklingUiPrefsContext)

  const container = to || document.body

  function cancelEvents(event: MouseEvent) {
    event.stopPropagation()
  }

  return createPortal(
    <div
      className="inkling-lexical"
      style={{ width: 'fit-content' }}
      data-inkling-portal
      data-testid={dataTestId}
      onMouseDown={cancelEvents}
    >
      <div className={`${darkMode ? 'dark' : ''} ${className || ''}`}>{children}</div>
    </div>,
    container,
  )
}

export default Portal
