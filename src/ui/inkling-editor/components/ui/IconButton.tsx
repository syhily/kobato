import type React from 'react'

import clsx from 'clsx'

import { Tooltip } from '@/ui/inkling-editor/components/ui/Tooltip'

export function IconButton({
  className,
  onClick,
  label,
  dataTestId,
  Icon,
}: {
  className?: string
  onClick?: (e: React.MouseEvent) => void
  label?: string
  dataTestId?: string
  Icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <button
      aria-label={label}
      className={clsx(
        'group h-8 w-9 rounded-md bg-white/90 text-grey-900 hover:bg-white hover:text-black pointer-events-auto relative flex cursor-pointer items-center justify-center transition-all',
        className,
      )}
      data-testid={dataTestId}
      type="button"
      onClick={onClick}
    >
      <Icon className="size-4 stroke-2" />
      {label && <Tooltip label={label} />}
    </button>
  )
}
