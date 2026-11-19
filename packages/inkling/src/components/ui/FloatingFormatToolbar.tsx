import type { LexicalEditor } from 'lexical'

import FloatingToolbar from '@kobato/inkling-internal/components/ui/FloatingToolbar'
import { default as FormatToolbar } from '@kobato/inkling-internal/components/ui/FormatToolbar'
import { LinkActionToolbarWithSearch } from '@kobato/inkling-internal/components/ui/LinkActionToolbarWithSearch'
import { LinkInput } from '@kobato/inkling-internal/components/ui/LinkInput'
import { SnippetActionToolbar } from '@kobato/inkling-internal/components/ui/SnippetActionToolbar'
import { useInklingLinkingSettings } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { type HiddenFormat } from '@kobato/inkling-internal/plugins/behaviour/format-toolbar'
import { $applyLinkToSelection } from '@kobato/inkling-internal/plugins/behaviour/link-editing'
import React from 'react'

export const toolbarItemTypes = {
  snippet: 'snippet',
  link: 'link',
  text: 'text',
} as const

export function FloatingFormatToolbar({
  editor,
  anchorElem,
  href,
  isSnippetsEnabled,
  toolbarItemType,
  toolbarRef,
  onClose,
  onOpenLink,
  onOpenSnippet,
  hiddenFormats = [],
  isAlignmentEnabled = false,
}: {
  editor: LexicalEditor
  anchorElem: HTMLElement
  href?: string
  isSnippetsEnabled?: boolean
  toolbarItemType?: string | null
  toolbarRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  onOpenLink: () => void
  onOpenSnippet: () => void
  hiddenFormats?: HiddenFormat[]
  isAlignmentEnabled?: boolean
}) {
  const { searchLinks } = useInklingLinkingSettings()
  const isLinkSearchEnabled = typeof searchLinks === 'function'

  const isLinkSearchToolbarVisible = toolbarItemType === toolbarItemTypes.link && isLinkSearchEnabled

  const handleActionToolbarClose = onClose

  const isSnippetToolbar = toolbarItemTypes.snippet === toolbarItemType
  const isLinkToolbar = toolbarItemTypes.link === toolbarItemType
  const isTextToolbar = toolbarItemTypes.text === toolbarItemType

  const showTextToolbar = isTextToolbar || (isLinkSearchEnabled && isLinkToolbar)

  return (
    <>
      <FloatingToolbar
        anchorElem={anchorElem}

        controlOpacity={!isTextToolbar}
        editor={editor}
        isVisible={!!toolbarItemType}
        shouldReposition={toolbarItemType !== toolbarItemTypes.text}
        targetElem={null}
        toolbarRef={toolbarRef}
      >
        {isSnippetToolbar && <SnippetActionToolbar onClose={handleActionToolbarClose} />}
        {isLinkToolbar && !isLinkSearchEnabled && (
          <LinkInput
            href={href}
            cancel={handleActionToolbarClose}
            update={(url) => {
              editor.update(() => {
                $applyLinkToSelection(editor, url)
              })
              handleActionToolbarClose()
            }}
          />
        )}

        {showTextToolbar && (
          <FormatToolbar
            editor={editor}
            hiddenFormats={hiddenFormats}
            isAlignmentEnabled={isAlignmentEnabled}
            isLinkSelected={!!href || (isLinkSearchEnabled && isLinkToolbar)}
            isSnippetsEnabled={isSnippetsEnabled}
            onLinkClick={onOpenLink}
            onSnippetClick={onOpenSnippet}
          />
        )}
      </FloatingToolbar>

      {isLinkSearchToolbarVisible && (
        <LinkActionToolbarWithSearch anchorElem={anchorElem} href={href} onClose={handleActionToolbarClose} />
      )}
    </>
  )
}
