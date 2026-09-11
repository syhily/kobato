import React from 'react'

import { Tooltip } from '@/inkling/components/ui/Tooltip'
import { usePreviousFocus } from '@/inkling/hooks/usePreviousFocus'

export interface ButtonGroupButton {
  label?: string
  name: string
  Icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  dataTestId?: string
  ariaLabel?: string
}

export interface ButtonGroupProps {
  buttons?: ButtonGroupButton[]
  selectedName?: string
  onClick?: (name: string) => void
  hasTooltip?: boolean
}

export function ButtonGroup({ buttons = [], selectedName, onClick, hasTooltip = true }: ButtonGroupProps) {
  return (
    <div className="flex">
      <ul
        className="bg-grey-100 dark:bg-grey-900 flex items-center justify-evenly rounded-lg font-sans text-md font-normal text-white"
        role="menubar"
      >
        {buttons.map(({ label, name, Icon, dataTestId, ariaLabel }) => (
          <ButtonGroupIconButton
            key={`${name}-${label}`}
            Icon={Icon}
            ariaLabel={ariaLabel}
            dataTestId={dataTestId}
            hasTooltip={hasTooltip}
            label={label}
            name={name}
            selectedName={selectedName}
            onClick={onClick}
          />
        ))}
      </ul>
    </div>
  )
}

interface ButtonGroupIconButtonProps {
  label?: string
  name: string
  selectedName?: string
  onClick?: (name: string) => void
  Icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  hasTooltip?: boolean
  dataTestId?: string
  ariaLabel?: string
}

export function ButtonGroupIconButton({
  label,
  name,
  selectedName,
  onClick,
  Icon,
  hasTooltip,
  dataTestId,
  ariaLabel,
}: ButtonGroupIconButtonProps) {
  const isActive = name === selectedName

  const { handleMousedown, handleClick } = usePreviousFocus(onClick ? () => onClick(name) : () => {}, name)

  return (
    <li className="mb-0">
      <button
        aria-checked={isActive}
        aria-label={ariaLabel ?? label}
        className={`group relative flex h-7 w-8 cursor-pointer items-center justify-center rounded-lg text-black dark:text-white ${isActive ? 'border-grey-300 dark:border-grey-800 dark:bg-grey-950 border bg-white shadow-xs' : ''} ${Icon ? '' : 'text-[1.3rem] font-bold'}`}
        data-testid={dataTestId}
        role="menuitemradio"
        type="button"
        onClick={handleClick}
        onMouseDown={handleMousedown}
      >
        {Icon ? <Icon className="size-4 stroke-2" /> : label}
        {Icon && label && hasTooltip && <Tooltip label={label} />}
      </button>
    </li>
  )
}
