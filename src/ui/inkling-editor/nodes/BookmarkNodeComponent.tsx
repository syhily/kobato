import { $createLinkNode } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $isParagraphNode,
  type EditorState,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'
import React, { useCallback } from 'react'

import { ActionToolbar } from '@/ui/inkling-editor/components/ui/ActionToolbar'
import { BookmarkCard } from '@/ui/inkling-editor/components/ui/cards/BookmarkCard'
import { SnippetCreateToolbar } from '@/ui/inkling-editor/components/ui/SnippetCreateToolbar'
import { ToolbarMenu, ToolbarMenuItem } from '@/ui/inkling-editor/components/ui/ToolbarMenu'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { GeneratedDecoratorNodeBase } from '@/ui/inkling-editor/nodes/base'
import trackEvent from '@/ui/inkling-editor/utils/analytics'
import { isInternalUrl } from '@/ui/inkling-editor/utils/isInternalUrl'

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
  const [editor] = useLexicalComposerContext()

  const { cardConfig } = React.useContext(InklingComposerContext)
  const { isSelected } = React.useContext(CardContext)
  const [urlInputValue, setUrlInputValue] = React.useState<string>(url)
  const [loading, setLoading] = React.useState<boolean>(false)
  const [urlError, setUrlError] = React.useState<boolean>(false)
  const [showSnippetToolbar, setShowSnippetToolbar] = React.useState<boolean>(false)

  const handleUrlChange = (eventOrUrl: React.ChangeEvent<HTMLInputElement> | string): void => {
    // TODO: change this so we only get given URL strings - child components should handle their own events
    if (typeof eventOrUrl === 'string') {
      setUrlInputValue(eventOrUrl)
      return
    }
    setUrlInputValue((eventOrUrl.target as HTMLInputElement).value)
  }

  const handleUrlSubmit = async (
    eventOrUrl: React.KeyboardEvent<HTMLInputElement> | string | null,
    type?: string,
  ): Promise<void> => {
    if (!eventOrUrl) {
      return
    }

    // TODO: change this so we only get given URL strings - child components should handle their own events
    if (typeof eventOrUrl === 'string') {
      if (type === 'internal' || type === 'default') {
        trackEvent('Link dropdown: Internal link chosen', {
          context: 'bookmark',
          fromLatest: type === 'default',
        })
      }
      if (type === 'url') {
        const target = isInternalUrl(eventOrUrl, cardConfig?.siteUrl ?? '') ? 'internal' : 'external'
        trackEvent('Link dropdown: URL entered', { context: 'bookmark', target })
      }

      fetchMetadata(eventOrUrl)
    }

    if (typeof eventOrUrl === 'object' && 'key' in eventOrUrl && eventOrUrl.key === 'Enter') {
      fetchMetadata((eventOrUrl.target as HTMLInputElement).value)
    }
  }

  const handleRetry = async (): Promise<void> => {
    setUrlError(false)
  }

  const handlePasteAsLink = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node) {
        return
      }
      const paragraph = $createParagraphNode().append(
        $createLinkNode(urlInputValue).append($createTextNode(urlInputValue)),
      )
      node.replace(paragraph)
      paragraph.selectEnd()
    })
  }, [editor, nodeKey, urlInputValue])

  const handleClose = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node) {
        return
      }
      const nextSibling = node.getNextSibling()
      if (nextSibling && $isParagraphNode(nextSibling) && nextSibling.getTextContentSize() === 0) {
        node.remove()
        nextSibling.selectEnd()
      } else {
        const paragraph = $createParagraphNode()
        node.replace(paragraph)
        paragraph.selectEnd()
      }
    })
  }, [editor, nodeKey])

  interface EmbedResponse {
    url: string
    metadata: {
      author: string
      icon: string
      title: string
      description: string
      publisher: string
      thumbnail: string
    }
  }

  const fetchMetadata = async (href: string): Promise<void> => {
    editor.getRootElement()?.focus({ preventScroll: true }) // focus editor before causing the input element to dismount
    setLoading(true)
    let response: EmbedResponse | undefined
    try {
      // set the test data return values in fetchEmbed.js
      response = (await cardConfig.fetchEmbed?.(href, { type: 'bookmark' })) as EmbedResponse | undefined
    } catch (e) {
      setLoading(false)
      setUrlError(true)
      return
    }
    if (!response) {
      setLoading(false)
      setUrlError(true)
      return
    }
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        const n = node as GeneratedDecoratorNodeBase
        n.url = href
        n.author = response.metadata.author
        n.icon = response.metadata.icon
        n.title = response.metadata.title
        n.description = response.metadata.description
        n.publisher = response.metadata.publisher
        n.thumbnail = response.metadata.thumbnail
      }
    })
    setLoading(false)
  }

  const fetchMetadataEffect = useCallback(async () => {
    setLoading(true)
    let response: EmbedResponse | undefined
    try {
      // set the test data return values in fetchEmbed.js
      response = (await cardConfig.fetchEmbed?.(url, { type: 'bookmark' })) as EmbedResponse | undefined
    } catch (e) {
      setLoading(false)
      setUrlError(true)
      return
    }
    if (!response) {
      setLoading(false)
      setUrlError(true)
      return
    }
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        const n = node as GeneratedDecoratorNodeBase
        n.url = response.url
        n.author = response.metadata.author
        n.icon = response.metadata.icon
        n.title = response.metadata.title
        n.description = response.metadata.description
        n.publisher = response.metadata.publisher
        n.thumbnail = response.metadata.thumbnail

        if (createdWithUrl) {
          n.selectNext()
        }
      }
    })
    setLoading(false)
    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // TODO: this needs to be a custom hook
  // if we create the node with a url
  //  fetch the metadata
  //  if it fails, paste as a link
  React.useEffect(() => {
    // only run this once
    if (createdWithUrl) {
      setUrlInputValue(url)
      try {
        fetchMetadataEffect()
      } catch {
        handlePasteAsLink()
      }
    }
    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const searchEnabled = typeof cardConfig?.searchLinks === 'function'

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
        searchLinks={cardConfig?.searchLinks}
        thumbnail={thumbnail}
        title={title}
        url={url}
        urlError={urlError}
        urlInputValue={urlInputValue}
        urlPlaceholder={
          searchEnabled ? `Paste URL or search posts and pages...` : `Paste URL to add bookmark content...`
        }
      />

      <ActionToolbar data-inkling-card-toolbar="bookmark" isVisible={showSnippetToolbar}>
        <SnippetCreateToolbar nodeKey={nodeKey} onClose={() => setShowSnippetToolbar(false)} />
      </ActionToolbar>

      <ActionToolbar
        data-inkling-card-toolbar="bookmark"
        isVisible={title ? isSelected && !showSnippetToolbar && !!cardConfig.createSnippet : false}
      >
        <ToolbarMenu>
          <ToolbarMenuItem
            dataTestId="create-snippet"
            hide={!cardConfig.createSnippet}
            icon="snippet"
            isActive={false}
            label="Save as snippet"
            onClick={() => setShowSnippetToolbar(true)}
          />
        </ToolbarMenu>
      </ActionToolbar>
    </>
  )
}
