import { $createLinkNode } from '@lexical/link'
import { $createTextNode, type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React, { useCallback } from 'react'

import type { BookmarkNode } from '@/nodes/BookmarkNode'

import { CardActionToolbar } from '@/components/ui/CardActionToolbar'
import { BookmarkCard } from '@/components/ui/cards/BookmarkCard'
import { useCardIsSelected } from '@/context/CardSelectionStoreContext'
import { useInklingLinkingSettings, useInklingSnippetSettings } from '@/context/InklingHostIntegrationContext'
import { useBookmarkMetadata } from '@/hooks/useBookmarkMetadata'
import { useCardChrome } from '@/hooks/useCardChrome'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { $isBookmarkNode } from '@/nodes/base'
import { $replaceCardWithParagraph } from '@/plugins/behaviour/card-removal'
import trackEvent from '@/utils/analytics'
import { isInternalUrl } from '@/utils/isInternalUrl'

interface BookmarkNodeComponentProps {
  author?: string
  nodeKey: NodeKey
  url: string
  icon?: string
  title?: string
  description?: string
  publisher?: string
  thumbnail?: string
  captionEditor: LexicalEditor | null
  captionEditorInitialState: EditorState | undefined
  createdWithUrl?: boolean
}

export function BookmarkNodeComponent({
  author,
  nodeKey,
  url,
  icon,
  title,
  description,
  publisher,
  thumbnail,
  captionEditor,
  captionEditorInitialState,
  createdWithUrl,
}: BookmarkNodeComponentProps) {
  const { editor } = useCardChrome(nodeKey, $isBookmarkNode)
  const { fetchEmbed, siteUrl, searchLinks } = useInklingLinkingSettings()
  const { createSnippet } = useInklingSnippetSettings()
  const labels = useInklingLabels()

  const isSelected = useCardIsSelected(nodeKey)
  const [urlInputValue, setUrlInputValue] = React.useState<string>(url)
  const { loading, urlError, clearUrlError, submitUrl, fetchInitialMetadata } = useBookmarkMetadata({
    editor,
    nodeKey,
    fetchEmbed,
  })

  const handleUrlChange = (value: string): void => {
    setUrlInputValue(value)
  }

  const handleUrlSubmit = (href: string, type?: string): void => {
    if (type === 'internal' || type === 'default') {
      trackEvent('Link dropdown: Internal link chosen', {
        context: 'bookmark',
        fromLatest: type === 'default',
      })
    }
    if (type === 'url') {
      const target = isInternalUrl(href, siteUrl ?? '') ? 'internal' : 'external'
      trackEvent('Link dropdown: URL entered', { context: 'bookmark', target })
    }

    void submitUrl(href)
  }

  const handleRetry = (): void => {
    clearUrlError()
  }

  const handlePasteAsLink = useCallback(() => {
    editor.update(() => {
      $replaceCardWithParagraph(nodeKey, {
        content: $createLinkNode(urlInputValue).append($createTextNode(urlInputValue)),
      })
    })
  }, [editor, nodeKey, urlInputValue])

  const handleClose = useCallback(() => {
    editor.update(() => {
      $replaceCardWithParagraph(nodeKey, { reuseEmptySibling: true })
    })
  }, [editor, nodeKey])

  // if we create the node with a url
  //  fetch the metadata
  //  if it fails, paste as a link
  React.useEffect(() => {
    // only run this once (the input state already initialises from `url`, so
    // the effect only kicks off the initial fetch)
    if (createdWithUrl) {
      fetchInitialMetadata(url).catch(() => {
        handlePasteAsLink()
      })
    }
    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const searchEnabled = typeof searchLinks === 'function'

  return (
    <>
      <BookmarkCard
        author={author}
        captionEditor={captionEditor}
        captionEditorInitialState={captionEditorInitialState}
        description={description}
        handleClose={handleClose}
        handlePasteAsLink={handlePasteAsLink}
        handleRetry={handleRetry}
        handleUrlChange={handleUrlChange}
        handleUrlSubmit={handleUrlSubmit}
        icon={icon}
        isLoading={loading}
        isSelected={isSelected}
        publisher={publisher}
        thumbnail={thumbnail}
        title={title}
        url={url}
        urlError={urlError}
        urlInputValue={urlInputValue}
        urlPlaceholder={searchEnabled ? labels['bookmark.url.placeholder.search'] : labels['bookmark.url.placeholder']}
      />

      <CardActionToolbar
        hideWhileEditing={false}
        items={[{ kind: 'snippet' }]}
        nodeKey={nodeKey}
        visibleWhen={!!title && !!createSnippet}
      />
    </>
  )
}

/**
 * Bookmark's decorate render — the React-bearing half of its decorate-target,
 * paired with the declaration by `@/nodes/cards/card-decorate`.
 */
export function renderBookmarkCard(node: BookmarkNode) {
  return (
    <BookmarkNodeComponent
      author={node.author}
      captionEditor={node.__captionEditor}
      captionEditorInitialState={node.__captionEditorInitialState}
      createdWithUrl={node.__createdWithUrl}
      description={node.description}
      icon={node.icon}
      nodeKey={node.getKey()}
      publisher={node.publisher}
      thumbnail={node.thumbnail}
      title={node.title}
      url={node.url}
    />
  )
}
