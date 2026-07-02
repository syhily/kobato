import React from 'react'

export interface TextInputProps {
  value?: string
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  readOnly?: boolean
  disabled?: boolean
  maxLength?: string | number
  name?: string
  className?: string
  'data-testid'?: string
  [key: string]: unknown
}

export function TextInput({
  value,
  onChange,
  placeholder,
  readOnly,
  disabled,
  maxLength,
  name,
  className,
  'data-testid': dataTestId,
  ...props
}: TextInputProps) {
  return (
    <input
      className={className}
      data-testid={dataTestId}
      disabled={disabled}
      maxLength={maxLength ? Number(maxLength) : undefined}
      name={name}
      placeholder={placeholder}
      readOnly={readOnly}
      type="text"
      value={value ?? ''}
      onChange={onChange}
      {...props}
    />
  )
}
