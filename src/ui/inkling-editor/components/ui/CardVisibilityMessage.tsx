import React from 'react'

export interface CardVisibilityMessageProps {
  message?: string
  className?: string
  dataTestId?: string
}

export function CardVisibilityMessage({ message, className, dataTestId }: CardVisibilityMessageProps) {
  if (!message) {
    return null
  }

  return (
    <div className={`text-sm text-grey-600 dark:text-grey-400 ${className ?? ''}`} data-testid={dataTestId}>
      {message}
    </div>
  )
}
