import type { LexicalEditor } from 'lexical'

import React from 'react'

import FloatingToolbar from '@/components/ui/FloatingToolbar'
import { default as FormatToolbar } from '@/components/ui/FormatToolbar'
import { LinkActionToolbarWithSearch } from '@/components/ui/LinkActionToolbarWithSearch'
import { LinkInput } from '@/components/ui/LinkInput'
import { SnippetActionToolbar } from '@/components/ui/SnippetActionToolbar'
import { useInklingLinkingSettings } from '@/context/InklingHostIntegrationContext'
import { type HiddenFormat } from '@/plugins/behaviour/format-toolbar'
import { $applyLinkToSelection } from '@/plugins/behaviour/link-editing'

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
}: {
  editor: LexicalEditor
  anchorElem: HTMLElement
  href?: string
  isSnippetsEnabled?: boolean
  toolbarItemType?: string | null
  /** Owned by FloatingToolbarPlugin, which runs the reveal-feed DOM subscription against it. */
  toolbarRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  onOpenLink: () => void
  onOpenSnippet: () => void
  hiddenFormats?: HiddenFormat[]
}) {
  const { searchLinks } = useInklingLinkingSettings()
  const isLinkSearchEnabled = typeof searchLinks === 'function'

  const isLinkSearchToolbarVisible = toolbarItemType === toolbarItemTypes.link && isLinkSearchEnabled

  const handleActionToolbarClose = onClose

  const isSnippetToolbar = toolbarItemTypes.snippet === toolbarItemType
  const isLinkToolbar = toolbarItemTypes.link === toolbarItemType
  const isTextToolbar = toolbarItemTypes.text === toolbarItemType

  const showTextToolbar = isTextToolbar || (isLinkSearchEnabled && isLinkToolbar)

  // When link searching is enabled the link toolbar has alternative styling
  // where the search input and results are displayed below the format toolbar.
  //
  // When link searching is disabled the link input toolbar visually replaces
  // the format toolbar.

  return (
    <>
      <FloatingToolbar
        anchorElem={anchorElem}
        // toolbar opacity is 0 by default
        // shouldn't display until selection via mouse is complete to avoid toolbar re-positioning while dragging
        controlOpacity={!isTextToolbar}
        editor={editor}
        isVisible={!!toolbarItemType}
        shouldReposition={toolbarItemType !== toolbarItemTypes.text} // format toolbar shouldn't reposition when applying formats
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
