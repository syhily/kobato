import React from 'react'
import { createPortal } from 'react-dom'

import InklingUiPrefsContext from '@/context/InklingUiPrefsContext'

function Portal({
  children,
  to,
  className,
  'data-testid': dataTestId,
}: {
  children?: React.ReactNode
  to?: HTMLElement
  className?: string
  'data-testid'?: string
}) {
  const { darkMode } = React.useContext(InklingUiPrefsContext)

  const container = to || document.body

  function cancelEvents(event: React.MouseEvent) {
    // prevent card from losing selection when interacting with element in portal
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
