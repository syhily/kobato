/** Faithful copy of Koenig's FloatingToolbarPlugin.jsx — link-search removed */
import { $isLinkNode } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isParagraphNode, $isRangeSelection, $isTextNode } from 'lexical'
import { useCallback, useEffect, useState } from 'react'

import {
  FloatingFormatToolbar,
  toolbarItemTypes,
  type ToolbarItemType,
} from '@/ui/inkling/components/ui/FloatingFormatToolbar'
import { getSelectedNode } from '@/ui/inkling/utils/getSelectedNode'

export function FloatingToolbarPlugin({
  anchorElem,
  hiddenFormats = [],
}: {
  anchorElem?: HTMLElement
  hiddenFormats?: string[]
}) {
  const [editor] = useLexicalComposerContext()
  const elem = anchorElem ?? (typeof document !== 'undefined' ? document.body : null)

  const [toolbarItemType, setToolbarItemType] = useState<ToolbarItemType>(null)
  const [href, setHref] = useState<string>('')

  const setToolbarType = useCallback(() => {
    editor.getEditorState().read(() => {
      if (editor.isComposing()) {
        return
      }

      const selection = $getSelection()
      const nativeSelection = window.getSelection()
      const rootElement = editor.getRootElement()

      // close toolbar if selection was outside of editor
      if (
        nativeSelection !== null &&
        (!$isRangeSelection(selection) || rootElement === null || !rootElement.contains(nativeSelection.anchorNode))
      ) {
        setToolbarItemType(null)
        return
      }

      if (!$isRangeSelection(selection)) {
        if (toolbarItemType) {
          setToolbarItemType(null)
        }
        return
      }

      const anchorNode = getSelectedNode(selection)
      const parent = anchorNode.getParent()

      if ($isLinkNode(parent)) {
        setHref(parent.getURL())
      } else if ($isLinkNode(anchorNode)) {
        setHref(anchorNode.getURL())
      } else {
        setHref('')
      }

      if (selection.getTextContent().trim() !== '' && ($isTextNode(anchorNode) || $isParagraphNode(anchorNode))) {
        setToolbarItemType(toolbarItemTypes.text)
        return
      }

      setToolbarItemType(null)
    })
  }, [editor, toolbarItemType])

  useEffect(() => {
    document.addEventListener('selectionchange', setToolbarType)
    return () => {
      document.removeEventListener('selectionchange', setToolbarType)
    }
  }, [setToolbarType])

  // use native mousedown event so the toolbar can close when something is
  // clicked outside of the editor and the selection is lost
  useEffect(() => {
    const handleMousedown = (event: MouseEvent) => {
      if (elem && !elem.contains(event.target as Node)) {
        setToolbarItemType(null)
      }
    }

    document.addEventListener('mousedown', handleMousedown)

    return () => {
      document.removeEventListener('mousedown', handleMousedown)
    }
  })

  if (!elem) {
    return null
  }

  return (
    <FloatingFormatToolbar
      anchorElem={elem}
      editor={editor}
      hiddenFormats={hiddenFormats}
      href={href}
      toolbarItemType={toolbarItemType}
      setToolbarItemType={setToolbarItemType}
    />
  )
}
