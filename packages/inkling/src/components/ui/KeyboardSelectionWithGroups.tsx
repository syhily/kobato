import type { ListOptionItem } from '@kobato/inkling-internal/hooks/useSearchLinks'

import { useKeyboardListSelection } from '@kobato/inkling-internal/hooks/useKeyboardListSelection'
import { type ReactElement, Fragment } from 'react'
export interface KeyboardSelectionWithGroupsProps<T extends { value: string | null } = ListOptionItem> {
  groups: Array<{ label: string; items: T[] }>
  getItem: (item: T, selected: boolean, onMouseOver: () => void, scrollIntoView: boolean) => ReactElement
  getGroup: (group: { label: string; items: T[] }, options?: { showSpinner?: boolean }) => ReactElement
  onSelect: (item: T) => void
  onEnterWithoutSelection?: () => void
  defaultSelected?: T
  isLoading?: boolean
}

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
        <Fragment key={group.label}>
          {getGroup(group, { showSpinner: groupIndex === 0 && isLoading })}
          {group.items.map((item, index) => {
            const itemsBefore = groups.slice(0, groupIndex).reduce((sum, prevGroup) => sum + prevGroup.items.length, 0)
            const absoluteIndex = itemsBefore + index
            const isSelected = absoluteIndex === selectedIndex && !!item.value
            const onMouseOver = () => {
              if (item.value) {
                hoverIndex(absoluteIndex)
              } else {
                hoverIndex(selectedIndex)
              }
            }
            return getItem(item, isSelected, onMouseOver, scrollSelectedIntoView)
          })}
        </Fragment>
      ))}
    </>
  )
}
