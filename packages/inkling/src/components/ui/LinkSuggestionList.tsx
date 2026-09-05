import React from 'react'

import type { ListOptionItem, ListOptionSection } from '@/hooks/useSearchLinks'

import { InputListGroup, InputListLoadingItem } from '@/components/ui/InputList'
import { KeyboardSelectionWithGroups } from '@/components/ui/KeyboardSelectionWithGroups'
import { LinkInputSearchItem } from '@/components/ui/LinkInputSearchItem'
import trackEvent from '@/utils/analytics'
import { POPUP_LIST_MAX_HEIGHT } from '@/utils/selection-anchored-popup'

/**
 * The link-dropdown suggestion chrome — the one home of the render wiring
 * the three URL surfaces (UrlInput, LinkInput, AtLinkResultsPopup) used to
 * copy: the `getItem`/`getGroup` mapping onto LinkInputSearchItem, the
 * loading item, the opened-tracking mount effect, and the window-level
 * Escape-to-close gesture. The search coordinator owns the behaviour; this
 * module owns the chrome. Per-surface variance (test id, highlight string,
 * tracking context, the Escape swallow) arrives as data.
 */

/** The opened-tracking mount effect, fired once when the gate holds. */
export function useLinkDropdownOpenedTracking(context: string, enabled: boolean): void {
  React.useEffect(() => {
    if (enabled) {
      trackEvent('Link dropdown: Opened', { context })
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/**
 * The window-level Escape-to-close dismissal gesture. `swallow` matches
 * UrlInput's preventDefault+stopPropagation variant (its dropdown floats
 * over an editor that must not see the key); LinkInput's plain close passes
 * nothing.
 */
export function useLinkDropdownEscape(
  onClose: (() => void) | undefined,
  { swallow = false }: { swallow?: boolean } = {},
): void {
  React.useEffect(() => {
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

/** The shared `getItem` factory — the LinkInputSearchItem mapping all three surfaces used to hand-type. */
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

/**
 * The suggestion list itself: the popup-max-height `<ul>`, the loading
 * item, and the keyboard-selection mapping. LinkInput shows the loading
 * item while a first search is in flight; the at-link popup passes
 * `onEnterWithoutSelection` so Enter commits the typed query.
 */
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
    <ul className="w-full overflow-y-auto bg-white py-1 dark:bg-grey-950" style={{ maxHeight: POPUP_LIST_MAX_HEIGHT }}>
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
