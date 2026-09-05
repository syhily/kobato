import React from 'react'

export interface ProgressBarProps {
  style?: React.CSSProperties
  bgStyle?: 'transparent' | 'default'
}

export function ProgressBar({ style, bgStyle = 'default' }: ProgressBarProps) {
  return (
    <div
      className={`h-1 w-full ${bgStyle === 'transparent' ? 'bg-transparent' : 'bg-grey-200 dark:bg-grey-800'}`}
      role="progressbar"
    >
      <div className="h-full bg-green transition-all duration-300" style={style} />
    </div>
  )
}
