import React from 'react'

import ExternalLinkIcon from '@/ui/inkling-editor/assets/icons/inkling-help.svg?react'
import TrashCardIcon from '@/ui/inkling-editor/assets/icons/inkling-trash.svg?react'

export interface CardMenuItemData {
  label?: string
  name?: string
  type?: string
  icon?: string
  insertCommand?: unknown
  insertParams?: Record<string, unknown>
  queryParams?: Record<string, unknown>
  Icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  dataTestId?: string
  customContent?: React.ReactNode
  hidden?: boolean
  disabled?: boolean
  shortcut?: string
  desc?: string
  onRemove?: () => void
  [key: string]: unknown
}

export interface CardMenuItemProps {
  label?: string
  desc?: string
  icon?: string
  Icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  isSelected?: boolean
  scrollToItem?: boolean
  dataTestId?: string
  dataItemId?: number
  shortcut?: string
  onClick?: (event: React.MouseEvent) => void
  onRemove?: () => void
  customContent?: React.ReactNode
  'data-inkling-cardmenu-idx'?: number
}

export const CardMenuItem = ({
  label,
  desc,
  Icon,
  isSelected,
  scrollToItem,
  dataTestId,
  dataItemId,
  shortcut,
  onClick,
  onRemove,
  customContent,
  ...props
}: CardMenuItemProps) => {
  const buttonRef = React.useRef<HTMLButtonElement | null>(null)

  React.useEffect(() => {
    if (scrollToItem && buttonRef.current) {
      buttonRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [scrollToItem])

  if (customContent) {
    return <li>{customContent}</li>
  }

  // browsers will move focus on mouseDown but we don't want that because it
  // removes focus from the editor meaning key commands don't work as
  // expected after a card is inserted
  const preventMouseDown = (event: React.MouseEvent) => {
    event.preventDefault()
  }

  return (
    <li
      className={`mb-0 ${isSelected ? 'bg-grey-100 dark:bg-grey-900' : ''}`}
      data-testid={dataTestId}
      onClick={onClick}
      {...props}
    >
      <button
        ref={buttonRef}
        className={`group flex w-full cursor-pointer flex-row items-center gap-3 border border-transparent px-2 py-[0.375rem] text-left text-grey-800 hover:bg-grey-100 md:rounded-md dark:hover:bg-grey-900 ${isSelected ? 'bg-grey-100 dark:bg-grey-900' : ''}`}
        data-inkling-card-menu-item={label}
        data-inkling-cardmenu-idx={dataItemId}
        data-inkling-cardmenu-selected={isSelected}
        role="menuitem"
        type="button"
        onMouseDown={preventMouseDown}
      >
        {Icon && (
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white text-grey-900 dark:bg-transparent dark:text-grey-500">
            <Icon className="size-[1.125rem]" />
          </div>
        )}
        <div className="flex w-full justify-between">
          <div className="flex flex-col items-start">
            <div className="m-0 truncate text-[0.84375rem] leading-snug font-medium tracking-[0.0125rem] text-grey-900 dark:text-grey-200">
              {label}
            </div>
            {desc && (
              <div className="m-0 truncate text-[0.84375rem] leading-snug font-medium tracking-[0.0125rem] text-grey-500 dark:text-grey-200">
                {desc}
              </div>
            )}
          </div>
          {shortcut && (
            <div className="invisible m-0 truncate text-[0.84375rem] leading-snug font-medium tracking-[0.0125rem] text-grey-500 group-hover:visible dark:text-grey-200">
              {shortcut}
            </div>
          )}
        </div>
      </button>
      {onRemove && (
        <button
          className="text-red ml-auto text-xs"
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          Remove
        </button>
      )}
    </li>
  )
}

export interface CardMenuSectionProps {
  label: string
  children?: React.ReactNode
}

export const CardMenuSection = ({ label, children }: CardMenuSectionProps) => {
  let helpLink = ''
  if (label === 'Primary') {
    helpLink = 'https://inkling.local/help/cards/'
  } else if (label === 'Snippets') {
    helpLink = 'https://inkling.local/help/snippets/'
  }

  return (
    <li
      className="flex shrink-0 flex-col justify-center border-t border-grey-200 text-[0.6875rem] font-semibold tracking-wide text-grey-600 first-of-type:border-t-0 dark:border-grey-900 dark:text-grey-600"
      role="separator"
    >
      <span
        className="flex items-center justify-between px-4 pt-3 pb-2 uppercase"
        data-card-menu-section="label"
        style={{ minWidth: 'calc(100% - 2rem)' }}
      >
        {label}
        {helpLink && (
          <a href={helpLink} rel="noreferrer" target="_blank">
            <ExternalLinkIcon className="-m-1 size-6 cursor-pointer p-1 transition-all hover:text-green-600" />
          </a>
        )}
      </span>
      <ul className="md:grid md:gap-y-[0.125rem] md:px-2" role="menu">
        {children}
      </ul>
    </li>
  )
}

export interface CardSnippetItemProps {
  label?: string
  dataTestId?: string
  dataItemId?: number
  isSelected?: boolean
  scrollToItem?: boolean
  onClick?: (event: React.MouseEvent) => void
  onRemove?: () => void
}

export const CardSnippetItem = ({
  label,
  dataTestId,
  dataItemId,
  isSelected,
  scrollToItem,
  onClick,
  onRemove,
}: CardSnippetItemProps) => {
  const itemRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (scrollToItem && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [scrollToItem])

  const handleMouseDown = (event: React.MouseEvent) => {
    // prevent menu closing before snippet insertion
    event.stopPropagation()
    event.preventDefault()
  }

  return (
    <li className="mb-0 min-w-0 md:col-span-2" data-testid={dataTestId} onClick={onClick}>
      <div
        ref={itemRef}
        className={`inkling-cardmenu-card-hover group flex w-full min-w-0 cursor-pointer flex-row items-center rounded-md border border-transparent px-2 py-1 text-grey-800 hover:bg-grey-100 dark:hover:bg-grey-900 ${isSelected ? 'bg-grey-100 dark:bg-grey-900' : ''}`}
        data-inkling-cardmenu-idx={dataItemId}
        data-inkling-cardmenu-selected={isSelected}
        role="menuitem"
        tabIndex={-1}
        onMouseDown={handleMouseDown}
      >
        <div className="m-0 ml-4 min-w-0 flex-1 truncate text-[0.84375rem] leading-snug font-medium tracking-[0.0125rem] text-grey-900 dark:text-grey-200">
          {label}
        </div>
        {onRemove && (
          <button
            className="ml-auto shrink-0 cursor-pointer rounded-md p-[4px] group-hover:block hover:bg-grey-200 dark:hover:bg-grey-950"
            title="Remove snippet"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <TrashCardIcon className="stroke-red text-red size-[1.125rem] stroke-[1.5]" />
            <span className="sr-only">Remove</span>
          </button>
        )}
      </div>
    </li>
  )
}

export interface CardMenuProps {
  menu?: Map<string, CardMenuItemData[]>
  insert?: (
    insertCommand?: unknown,
    params?: { insertParams?: Record<string, unknown>; queryParams?: Record<string, unknown> },
  ) => void
  selectedItemIndex?: number
  scrollToSelectedItem?: boolean
  closeMenu?: () => void
}

export const CardMenu = ({
  menu = new Map() as Map<string, CardMenuItemData[]>,
  insert = () => {},
  selectedItemIndex = 0,
  scrollToSelectedItem = false,
}: CardMenuProps) => {
  const CardMenuSections: React.ReactElement[] = []

  let itemIndex = 0
  for (const [sectionLabel, items] of menu) {
    const CardMenuItems: React.ReactElement[] = []

    items.forEach((item) => {
      const isSelected = itemIndex === selectedItemIndex
      const onClick = (event: React.MouseEvent): void => {
        event.preventDefault()
        event.stopPropagation()
        insert?.(item.insertCommand, {
          insertParams: item.insertParams as Record<string, unknown>,
          queryParams: item.queryParams,
        })
        trackEvent('Card Added', { card: item.label ?? 'unknown' })
      }

      if (!item.type || item.type === 'card') {
        CardMenuItems.push(
          <CardMenuItem
            key={itemIndex}
            Icon={item.Icon}
            data-inkling-cardmenu-idx={itemIndex}
            data-testid={item.dataTestId}
            dataItemId={itemIndex}
            desc={item.desc}
            isSelected={isSelected}
            label={item.label}
            scrollToItem={isSelected && scrollToSelectedItem}
            shortcut={item.shortcut}
            onClick={onClick}
          />,
        )
      } else if (item.type === 'snippet') {
        CardMenuItems.push(
          <CardSnippetItem
            key={itemIndex}
            dataItemId={itemIndex}
            data-testid={item.dataTestId}
            isSelected={isSelected}
            label={item.label}
            scrollToItem={isSelected && scrollToSelectedItem}
            onClick={onClick}
            onRemove={item.onRemove as () => void}
          />,
        )
      }

      itemIndex += 1
    })

    CardMenuSections.push(
      <CardMenuSection key={sectionLabel} label={sectionLabel}>
        {CardMenuItems}
      </CardMenuSection>,
    )
  }

  return (
    <ul
      className="not-inkling-prose z-[9999999] m-0 mb-3 max-h-[420px] w-[312px] scroll-p-2 flex-col overflow-x-hidden overflow-y-auto rounded-lg bg-white bg-clip-padding p-0 font-sans text-sm shadow-md after:block after:pb-1 md:w-[348px] dark:bg-grey-950"
      data-inkling-card-menu
      role="menu"
    >
      {CardMenuSections}
    </ul>
  )
}

function trackEvent(_card: string, _props: Record<string, unknown>): void {
  // TODO: integrate with analytics provider
}
