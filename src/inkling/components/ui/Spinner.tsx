import React from 'react'

export interface SpinnerProps {
  size?: 'mini' | 'small' | 'medium'
}

export function Spinner({ size = 'medium' }: SpinnerProps) {
  const sizeClasses = {
    mini: 'size-3',
    small: 'size-4',
    medium: 'size-6',
  }

  return (
    <div
      className={`border-grey-200 border-t-green animate-spin rounded-full border-2 ${sizeClasses[size]}`}
      data-testid="spinner"
    />
  )
}
