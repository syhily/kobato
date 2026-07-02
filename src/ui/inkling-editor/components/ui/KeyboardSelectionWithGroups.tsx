import React from 'react'

import type { ListOptionItem, ListOptionSection } from '@/ui/inkling-editor/hooks/useSearchLinks'

const Group = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>
}

export interface KeyboardSelectionWithGroupsProps {
  groups: ListOptionSection[]
  getItem: (
    item: ListOptionItem,
    selected: boolean,
    onMouseOver: () => void,
    scrollIntoView: boolean,
  ) => React.ReactElement
  getGroup: (group: ListOptionSection, options?: { showSpinner?: boolean }) => React.ReactElement
  onSelect: (item: ListOptionItem) => void
  defaultSelected?: ListOptionItem
  isLoading?: boolean
}

/**
 * Renders a list of options, which are selectable by using the up and down arrow keys.
 * You pass in the template for each option via the getItem function, which is called for each option and also passes in whether the item is selected or not.
 */
export function KeyboardSelectionWithGroups({
  groups,
  getItem,
  getGroup,
  onSelect,
  defaultSelected,
  isLoading,
}: KeyboardSelectionWithGroupsProps) {
  const items = groups.flatMap((group) => group.items)
  const defaultIndex = Math.max(
    0,
    items.findIndex((item) => item === defaultSelected),
  )
  const [selectedIndex, setSelectedIndex] = React.useState(defaultIndex)
  const [scrollSelectedIntoView, setScrollSelectedIntoView] = React.useState(false)

  // If items change, check if the selectedIndex is still valid, and if not, reset it to 0
  React.useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(defaultIndex)
    }
  }, [items, selectedIndex, defaultIndex])

  // If the default index changes, select it again
  React.useEffect(() => {
    setSelectedIndex(defaultIndex)
  }, [defaultIndex])

  const handleKeydown = React.useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        // The stop propagation is required for Safari
        event.preventDefault()
        event.stopPropagation()
        setSelectedIndex((i) => {
          return Math.min(i + 1, items.length - 1)
        })
        setScrollSelectedIntoView(true)
      }
      if (event.key === 'ArrowUp') {
        // The stop propagation is required for Safari
        event.preventDefault()
        event.stopPropagation()
        setSelectedIndex((i) => {
          return Math.max(i - 1, 0)
        })
        setScrollSelectedIntoView(true)
      }
      if (event.key === 'Enter') {
        // The stop propagation is required for Safari
        event.preventDefault()
        event.stopPropagation()
        onSelect(items[selectedIndex])
      }
    },
    [items, selectedIndex, onSelect],
  )

  React.useEffect(() => {
    // The capture phase is required for Safari
    window.addEventListener('keydown', handleKeydown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeydown, { capture: true })
    }
  }, [handleKeydown])

  return (
    <>
      {groups.map((group, groupIndex) => (
        <Group key={group.label}>
          {getGroup(group, { showSpinner: groupIndex === 0 && isLoading })}
          {(group.items || []).map((item, index) => {
            const itemsBefore = groups.slice(0, groupIndex).reduce((sum, prevGroup) => sum + prevGroup.items.length, 0)
            const absoluteIndex = itemsBefore + index
            const isSelected = absoluteIndex === selectedIndex && !!item.value
            const onMouseOver = () => {
              if (item.value) {
                setSelectedIndex(absoluteIndex)
              }
              setScrollSelectedIntoView(false)
            }
            return getItem(item, isSelected, onMouseOver, scrollSelectedIntoView)
          })}
        </Group>
      ))}
    </>
  )
}
