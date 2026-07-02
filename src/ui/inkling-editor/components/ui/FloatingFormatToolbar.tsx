import type { LexicalEditor } from 'lexical'

import { TOGGLE_LINK_COMMAND } from '@lexical/link'
import { mergeRegister } from '@lexical/utils'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, DELETE_CHARACTER_COMMAND } from 'lexical'
import debounce from 'lodash/debounce'
import React from 'react'

import FloatingToolbar from '@/ui/inkling-editor/components/ui/FloatingToolbar'
import { default as FormatToolbar } from '@/ui/inkling-editor/components/ui/FormatToolbar'
import { LinkActionToolbarWithSearch } from '@/ui/inkling-editor/components/ui/LinkActionToolbarWithSearch'
import { LinkInput } from '@/ui/inkling-editor/components/ui/LinkInput'
import { SnippetActionToolbar } from '@/ui/inkling-editor/components/ui/SnippetActionToolbar'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'

// don't show the toolbar until the mouse has moved a certain distance,
// avoids accidental toolbar display when clicking buttons that select content
const MOUSE_MOVE_THRESHOLD = 5

export const toolbarItemTypes = {
  snippet: 'snippet',
  link: 'link',
  text: 'text',
}

export function FloatingFormatToolbar({
  editor,
  anchorElem,
  href,
  isSnippetsEnabled,
  toolbarItemType,
  setToolbarItemType,
  hiddenFormats = [],
}: {
  editor: LexicalEditor
  anchorElem: HTMLElement
  href?: string
  isSnippetsEnabled?: boolean
  toolbarItemType?: string | null
  setToolbarItemType: (type: string | null) => void
  hiddenFormats?: string[]
}) {
  const { cardConfig } = React.useContext(InklingComposerContext)
  const isLinkSearchEnabled = typeof cardConfig?.searchLinks === 'function' || false

  const toolbarRef = React.useRef<HTMLDivElement>(null)

  const isLinkSearchToolbarVisible = toolbarItemType === toolbarItemTypes.link && isLinkSearchEnabled

  // toolbar opacity is 0 by default
  // shouldn't display until selection via mouse is complete to avoid toolbar re-positioning while dragging
  const showToolbarIfHidden = React.useCallback(
    (e?: Event) => {
      if (toolbarItemType && toolbarRef.current?.style.opacity === '0') {
        toolbarRef.current.style.opacity = '1'
      }
    },
    [toolbarItemType],
  )

  React.useEffect(() => {
    const toggle = (e: Event) => {
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const selectedNodeMatchesTarget = selection.getNodes().find((node) => {
            const element = editor.getElementByKey(node.getKey())
            return element && (element.contains(e.target as Node) || (e.target as Node).contains(element))
          })

          if (selectedNodeMatchesTarget) {
            showToolbarIfHidden(e)
          }
        }
      })
    }

    document.addEventListener('mouseup', toggle) // desktop
    document.addEventListener('touchend', toggle) // mobile

    return () => {
      document.removeEventListener('mouseup', toggle) // desktop
      document.removeEventListener('touchend', toggle) // mobile
    }
  }, [editor, showToolbarIfHidden])

  // clear out toolbar when use removes selected content
  React.useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        () => {
          setToolbarItemType(null)
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor, setToolbarItemType])

  React.useEffect(() => {
    let initialPosition: { x: number; y: number } | null = null

    const onMouseMove = (e: MouseEvent) => {
      // ignore drag events
      if (e?.buttons > 0) {
        return
      }

      // avoid toggling toolbar until mouse has moved a certain distance
      if (!initialPosition) {
        initialPosition = { x: e.clientX, y: e.clientY }
      }

      const distanceMoved = Math.sqrt(
        Math.pow(e.clientX - initialPosition.x, 2) + Math.pow(e.clientY - initialPosition.y, 2),
      )

      if (distanceMoved < MOUSE_MOVE_THRESHOLD) {
        return
      }

      // reset initial position after threshold is met
      initialPosition = null

      // should not show floating toolbar when we don't have a text selection
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (selection === null || !$isRangeSelection(selection)) {
          return
        }
        if (selection.getTextContent() !== null) {
          showToolbarIfHidden(undefined)
        }
      })
    }
    const debouncedOnMouseMove = debounce(onMouseMove, 10)
    document.addEventListener('mousemove', debouncedOnMouseMove)
    return () => {
      document.removeEventListener('mousemove', debouncedOnMouseMove)
    }
  }, [editor, showToolbarIfHidden])

  const handleActionToolbarClose = () => {
    setToolbarItemType(null)
  }

  const isSnippetToolbar = toolbarItemTypes.snippet === toolbarItemType
  const isLinkToolbar = toolbarItemTypes.link === toolbarItemType
  const isTextToolbar = toolbarItemTypes.text === toolbarItemType

  const showTextToolbar = isTextToolbar || (isLinkSearchEnabled && isLinkToolbar)

  // When link searching is enabled the link toolbar has alternative styling
  // where the search input and results are displayed below the format toolbar.
  //
  // When link searching is disabled the link input toolbar visually replaces
  // the format toolbar.

  // oxlint-disable-next-line typescript/no-explicit-any
  return (
    <>
      <FloatingToolbar
        anchorElem={anchorElem}
        // toolbar opacity is 0 by default
        // shouldn't display until selection via mouse is complete to avoid toolbar re-positioning while dragging
        controlOpacity={!isTextToolbar}
        editor={editor}
        isVisible={!!toolbarItemType}
        onReposition={() => {}}
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
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, url || null)
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
            onLinkClick={() => setToolbarItemType!(toolbarItemTypes.link)}
            onSnippetClick={() => setToolbarItemType!(toolbarItemTypes.snippet)}
          />
        )}
      </FloatingToolbar>

      {isLinkSearchToolbarVisible && (
        <LinkActionToolbarWithSearch anchorElem={anchorElem} href={href} onClose={handleActionToolbarClose} />
      )}
    </>
  )
}
