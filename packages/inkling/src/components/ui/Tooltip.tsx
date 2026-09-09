import React from 'react'

export interface TooltipProps {
  label?: string
  shortcutKeys?: string | string[]
  children?: React.ReactNode
}

export function Tooltip({ label, shortcutKeys, children }: TooltipProps) {
  if (!label) {
    return null
  }

  return (
    <span
      className="bg-grey-950 dark:bg-grey-100 dark:text-grey-950 pointer-events-none absolute top-full left-1/2 z-50 mt-1 hidden -translate-x-1/2 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-md group-hover:block"
      role="tooltip"
    >
      {label}
      {shortcutKeys && <span className="ml-1 opacity-70">{shortcutKeys}</span>}
      {children}
    </span>
  )
}
