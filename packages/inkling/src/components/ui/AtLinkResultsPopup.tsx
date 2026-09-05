import type { LexicalNode } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import type { ListOptionItem, ListOptionSection } from '@/hooks/useSearchLinks'

import { LinkSuggestionList, useLinkDropdownOpenedTracking } from '@/components/ui/LinkSuggestionList'
import { useSelectionAnchoredPopup } from '@/hooks/useSelectionAnchoredPopup'
import { createNodeElementAnchor } from '@/utils/selection-anchored-popup'

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

  const popupRef = React.useRef<HTMLDivElement | null>(null)

  const testId = 'at-link-results'

  // Position the results popup below the at-link node, flipping above it at the
  // bottom of the document; the deep module owns rect resolution and the flip.
  const anchor = React.useMemo(() => createNodeElementAnchor(editor, atLinkNode.getKey()), [editor, atLinkNode])
  const containerRect = React.useCallback(() => editor.getRootElement()?.getBoundingClientRect() ?? null, [editor])
  useSelectionAnchoredPopup({ editor, popupRef, anchor, containerRect })

  return (
    <div ref={popupRef} className="not-inkling-prose fixed z-[10000]" data-testid="at-link-results">
      <div className="relative m-0 flex w-full flex-col rounded-lg bg-white p-1 px-2 font-sans text-sm font-medium shadow-md dark:bg-grey-950">
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
