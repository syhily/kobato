import React from 'react'

export interface ToggleProps {
  isChecked?: boolean
  // oxlint-disable-next-line typescript/no-explicit-any
  onChange?: (...args: any[]) => void
  label?: string
  description?: string
  dataTestId?: string
}

export function Toggle({ isChecked = false, onChange, dataTestId }: ToggleProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    onChange?.(event.target.checked)
  }

  return (
    <label className="relative inline-flex cursor-pointer items-center" data-testid={dataTestId}>
      <input checked={isChecked} className="size-0 opacity-0" type="checkbox" onChange={handleChange} />
      <span
        className={`block h-6 w-10 rounded-full transition-colors ${isChecked ? 'bg-green' : 'bg-grey-300 dark:bg-grey-700'}`}
      >
        <span
          className={`block size-4 translate-y-1 rounded-full bg-white transition-transform ${isChecked ? 'translate-x-5' : 'translate-x-1'}`}
        />
      </span>
    </label>
  )
}
