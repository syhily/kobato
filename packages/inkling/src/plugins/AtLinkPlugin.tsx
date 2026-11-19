import { AtLinkResultsPopup } from '@kobato/inkling-internal/components/ui/AtLinkResultsPopup'
import Portal from '@kobato/inkling-internal/components/ui/Portal'
import {
  type LinkingSettings,
  useInklingLinkingSettings,
} from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'
import {
  useSearchLinks,
  type ListOptionItem,
  type ListOptionSection,
} from '@kobato/inkling-internal/hooks/useSearchLinks'
import { AtLinkNode, AtLinkSearchNode } from '@kobato/inkling-internal/nodes/base'
import {
  $commitAtLinkSelection,
  $removeAtLink,
  registerAtLinkGuards,
  registerAtLinkInsertion,
  registerAtLinkNodeTransform,
  registerAtLinkSession,
  type AtLinkSessionSnapshot,
} from '@kobato/inkling-internal/plugins/behaviour/at-link'
import trackEvent from '@kobato/inkling-internal/utils/analytics'
import { isInternalUrl } from '@kobato/inkling-internal/utils/is-internal-url'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

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

  React.useEffect(() => registerAtLinkInsertion(editor), [editor])

  React.useEffect(() => registerAtLinkSession(editor, { onSessionChange: setSession }), [editor])

  React.useEffect(() => registerAtLinkGuards(editor), [editor])
  React.useEffect(() => registerAtLinkNodeTransform(editor), [editor])

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

  if (!focusedNode) {
    return null
  }

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

export const AtLinkPlugin = () => {
  const { searchLinks, siteUrl } = useInklingLinkingSettings()
  const [editor] = useLexicalComposerContext()
  if (typeof searchLinks !== 'function') {
    return null
  }

  if (!editor.hasNodes([AtLinkNode, AtLinkSearchNode])) {
    return null
  }

  return <InklingAtLinkPlugin searchLinks={searchLinks} siteUrl={siteUrl} />
}

export default AtLinkPlugin
