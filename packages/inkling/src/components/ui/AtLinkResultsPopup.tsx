import type { ListOptionItem, ListOptionSection } from '@kobato/inkling-internal/hooks/useSearchLinks'
import type { LexicalNode } from 'lexical'

import {
  LinkSuggestionList,
  useLinkDropdownOpenedTracking,
} from '@kobato/inkling-internal/components/ui/LinkSuggestionList'
import { useSelectionAnchoredPopup } from '@kobato/inkling-internal/hooks/useSelectionAnchoredPopup'
import { createNodeElementAnchor } from '@kobato/inkling-internal/utils/selection-anchored-popup'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCallback, useMemo, useRef } from 'react'
interface AtLinkResultsPopupProps {
  atLinkNode: LexicalNode
  isSearching?: boolean
  listOptions: ListOptionSection[]
  query?: string
  onSelect: (item?: ListOptionItem) => void
}

export function AtLinkResultsPopup({ atLinkNode, isSearching, listOptions, query, onSelect }: AtLinkResultsPopupProps) {
  const [editor] = useLexicalComposerContext()

  useLinkDropdownOpenedTracking('at-link', !query)

  const popupRef = useRef<HTMLDivElement | null>(null)

  const testId = 'at-link-results'

  const anchor = useMemo(() => createNodeElementAnchor(editor, atLinkNode.getKey()), [editor, atLinkNode])
  const containerRect = useCallback(() => editor.getRootElement()?.getBoundingClientRect() ?? null, [editor])
  useSelectionAnchoredPopup({ editor, popupRef, anchor, containerRect })

  return (
    <div ref={popupRef} className="not-inkling-prose fixed z-[10000]" data-testid="at-link-results">
      <div className="dark:bg-grey-950 relative m-0 flex w-full flex-col rounded-lg bg-white p-1 px-2 font-sans text-sm font-medium shadow-md">
        <LinkSuggestionList
          dataTestId={testId}
          groups={listOptions}
          highlightString={query}
          isLoading={isSearching}
          onEnterWithoutSelection={onSelect}
          onSelect={onSelect}
        />
      </div>
    </div>
  )
}

export default AtLinkResultsPopup
