/** Faithful copy of Koenig's FormatToolbar.jsx — snippet + aside removed */
import { $isListNode, ListNode } from '@lexical/list'
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, HeadingNode, QuoteNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { $getNearestNodeOfType } from '@lexical/utils'
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
} from 'lexical'
import { useState, useCallback, useEffect } from 'react'

import { ToolbarMenu, ToolbarMenuItem, ToolbarMenuSeparator } from '@/ui/inkling/components/ui/ToolbarMenu'
import { getSelectedNode } from '@/ui/inkling/utils/getSelectedNode'
import { altOrOption, ctrlOrCmdSymbol, ctrlOrSymbol } from '@/ui/inkling/utils/shortcutSymbols'

const blockTypeToBlockName: Record<string, string> = {
  bullet: 'Bulleted List',
  check: 'Check List',
  code: 'Code Block',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  number: 'Numbered List',
  paragraph: 'Normal',
  quote: 'Quote',
}

function quoteIcon(blockType = '') {
  if (blockType.endsWith('quote')) {
    return 'quoteOne' as const
  } else {
    return 'quote' as const
  }
}

export function FormatToolbar({
  editor,
  isLinkSelected,
  onLinkClick,
  hiddenFormats = [],
}: {
  editor: LexicalEditor
  isLinkSelected?: boolean
  onLinkClick?: () => void
  hiddenFormats?: string[]
}) {
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [blockType, setBlockType] = useState('paragraph')

  let hideHeading = false
  if (!editor.hasNodes([HeadingNode])) {
    hideHeading = true
  }

  let hideQuotes = false
  if (!editor.hasNodes([QuoteNode])) {
    hideQuotes = true
  }

  let hideBold = false
  if (hiddenFormats.includes('bold')) {
    hideBold = true
  }

  const updateState = useCallback(() => {
    editor.getEditorState().read(() => {
      // Should not pop up the floating toolbar when using IME input
      if (editor.isComposing()) {
        return
      }

      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        return
      }
      // update text format
      setIsBold(selection.hasFormat('bold'))
      setIsItalic(selection.hasFormat('italic'))

      const anchorNode = getSelectedNode(selection)
      const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow()
      const elementKey = element.getKey()
      const elementDOM = editor.getElementByKey(elementKey)

      if (elementDOM !== null) {
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType(anchorNode, ListNode)
          const type = parentList ? parentList.getListType() : element.getListType()
          setBlockType(type)
        } else {
          const type = $isHeadingNode(element) ? element.getTag() : element.getType()

          if (type in blockTypeToBlockName) {
            setBlockType(type)
          }
        }
      }
    })
  }, [editor])

  useEffect(() => {
    updateState()

    return editor.registerUpdateListener(() => {
      updateState()
    })
  }, [editor, updateState])

  const formatParagraph = () => {
    if (blockType !== 'paragraph') {
      editor.update(() => {
        const selection = $getSelection()

        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createParagraphNode())
        }
      })
    }
  }

  const formatHeading = (headingSize: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => {
    if (blockType !== headingSize) {
      editor.update(() => {
        const selection = $getSelection()

        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode(headingSize))
        }
      })
    }
  }

  const formatQuote = () => {
    editor.update(() => {
      const selection = $getSelection()

      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createQuoteNode())
      }
    })
  }

  return (
    <ToolbarMenu>
      <ToolbarMenuItem
        data-kg-toolbar-button="bold"
        hide={hideBold}
        icon="bold"
        isActive={isBold}
        label="加粗"
        shortcutKeys={[ctrlOrCmdSymbol(), 'B']}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
      />
      <ToolbarMenuItem
        data-kg-toolbar-button="italic"
        icon="italic"
        isActive={isItalic}
        label="斜体"
        shortcutKeys={[ctrlOrCmdSymbol(), 'I']}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
      />
      <ToolbarMenuItem
        data-kg-toolbar-button="h2"
        hide={hideHeading}
        icon="headingTwo"
        isActive={blockType === 'h2'}
        label="标题 2"
        shortcutKeys={[ctrlOrSymbol(), altOrOption(), '2']}
        onClick={() => (blockType === 'h2' ? formatParagraph() : formatHeading('h2'))}
      />
      <ToolbarMenuItem
        data-kg-toolbar-button="h3"
        hide={hideHeading}
        icon="headingThree"
        isActive={blockType === 'h3'}
        label="标题 3"
        shortcutKeys={[ctrlOrSymbol(), altOrOption(), '3']}
        onClick={() => (blockType === 'h3' ? formatParagraph() : formatHeading('h3'))}
      />
      <ToolbarMenuSeparator hide={hideQuotes} />
      <ToolbarMenuItem
        data-kg-toolbar-button="quote"
        hide={hideQuotes}
        icon={quoteIcon(blockType)}
        isActive={blockType.endsWith('quote')}
        label="引用"
        shortcutKeys={[ctrlOrSymbol(), 'Q']}
        onClick={formatQuote}
      />

      <ToolbarMenuItem
        data-kg-toolbar-button="link"
        icon="link"
        isActive={!!isLinkSelected}
        label="链接"
        shortcutKeys={[ctrlOrCmdSymbol(), 'K']}
        onClick={onLinkClick}
      />
    </ToolbarMenu>
  )
}
