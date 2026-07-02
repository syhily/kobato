import { TOGGLE_LINK_COMMAND } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createRangeSelection, $getSelection, $isRangeSelection, $isTextNode, $setSelection } from 'lexical'
import React from 'react'

import { LinkInputWithSearch } from '@/ui/inkling-editor/components/ui/LinkInputWithSearch'
import Portal from '@/ui/inkling-editor/components/ui/Portal'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { $getSelectionRangeRect } from '@/ui/inkling-editor/utils/$getSelectionRangeRect'
import trackEvent from '@/ui/inkling-editor/utils/analytics'
import { getScrollParent } from '@/ui/inkling-editor/utils/getScrollParent'
import { isInternalUrl } from '@/ui/inkling-editor/utils/isInternalUrl'

interface LinkActionToolbarWithSearchProps {
  anchorElem: HTMLElement
  href?: string
  onClose: () => void
  [key: string]: unknown
}

export function LinkActionToolbarWithSearch({ anchorElem, href, onClose, ...props }: LinkActionToolbarWithSearchProps) {
  const [editor] = useLexicalComposerContext()
  const { cardConfig } = React.useContext(InklingComposerContext)

  const scrollContainer = React.useMemo(() => {
    return getScrollParent(editor.getRootElement())
  }, [editor])

  const linkToolbarRef = React.useRef<HTMLDivElement | null>(null)

  // Position the link input and search results when they open.
  // Appears below the selected text unless at bottom of the document where it appears above toolbar.
  const updateLinkToolbarPosition = React.useCallback(() => {
    editor.update(() => {
      const toolbarElement = linkToolbarRef.current
      if (!toolbarElement) {
        return
      }

      const selection = $getSelection()
      if (!selection) {
        return
      }

      const rangeRect = $getSelectionRangeRect({ editor, selection })

      const editorElem = anchorElem.parentElement

      if (!rangeRect || !editorElem || !toolbarElement || !scrollContainer) {
        return
      }

      const editorRect = editorElem.getBoundingClientRect()

      const top = rangeRect.bottom + 10
      const left = editorRect.left
      const right = editorRect.right

      toolbarElement.style.top = `${top}px`
      toolbarElement.style.left = `${left}px`
      toolbarElement.style.width = `${right - left}px`

      // TODO: Max height is hardcoded to 30% of window height for results list + 54px (toolbar height),
      //  this is based on current styling and will need adjusting if styles change. We make this calculation
      //  to avoid the toolbar jumping between above/below positioning when the results list changes size.
      const toolbarMaxHeight = (window.innerHeight / 100) * 30 + 54
      const toolbarRect = toolbarElement.getBoundingClientRect()

      if (scrollContainer.scrollTop + toolbarRect.top + toolbarMaxHeight > scrollContainer.scrollHeight) {
        toolbarElement.style.top = `${rangeRect.top - toolbarRect.height - 55}px`
      }
    })
  }, [anchorElem, editor, scrollContainer])

  React.useEffect(() => {
    updateLinkToolbarPosition()
  }, [updateLinkToolbarPosition])

  // re-position on document scroll, window resize,
  // plus search results change to avoid gap appearing when positioned above the toolbar
  React.useEffect(() => {
    const scrollElement = getScrollParent(anchorElem)

    const onResize = () => updateLinkToolbarPosition()
    const onScroll = () => updateLinkToolbarPosition()
    window.addEventListener('resize', onResize)
    if (scrollElement) {
      scrollElement.addEventListener('scroll', onScroll)
    }

    const toolbarElement = linkToolbarRef.current
    const toolbarMutationObserver = new MutationObserver(() => updateLinkToolbarPosition())
    if (toolbarElement) {
      toolbarMutationObserver.observe(toolbarElement, { childList: true, subtree: true })
    }

    return () => {
      window.removeEventListener('resize', onResize)
      if (scrollElement) {
        scrollElement.removeEventListener('scroll', onScroll)
      }
      if (toolbarElement) {
        toolbarMutationObserver.disconnect()
      }
    }
  }, [anchorElem, updateLinkToolbarPosition])

  const onLinkUpdate = (updatedHref: string, type?: string) => {
    editor.update(() => {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, updatedHref || null)

      // remove selection to avoid format menu popup
      const selection = $getSelection()
      if (selection && $isRangeSelection(selection)) {
        const focusNode = selection.focus.getNode()
        if ($isTextNode(focusNode)) {
          const rangeSelection = $createRangeSelection()
          rangeSelection.setTextNodeRange(
            focusNode,
            focusNode.getTextContentSize(),
            focusNode,
            focusNode.getTextContentSize(),
          )
          $setSelection(rangeSelection)
        }
      }

      onClose()

      if (type === 'internal' || type === 'default') {
        trackEvent('Link dropdown: Internal link chosen', { context: 'text', fromLatest: type === 'default' })
      } else {
        try {
          const target = isInternalUrl(updatedHref, cardConfig?.siteUrl) ? 'internal' : 'external'
          trackEvent('Link dropdown: URL entered', { context: 'text', target })
        } catch {
          // noop
        }
      }
    })
  }

  return (
    <Portal>
      <div ref={linkToolbarRef} className="not-inkling-prose fixed z-[10000]">
        <LinkInputWithSearch cancel={onClose} href={href} update={onLinkUpdate} {...props} />
      </div>
    </Portal>
  )
}
