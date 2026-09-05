import type { LexicalCommand } from 'lexical'

import React from 'react'

import type { MenuSection, ResolvedMenuItem } from '@/nodes/cards/card-menu-build'

import TrashCardIcon from '@/assets/icons/inkling-trash.svg?react'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import trackEvent from '@/utils/analytics'

export type CardMenuItemData = ResolvedMenuItem
export type CardMenuSectionData = MenuSection

// The shared item chrome of the card menu's flat-index contract (live with
// the menu navigator and e2e): the idx/selected stamping, the
// scroll-on-selected effect, and the mousedown policy — browsers move focus
// on mousedown, and stealing it from the editor breaks key commands after
// insertion (the snippet item also keeps the menu from closing before
// insertion). The two items keep their distinct markups.
function useCardMenuItemChrome<T extends HTMLElement>({
  index,
  isSelected,
  scrollToItem,
  stopPropagationOnMouseDown = false,
}: {
  index: number
  isSelected?: boolean
  scrollToItem?: boolean
  stopPropagationOnMouseDown?: boolean
}) {
  const itemRef = React.useRef<T | null>(null)

  React.useEffect(() => {
    if (scrollToItem && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [scrollToItem])

  const handleMouseDown = (event: React.MouseEvent) => {
    if (stopPropagationOnMouseDown) {
      event.stopPropagation()
    }
    event.preventDefault()
  }

  return {
    itemRef,
    chromeProps: {
      'data-inkling-cardmenu-idx': index,
      'data-inkling-cardmenu-selected': isSelected,
      role: 'menuitem' as const,
      onMouseDown: handleMouseDown,
    },
  }
}

function CardMenuItemIcon({ Icon }: { Icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }) {
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white text-grey-900 dark:bg-transparent dark:text-grey-500">
      <Icon className="size-[1.8rem]" />
    </div>
  )
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
  const labels = useInklingLabels()
  const { itemRef, chromeProps } = useCardMenuItemChrome<HTMLButtonElement>({
    index: dataItemId ?? 0,
    isSelected,
    scrollToItem,
  })

  if (customContent) {
    return <li>{customContent}</li>
  }

  return (
    <li
      className={`mb-0 ${isSelected ? 'bg-grey-100 dark:bg-grey-900' : ''}`}
      data-testid={dataTestId}
      onClick={onClick}
      {...props}
    >
      <button
        ref={itemRef}
        className={`group flex w-full cursor-pointer flex-row items-center gap-3 border border-transparent px-2 py-[.6rem] text-left text-grey-800 hover:bg-grey-100 md:rounded-md dark:hover:bg-grey-900 ${isSelected ? 'bg-grey-100 dark:bg-grey-900' : ''}`}
        data-inkling-card-menu-item={label}
        type="button"
        {...chromeProps}
      >
        {Icon && <CardMenuItemIcon Icon={Icon} />}
        <div className="flex w-full justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <div className="m-0 w-full truncate text-[1.35rem] leading-snug font-medium tracking-[.02rem] text-grey-900 dark:text-grey-200">
              {label}
            </div>
            {desc && (
              <div className="m-0 text-[1.35rem] leading-snug font-medium tracking-[.02rem] break-words whitespace-normal text-grey-500 dark:text-grey-200">
                {desc}
              </div>
            )}
          </div>
          {shortcut && (
            <div className="invisible m-0 shrink-0 truncate text-[1.35rem] leading-snug font-medium tracking-[.02rem] text-grey-500 group-hover:visible dark:text-grey-200">
              {shortcut}
            </div>
          )}
        </div>
      </button>
      {onRemove && (
        <button
          className="ml-auto text-xs text-red"
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          {labels['action.remove']}
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
  return (
    <li
      className="flex shrink-0 flex-col justify-center border-t border-grey-200 text-[1.1rem] font-semibold tracking-wide text-grey-600 first-of-type:border-t-0 dark:border-grey-900 dark:text-grey-600"
      role="separator"
    >
      <span
        className="flex items-center justify-between px-4 pt-3 pb-2 uppercase"
        data-card-menu-section="label"
        style={{ minWidth: 'calc(100% - 3.2rem)' }}
      >
        {label}
      </span>
      <ul className="md:grid md:gap-y-[.2rem] md:px-2" role="menu">
        {children}
      </ul>
    </li>
  )
}

export interface CardSnippetItemProps {
  label?: string
  Icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  dataTestId?: string
  dataItemId?: number
  isSelected?: boolean
  scrollToItem?: boolean
  onClick?: (event: React.MouseEvent) => void
  onRemove?: () => void
  closeMenu?: () => void
}

export const CardSnippetItem = ({
  label,
  Icon,
  dataTestId,
  dataItemId,
  isSelected,
  scrollToItem,
  onClick,
  onRemove,
  closeMenu,
}: CardSnippetItemProps) => {
  const labels = useInklingLabels()
  const { itemRef, chromeProps } = useCardMenuItemChrome<HTMLDivElement>({
    index: dataItemId ?? 0,
    isSelected,
    scrollToItem,
    stopPropagationOnMouseDown: true,
  })

  const handleSnippetRemove = (event: React.MouseEvent) => {
    event.stopPropagation() // prevent snippet insertion
    onRemove?.()
    closeMenu?.()
  }

  return (
    <li className="mb-0 min-w-0 md:col-span-2" data-testid={dataTestId} onClick={onClick}>
      <div
        ref={itemRef}
        className={`inkling-cardmenu-card-hover group flex w-full min-w-0 cursor-pointer flex-row items-center rounded-md border border-transparent px-2 py-1 text-grey-800 hover:bg-grey-100 dark:hover:bg-grey-900 ${isSelected ? 'bg-grey-100 dark:bg-grey-900' : ''}`}
        tabIndex={-1}
        {...chromeProps}
      >
        {Icon && <CardMenuItemIcon Icon={Icon} />}
        <div className="m-0 ml-4 min-w-0 flex-1 truncate text-[1.35rem] leading-snug font-medium tracking-[.02rem] text-grey-900 dark:text-grey-200">
          {label}
        </div>
        {onRemove && (
          <button
            className="ml-auto shrink-0 cursor-pointer rounded-md p-[4px] group-hover:block hover:bg-grey-200 dark:hover:bg-grey-950"
            title={labels['snippet.remove']}
            type="button"
            onClick={handleSnippetRemove}
          >
            <TrashCardIcon className="size-[1.8rem] stroke-red stroke-[1.5] text-red" />
            <span className="sr-only">{labels['action.remove']}</span>
          </button>
        )}
      </div>
    </li>
  )
}

export interface CardMenuProps {
  /** Sections in render order (buildCardMenu's `sections`). The rendered
   * `data-inkling-cardmenu-idx` numbering is the flat index across sections,
   * matching buildCardMenu's `items` ordering. */
  sections?: CardMenuSectionData[]
  insert?: (
    insertCommand?: LexicalCommand<unknown>,
    params?: { insertParams?: Record<string, unknown>; queryParams?: string[] },
  ) => void
  selectedItemIndex?: number
  scrollToSelectedItem?: boolean
  closeMenu?: () => void
}

export const CardMenu = ({
  sections = [],
  insert = () => {},
  selectedItemIndex = 0,
  scrollToSelectedItem = false,
  closeMenu,
}: CardMenuProps) => {
  // the flat item index spans section boundaries so the rendered
  // data-inkling-cardmenu-idx matches buildCardMenu's items ordering
  const sectionStartIndexes: number[] = []
  let itemCount = 0
  for (const section of sections) {
    sectionStartIndexes.push(itemCount)
    itemCount += section.items.length
  }

  return (
    <ul
      className="not-inkling-prose z-[9999999] m-0 mb-3 max-h-[420px] w-[312px] scroll-p-2 flex-col overflow-x-hidden overflow-y-auto rounded-lg bg-white bg-clip-padding p-0 font-sans text-sm shadow-md after:block after:pb-1 md:w-[348px] dark:bg-grey-950"
      data-inkling-card-menu
      role="menu"
    >
      {sections.map((section, sectionIndex) => (
        <CardMenuSection key={section.label} label={section.label}>
          {section.items.map((item, itemIndex) => {
            const index = sectionStartIndexes[sectionIndex] + itemIndex
            const isSelected = index === selectedItemIndex
            const onClick = (event: React.MouseEvent): void => {
              event.preventDefault()
              event.stopPropagation()
              insert?.(item.insertCommand, {
                insertParams: item.insertParams,
                queryParams: item.queryParams,
              })
              trackEvent('Card Added', { card: item.label ?? 'unknown' })
            }

            if (!item.type || item.type === 'card') {
              return (
                <CardMenuItem
                  key={index}
                  Icon={item.Icon}
                  data-inkling-cardmenu-idx={index}
                  data-testid={item.dataTestId}
                  dataItemId={index}
                  desc={item.desc}
                  isSelected={isSelected}
                  label={item.label}
                  scrollToItem={isSelected && scrollToSelectedItem}
                  shortcut={item.shortcut}
                  onClick={onClick}
                />
              )
            }

            if (item.type === 'snippet') {
              return (
                <CardSnippetItem
                  key={index}
                  closeMenu={closeMenu}
                  dataItemId={index}
                  dataTestId={item.dataTestId}
                  Icon={item.Icon}
                  isSelected={isSelected}
                  label={item.label}
                  scrollToItem={isSelected && scrollToSelectedItem}
                  onClick={onClick}
                  onRemove={item.onRemove}
                />
              )
            }

            return null
          })}
        </CardMenuSection>
      ))}
    </ul>
  )
}
