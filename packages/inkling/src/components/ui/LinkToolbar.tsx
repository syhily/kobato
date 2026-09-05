import React from 'react'

import { useInklingLabels } from '@/hooks/useInklingLabels'

export interface LinkToolbarProps {
  href?: string
  onEdit?: () => void
  onRemove?: () => void
  dataTestId?: string
}

export function LinkToolbar({ href, onEdit, onRemove, dataTestId = 'link-toolbar' }: LinkToolbarProps) {
  const labels = useInklingLabels()
  return (
    <div className="flex items-center gap-2" data-testid={dataTestId}>
      <a
        className="max-w-[200px] truncate text-sm text-green hover:underline"
        data-testid={`${dataTestId}-link`}
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {href}
      </a>
      {onEdit && (
        <button
          className="rounded-md bg-grey-200 px-2 py-1 text-xs font-medium text-grey-700 hover:bg-grey-300 dark:bg-grey-800 dark:text-grey-300 dark:hover:bg-grey-700"
          data-testid={`${dataTestId}-edit`}
          type="button"
          onClick={onEdit}
        >
          {labels['action.edit']}
        </button>
      )}
      {onRemove && (
        <button
          className="rounded-md bg-red/10 px-2 py-1 text-xs font-medium text-red hover:bg-red/20"
          data-testid={`${dataTestId}-remove`}
          type="button"
          onClick={onRemove}
        >
          {labels['action.remove']}
        </button>
      )}
    </div>
  )
}
