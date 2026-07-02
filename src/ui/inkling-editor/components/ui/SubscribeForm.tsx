import clsx from 'clsx'

import { Button } from '@/ui/inkling-editor/components/ui/Button'

export function SubscribeForm({
  dataTestId,
  placeholder,
  value,
  buttonSize,
  buttonText,
  buttonStyle,
  onChange,
  onFocus,
  onBlur,
  disabled,
}: {
  dataTestId?: string
  placeholder?: string
  value?: string
  buttonSize?: 'small' | 'medium' | 'large'
  buttonText?: string
  buttonStyle?: React.CSSProperties
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onFocus?: () => void
  onBlur?: () => void
  disabled?: boolean
}) {
  const onChangeWrapper = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e)
    }
  }

  return (
    <div
      className={clsx(
        'rounded-md border-grey-500/30 bg-white relative flex border',
        buttonSize === 'large' ? 'p-[3px]' : 'p-[2px]',
      )}
    >
      <input
        className={clsx(
          'bg-white px-4 py-2 font-sans font-normal text-grey-900 relative w-full focus-visible:outline-none',
          buttonSize === 'small' && 'h-10 text-md leading-[4rem]',
          buttonSize === 'medium' && 'h-11 text-[1.6rem] leading-[4.4rem]',
          buttonSize === 'large' && 'h-12 text-lg leading-[4.8rem]',
        )}
        defaultValue={value}
        placeholder={placeholder}
        tabIndex={disabled ? -1 : undefined}
        readOnly
        onBlur={onBlur}
        onChange={onChangeWrapper}
        onFocus={onFocus}
      />
      <Button
        dataTestId={dataTestId}
        disabled={disabled}
        placeholder=""
        size={buttonSize}
        style={buttonStyle}
        value={buttonText}
      />
    </div>
  )
}
