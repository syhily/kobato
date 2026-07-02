import React, { useState } from 'react'

import PlusIcon from '@/ui/inkling-editor/assets/icons/plus.svg?react'
import { Tooltip } from '@/ui/inkling-editor/components/ui/Tooltip'
import { useClickOutside } from '@/ui/inkling-editor/hooks/useClickOutside'
import { usePreviousFocus } from '@/ui/inkling-editor/hooks/usePreviousFocus'

interface ColorOptionButton {
  name: string
  label?: string
  color?: string
}

interface ColorOptionButtonsProps {
  buttons?: ColorOptionButton[]
  selectedName?: string
  onClick: (name: string) => void
}

export function ColorOptionButtons({ buttons = [], selectedName, onClick }: ColorOptionButtonsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const componentRef = React.useRef<HTMLDivElement | null>(null)

  const selectedButton = buttons.find((button) => button.name === selectedName)

  // Close the swatch popover when clicking outside of it
  useClickOutside(isOpen, componentRef, () => setIsOpen(false))

  return (
    <div ref={componentRef} className="relative">
      <button
        className={`relative size-6 cursor-pointer rounded-full ${selectedName ? 'p-[2px]' : 'border border-grey-200 dark:border-grey-800'}`}
        data-testid="color-options-button"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedName && (
          <div
            className="absolute inset-0 rounded-full bg-clip-content p-[3px]"
            style={{
              background:
                'conic-gradient(hsl(360,100%,50%),hsl(315,100%,50%),hsl(270,100%,50%),hsl(225,100%,50%),hsl(180,100%,50%),hsl(135,100%,50%),hsl(90,100%,50%),hsl(45,100%,50%),hsl(0,100%,50%))',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              maskComposite: 'exclude',
            }}
          />
        )}
        <span
          className={`${selectedButton?.color || ''} block size-full rounded-full border-2 border-white dark:border-grey-950`}
        ></span>
      </button>

      {/* Color options popover */}
      {isOpen && (
        <div
          className="absolute -right-3 bottom-full z-10 mb-2 rounded-lg bg-white px-3 py-2 shadow dark:bg-grey-900"
          data-testid="color-options-popover"
        >
          <div className="flex">
            <ul className="flex w-full items-center justify-between rounded-md font-sans text-md font-normal text-white">
              {buttons.map((button: ColorOptionButton) => {
                const { label, name, color } = button
                return name !== 'image' ? (
                  <ColorButton
                    key={`${name}-${label}`}
                    color={color}
                    data-testid={`color-options-${name}-button`}
                    label={label}
                    name={name}
                    selectedName={selectedName}
                    onClick={(title) => {
                      onClick(title)
                      setIsOpen(false)
                    }}
                  />
                ) : (
                  <li
                    key="background-image"
                    className={`mb-0 flex size-[1.875rem] cursor-pointer items-center justify-center rounded-full border-2 ${selectedName === name ? 'border-green' : 'border-transparent'}`}
                    data-testid="background-image-color-button"
                    onClick={() => onClick(name)}
                  >
                    <span className="flex size-6 items-center justify-center rounded-full border border-1 border-black/5">
                      <PlusIcon className="size-3 stroke-grey-700 stroke-2 dark:stroke-grey-500 dark:group-hover:stroke-grey-100" />
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

interface ColorButtonProps {
  onClick: (name: string) => void
  label?: string
  name: string
  color?: string
  selectedName?: string
}

export function ColorButton({ onClick, label, name, color, selectedName }: ColorButtonProps) {
  const isActive = name === selectedName

  const { handleMousedown, handleClick } = usePreviousFocus(onClick as (name?: string) => void, name)
  return (
    <li className="mb-0">
      <button
        aria-label={label}
        className={`group relative flex size-6 cursor-pointer items-center justify-center rounded-full border-2 ${isActive ? 'border-green' : 'border-transparent'}`}
        data-testid={`color-picker-${name}`}
        type="button"
        onClick={handleClick}
        onMouseDown={handleMousedown}
      >
        <span className={`${color} size-[1.125rem] rounded-full border`}></span>
        <Tooltip label={label} />
      </button>
    </li>
  )
}
