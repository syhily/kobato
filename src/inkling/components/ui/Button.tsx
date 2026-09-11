import React from 'react'

export interface ButtonProps {
  children?: React.ReactNode
  className?: string
  color?: 'white' | 'grey' | 'black' | 'accent'
  dataTestId?: string
  disabled?: boolean
  href?: string
  label?: string
  placeholder?: string
  rounded?: boolean
  shrink?: boolean
  size?: 'small' | 'medium' | 'large'
  style?: React.CSSProperties
  target?: string
  type?: 'button' | 'submit' | 'reset'
  value?: string
  width?: 'auto' | 'full'
  onClick?: (event: React.MouseEvent) => void
}

export function Button({
  children,
  className,
  color = 'accent',
  dataTestId,
  disabled,
  href,
  label,
  placeholder,
  rounded = true,
  shrink = false,
  size = 'medium',
  style,
  target,
  type = 'button',
  value,
  width,
  onClick,
}: ButtonProps) {
  const sizeClasses = {
    small: 'px-2 py-1 text-xs',
    medium: 'px-3 py-1.5 text-sm',
    large: 'px-4 py-2 text-base',
  }

  const buttonClasses = `
        not-inkling-prose inline-flex items-center justify-center font-medium transition-colors
        ${rounded ? 'rounded-md' : ''}
        ${sizeClasses[size]}
        ${shrink ? '' : 'shrink-0'}
        ${value || children || label ? 'opacity-100' : 'opacity-50'}
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
        ${color === 'white' ? 'bg-white text-black border border-grey-300 hover:bg-grey-100' : ''}
        ${color === 'grey' ? 'bg-grey-200 text-grey-700 hover:bg-grey-300 dark:bg-grey-800 dark:text-grey-300 dark:hover:bg-grey-700' : ''}
        ${color === 'black' ? 'bg-black text-white' : ''}
        ${color === 'accent' ? 'bg-accent text-white' : ''}
        ${width === 'full' ? 'w-full' : ''}
        ${className ?? ''}
    `

  if (href) {
    return (
      <a
        className={buttonClasses}
        data-testid={dataTestId}
        href={href}
        rel="noopener noreferrer"
        style={style}
        target={target ?? '_blank'}
        onClick={onClick}
      >
        {children || value || label || placeholder}
      </a>
    )
  }

  return (
    <button
      className={buttonClasses}
      data-testid={dataTestId}
      disabled={disabled}
      style={style}
      // oxlint-disable-next-line react/button-has-type
      type={type}
      onClick={onClick}
    >
      {children || value || label || placeholder}
    </button>
  )
}
