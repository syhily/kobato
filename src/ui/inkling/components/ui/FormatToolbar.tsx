import { TOGGLE_LINK_COMMAND } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { $getSelection, $isRangeSelection } from 'lexical'
import { useEffect, useState } from 'react'

import { FloatingToolbar } from '@/ui/inkling/components/ui/FloatingToolbar'
import { ToolbarMenu, ToolbarMenuItem, ToolbarMenuSeparator } from '@/ui/inkling/components/ui/ToolbarMenu'

/**
 * Text format toolbar — ported from Koenig's FormatToolbar.jsx +
 * FloatingFormatToolbar.jsx.
 *
 * Shows when the user selects text. Buttons:
 *   article mode: Bold | Italic | H2 | H3 | Quote | Link
 *   comment mode: Bold | Italic | Link
 *
 * Removed from Koenig: snippet button, aside toggle.
 */
type EditorMode = 'article' | 'comment'

export function FormatToolbar({
  mode,
  isVisible,
  onLinkClick,
}: {
  mode: EditorMode
  isVisible: boolean
  onLinkClick?: () => void
}) {
  const [editor] = useLexicalComposerContext()
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isQuote, setIsQuote] = useState(false)

  // Sync format state on every editor update
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          return
        }
        setIsBold(selection.hasFormat('bold'))
        setIsItalic(selection.hasFormat('italic'))

        const anchorNode = selection.anchor.getNode()
        const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow()
        setIsQuote(element.getType() === 'quote')
      })
    })
  }, [editor])

  const formatBold = () => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        selection.formatText('bold')
      }
    })
  }

  const formatItalic = () => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        selection.formatText('italic')
      }
    })
  }

  const formatHeading = (level: 2 | 3) => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createHeadingNode(`h${level}`))
      }
    })
  }

  const formatQuote = () => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createQuoteNode())
      }
    })
  }

  const insertLink = () => {
    if (onLinkClick !== undefined) {
      onLinkClick()
      return
    }
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, 'https://')
  }

  // Cmd/Ctrl+K → insert link
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        insertLink()
      }
    }
    const rootElement = editor.getRootElement()
    rootElement?.addEventListener('keydown', handleKeyDown)
    return () => {
      rootElement?.removeEventListener('keydown', handleKeyDown)
    }
  }, [editor])

  return (
    <FloatingToolbar isVisible={isVisible}>
      <ToolbarMenu>
        <ToolbarMenuItem icon="bold" label="加粗" shortcut="⌘B" isActive={isBold} onClick={formatBold} />
        <ToolbarMenuItem icon="italic" label="斜体" shortcut="⌘I" isActive={isItalic} onClick={formatItalic} />

        {mode === 'article' && (
          <>
            <ToolbarMenuSeparator />
            <ToolbarMenuItem icon="headingTwo" label="标题 2" shortcut="⌘⌥2" onClick={() => formatHeading(2)} />
            <ToolbarMenuItem icon="headingThree" label="标题 3" shortcut="⌘⌥3" onClick={() => formatHeading(3)} />
            <ToolbarMenuItem icon="quote" label="引用" shortcut="⌘Q" isActive={isQuote} onClick={formatQuote} />
          </>
        )}

        <ToolbarMenuSeparator />
        <ToolbarMenuItem icon="link" label="链接" shortcut="⌘K" onClick={insertLink} />
      </ToolbarMenu>
    </FloatingToolbar>
  )
}
