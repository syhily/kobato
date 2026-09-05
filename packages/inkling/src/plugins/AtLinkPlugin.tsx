import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import { AtLinkResultsPopup } from '@/components/ui/AtLinkResultsPopup'
import Portal from '@/components/ui/Portal'
import { type LinkingSettings, useInklingLinkingSettings } from '@/context/InklingHostIntegrationContext'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { useSearchLinks, type ListOptionItem, type ListOptionSection } from '@/hooks/useSearchLinks'
import { AtLinkNode, AtLinkSearchNode } from '@/nodes/base'
import trackEvent from '@/utils/analytics'
import { isInternalUrl } from '@/utils/isInternalUrl'

import {
  $commitAtLinkSelection,
  $removeAtLink,
  registerAtLinkGuards,
  registerAtLinkInsertion,
  registerAtLinkNodeTransform,
  registerAtLinkSession,
  type AtLinkSessionSnapshot,
} from './behaviour/at-link'

function noResultOptions(noResultsLabel: string): ListOptionSection[] {
  return [
    {
      label: noResultsLabel,
      items: [],
    },
  ]
}

interface AtLinkPluginProps {
  searchLinks: NonNullable<LinkingSettings['searchLinks']>
  siteUrl?: LinkingSettings['siteUrl']
}

// At-link search adapter: subscribes to the headless session in
// ./behaviour/at-link (insertion, shape transform, command guards, and the
// focused-node/query synchronization policy), renders the search results
// popup for the emitted snapshots, and delegates commits. Analytics stays
// here — it is product glue, not tree policy.
export const InklingAtLinkPlugin = ({ searchLinks, siteUrl }: AtLinkPluginProps) => {
  const [editor] = useLexicalComposerContext()
  const labels = useInklingLabels()
  const [{ focusedNode, query }, setSession] = React.useState<AtLinkSessionSnapshot>({
    focusedNode: null,
    query: '',
  })
  const searchOptions = React.useMemo(
    () => ({ noResultOptions: () => noResultOptions(labels['search.noResults']) }),
    [labels],
  )
  const { isSearching, listOptions } = useSearchLinks(query, searchLinks, searchOptions)

  // Convert a typed '@' into an at-link node (headless lifecycle module).
  React.useEffect(() => registerAtLinkInsertion(editor), [editor])

  // Subscribe to the headless search session (focused at-link node + query).
  React.useEffect(() => registerAtLinkSession(editor, { onSessionChange: setSession }), [editor])

  // register some command handlers to avoid certain actions happening whilst
  // an at-link-search node is focused
  React.useEffect(() => registerAtLinkGuards(editor), [editor])

  // register transforms to ensure at-link node trees are valid
  React.useEffect(() => registerAtLinkNodeTransform(editor), [editor])

  // when a search result is selected, replace the at-link node (headless
  // surgery); the analytics below are the product-glue half of the commit
  const onItemSelect = React.useCallback(
    (item?: ListOptionItem) => {
      editor.update(() => {
        if (!item?.value || !focusedNode) {
          if (focusedNode) {
            $removeAtLink(focusedNode, { focus: true })
          }
          return
        }

        const committed = $commitAtLinkSelection(focusedNode, { label: item.label, value: item.value })
        if (!committed) {
          return
        }

        if (item.type === 'internal' || item.type === 'default') {
          trackEvent('Link dropdown: Internal link chosen', {
            context: 'at-link',
            fromLatest: item.type === 'default',
            isBookmark: committed.isBookmark,
          })
        } else {
          const linkTarget = isInternalUrl(item.value, siteUrl) ? 'internal' : 'external'
          trackEvent('Link dropdown: URL entered', {
            context: 'at-link',
            target: linkTarget,
            isBookmark: committed.isBookmark,
          })
        }
      })
    },
    [editor, focusedNode, siteUrl],
  )

  // render nothing when we don't have a focused at-link node
  if (!focusedNode) {
    return null
  }

  // otherwise render search results popup
  return (
    <Portal data-testid="at-link-popup">
      <AtLinkResultsPopup
        atLinkNode={focusedNode}
        isSearching={isSearching}
        listOptions={listOptions}
        query={query}
        onSelect={onItemSelect}
      />
    </Portal>
  )
}

// wrapping InklingAtLinkPlugin means we can ensure all dependencies are available
// before rendering the plugin, avoiding complex conditionals in the plugin itself
export const AtLinkPlugin = () => {
  const { searchLinks, siteUrl } = useInklingLinkingSettings()
  const [editor] = useLexicalComposerContext()

  // do nothing if we haven't been passed a way to search internal links
  if (typeof searchLinks !== 'function') {
    return null
  }

  // do nothing if the required nodes aren't loaded
  if (!editor.hasNodes([AtLinkNode, AtLinkSearchNode])) {
    return null
  }

  return <InklingAtLinkPlugin searchLinks={searchLinks} siteUrl={siteUrl} />
}

export default AtLinkPlugin
