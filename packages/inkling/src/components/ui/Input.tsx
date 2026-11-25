import { type ChangeEvent, type InputHTMLAttributes, useCallback, useEffect, useRef, useState } from 'react'
export const INPUT_CLASSES =
  'h-9 rounded-lg border border-grey-100 bg-grey-100 dark:bg-grey-900 dark:border-transparent dark:focus:border-green dark:hover:bg-grey-925 dark:focus:bg-grey-925 transition-colors px-3 py-1.5 font-sans text-sm font-normal text-grey-900 focus:border-green focus:bg-white focus:shadow-[0_0_0_0.2rem_rgba(48,207,67,.25)] focus-visible:outline-none dark:text-white dark:selection:bg-grey-800 placeholder:text-grey-500 md:h-[3.8rem] md:py-2 dark:placeholder:text-grey-700'

export function Input({
  autoFocus,
  className,
  dataTestId,
  value,
  onChange,
  ...props
}: {
  autoFocus?: boolean
  className?: string
  dataTestId?: string
  value?: string
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void
  'data-inkling-link-input'?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const shouldFocusOnUpdate = useRef(autoFocus)
  const [localValue, setLocalValue] = useState(value ?? '')

  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    setPrevValue(value)
    setLocalValue(value ?? '')
  }

  const onChangeWrapper = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setLocalValue(e.target.value)

      if (onChange) {
        onChange(e)
      }
    },
    [onChange],
  )

  useEffect(() => {
    if (shouldFocusOnUpdate.current) {
      const timeoutId = setTimeout(() => {
        if (inputRef.current) {
          shouldFocusOnUpdate.current = false
          inputRef.current.focus()
        }
      }, 0)

      return () => clearTimeout(timeoutId)
    }
  }, [])

  return (
    <>
      <div className="relative">
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          className={`relative w-full ${className || INPUT_CLASSES}`}
          data-testid={dataTestId}
          value={localValue}
          onChange={onChangeWrapper}
          {...props}
        />
      </div>
    </>
  )
}
