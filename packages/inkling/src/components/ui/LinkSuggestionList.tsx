import type { ListOptionItem, ListOptionSection } from '@kobato/inkling-internal/hooks/useSearchLinks'

import { InputListGroup, InputListLoadingItem } from '@kobato/inkling-internal/components/ui/InputList'
import { KeyboardSelectionWithGroups } from '@kobato/inkling-internal/components/ui/KeyboardSelectionWithGroups'
import { LinkInputSearchItem } from '@kobato/inkling-internal/components/ui/LinkInputSearchItem'
import trackEvent from '@kobato/inkling-internal/utils/analytics'
import { POPUP_LIST_MAX_HEIGHT } from '@kobato/inkling-internal/utils/selection-anchored-popup'
import { useEffect, useEffectEvent } from 'react'
export function useLinkDropdownOpenedTracking(context: string, enabled: boolean): void {
  const trackOpened = useEffectEvent(() => {
    if (enabled) {
      trackEvent('Link dropdown: Opened', { context })
    }
  })

  useEffect(() => {
    trackOpened()
  }, [])
}

export function useLinkDropdownEscape(
  onClose: (() => void) | undefined,
  { swallow = false }: { swallow?: boolean } = {},
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (swallow) {
          event.preventDefault()
          event.stopPropagation()
        }
        onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, swallow])
}

export function createLinkSuggestionGetItem({
  dataTestId,
  highlightString,
  onSelect,
}: {
  dataTestId: string
  highlightString?: string
  onSelect: (item: ListOptionItem) => void
}) {
  return (item: ListOptionItem, selected: boolean, onMouseOver: () => void, scrollIntoView: boolean) => (
    <LinkInputSearchItem
      key={item.value ?? 'no-results'}
      dataTestId={dataTestId}
      highlightString={highlightString}
      item={item}
      scrollIntoView={scrollIntoView}
      selected={selected}
      onClick={onSelect}
      onMouseOver={onMouseOver}
    />
  )
}

export function LinkSuggestionList({
  dataTestId,
  groups,
  highlightString,
  isLoading,
  showLoadingItem = false,
  onEnterWithoutSelection,
  onSelect,
}: {
  dataTestId: string
  groups: ListOptionSection[]
  highlightString?: string
  isLoading?: boolean
  showLoadingItem?: boolean
  onEnterWithoutSelection?: (item?: ListOptionItem) => void
  onSelect: (item: ListOptionItem) => void
}) {
  const getGroup = (group: ListOptionSection, { showSpinner }: { showSpinner?: boolean } = {}) => (
    <InputListGroup dataTestId={dataTestId} group={group} showSpinner={showSpinner} />
  )

  return (
    <ul className="dark:bg-grey-950 w-full overflow-y-auto bg-white py-1" style={{ maxHeight: POPUP_LIST_MAX_HEIGHT }}>
      {showLoadingItem && isLoading && !groups.length && <InputListLoadingItem dataTestId={dataTestId} />}
      <KeyboardSelectionWithGroups
        getGroup={getGroup}
        getItem={createLinkSuggestionGetItem({ dataTestId, highlightString, onSelect })}
        groups={groups}
        isLoading={isLoading}
        onEnterWithoutSelection={onEnterWithoutSelection}
        onSelect={onSelect}
      />
    </ul>
  )
}
