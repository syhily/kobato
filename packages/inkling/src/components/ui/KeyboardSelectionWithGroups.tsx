import React from 'react'

import type { ListOptionItem } from '@/hooks/useSearchLinks'

import { useKeyboardListSelection } from '@/hooks/useKeyboardListSelection'

export interface KeyboardSelectionWithGroupsProps<T extends { value: string | null } = ListOptionItem> {
  groups: Array<{ label: string; items: T[] }>
  getItem: (item: T, selected: boolean, onMouseOver: () => void, scrollIntoView: boolean) => React.ReactElement
  getGroup: (group: { label: string; items: T[] }, options?: { showSpinner?: boolean }) => React.ReactElement
  onSelect: (item: T) => void
  onEnterWithoutSelection?: () => void
  defaultSelected?: T
  isLoading?: boolean
}

/**
 * The grouped render shell over the keyboard-selection machine
 * (@/hooks/useKeyboardListSelection owns the keydown policy): renders each
 * group's header and items, wiring the flat selection index, the
 * scroll-into-view latch, and the hover wiring through getItem. Null-valued
 * items are non-interactive placeholders — never shown selected, hover
 * ignored. A flat option list is one degenerate group (see InputList).
 */
export function KeyboardSelectionWithGroups<T extends { value: string | null } = ListOptionItem>({
  groups,
  getItem,
  getGroup,
  onSelect,
  onEnterWithoutSelection,
  defaultSelected,
  isLoading,
}: KeyboardSelectionWithGroupsProps<T>) {
  const items = groups.flatMap((group) => group.items)
  const { selectedIndex, scrollSelectedIntoView, hoverIndex } = useKeyboardListSelection({
    items,
    onSelect,
    defaultSelected,
    onEnterWithoutSelection,
  })

  return (
    <>
      {groups.map((group, groupIndex) => (
        <React.Fragment key={group.label}>
          {getGroup(group, { showSpinner: groupIndex === 0 && isLoading })}
          {group.items.map((item, index) => {
            const itemsBefore = groups.slice(0, groupIndex).reduce((sum, prevGroup) => sum + prevGroup.items.length, 0)
            const absoluteIndex = itemsBefore + index
            const isSelected = absoluteIndex === selectedIndex && !!item.value
            const onMouseOver = () => {
              if (item.value) {
                hoverIndex(absoluteIndex)
              } else {
                // hovering a placeholder still clears the scroll latch
                hoverIndex(selectedIndex)
              }
            }
            return getItem(item, isSelected, onMouseOver, scrollSelectedIntoView)
          })}
        </React.Fragment>
      ))}
    </>
  )
}
