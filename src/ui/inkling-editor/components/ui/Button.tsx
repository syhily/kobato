import React from 'react'

export interface ButtonProps {
  children?: React.ReactNode
  className?: string
  color?: string
  dataTestId?: string
  disabled?: boolean
  href?: string
  icon?: string
  isActive?: boolean
  label?: string
  placeholder?: string
  size?: 'small' | 'medium' | 'large'
  style?: React.CSSProperties
  target?: string
  type?: 'button' | 'submit' | 'reset'
  value?: string
  width?: 'auto' | 'full'
  onClick?: (event: React.MouseEvent) => void
  [key: string]: unknown
}

export function Button({
  children,
  className,
  color,
  dataTestId,
  disabled,
  href,
  icon,
  isActive,
  label,
  placeholder,
  size = 'medium',
  style,
  target,
  type = 'button',
  value,
  width,
  onClick,
  ...props
}: ButtonProps) {
  const sizeClasses = {
    small: 'px-2 py-1 text-xs',
    medium: 'px-3 py-1.5 text-sm',
    large: 'px-4 py-2 text-base',
  }

  const buttonClasses = `
        inline-flex items-center justify-center rounded-md font-medium transition-colors
        ${sizeClasses[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${color === 'white' ? 'bg-white text-black border border-grey-300 hover:bg-grey-100' : ''}
        ${color === 'grey' ? 'bg-grey-200 text-grey-700 hover:bg-grey-300 dark:bg-grey-800 dark:text-grey-300 dark:hover:bg-grey-700' : ''}
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
        {...props}
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
      {...props}
    >
      {children || value || label || placeholder}
    </button>
  )
}
