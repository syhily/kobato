import type { InputHTMLAttributes, ChangeEvent } from 'react'
export interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'placeholder' | 'readOnly' | 'disabled' | 'maxLength' | 'name' | 'className'
> {
  value?: string
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  readOnly?: boolean
  disabled?: boolean
  maxLength?: string | number
  name?: string
  className?: string
  'data-testid'?: string
  'data-inkling-dnd-disabled'?: boolean | string
  'data-inkling-file-card'?: boolean | string
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
  const parsedMaxLength = maxLength === undefined || maxLength === '' ? undefined : Number(maxLength)

  return (
    <input
      className={className}
      data-testid={dataTestId}
      disabled={disabled}
      maxLength={parsedMaxLength !== undefined && Number.isFinite(parsedMaxLength) ? parsedMaxLength : undefined}
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
