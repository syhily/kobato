import React from 'react'

export interface SnippetActionToolbarProps {
  onClose?: () => void
  onInsert?: (value: string) => void
  value?: string
  isLoading?: boolean
  dataTestId?: string
}

export function SnippetActionToolbar({
  onClose,
  onInsert,
  value = '',
  isLoading,
  dataTestId,
}: SnippetActionToolbarProps) {
  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      onClose?.()
    }
  }

  return (
    <div className="flex items-center gap-2" data-testid={dataTestId} onKeyDown={handleKeyDown}>
      <input
        className="flex-1 rounded-md border border-grey-300 bg-white px-3 py-2 font-sans text-sm text-grey-900 placeholder:text-grey-500 focus:border-green focus:outline-none dark:border-grey-800 dark:bg-grey-900 dark:text-white"
        data-testid={`${dataTestId}-input`}
        placeholder="Search snippets..."
        type="text"
        value={value ?? ''}
      />
      <button
        className="rounded-md bg-green px-3 py-2 text-sm font-medium text-white hover:bg-green-600"
        data-testid={`${dataTestId}-insert`}
        type="button"
        onClick={() => onInsert?.(value)}
      >
        Insert
      </button>
      {onClose && (
        <button
          className="rounded-md bg-grey-200 px-3 py-2 text-sm font-medium text-grey-700 hover:bg-grey-300 dark:bg-grey-800 dark:text-grey-300 dark:hover:bg-grey-700"
          data-testid={`${dataTestId}-close`}
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      )}
    </div>
  )
}
