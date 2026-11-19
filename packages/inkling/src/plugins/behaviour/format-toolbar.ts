import { $createAsideNode } from '@kobato/inkling-internal/nodes/AsideNode'
import { getSelectedNode } from '@kobato/inkling-internal/utils/get-selected-node'
import { isNestedEditor } from '@kobato/inkling-internal/utils/lexical-internals'
import { $isListNode, ListNode } from '@lexical/list'
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
  type HeadingTagType,
} from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { $getNearestNodeOfType } from '@lexical/utils'
import {
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  type ElementFormatType,
  type LexicalEditor,
} from 'lexical'

export const FORMAT_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'bullet',
  'check',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'number',
  'paragraph',
  'quote',
  'extended-quote',
  'aside',
])

export interface FormatToolbarState {
  isBold: boolean
  isItalic: boolean
  blockType: string

  elementFormat: ElementFormatType | ''
}

export function registerFormatToolbarState(
  editor: LexicalEditor,
  publish: (state: FormatToolbarState) => void,
): () => void {
  let state: FormatToolbarState = { isBold: false, isItalic: false, blockType: 'paragraph', elementFormat: '' }

  const update = () => {
    editor.getEditorState().read(() => {
      if (editor.isComposing()) {
        return
      }
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        return
      }

      const next: FormatToolbarState = {
        ...state,
        isBold: selection.hasFormat('bold'),
        isItalic: selection.hasFormat('italic'),
      }

      const anchorNode = getSelectedNode(selection)
      const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow()

      if (editor.getElementByKey(element.getKey()) !== null) {
        next.elementFormat = $isElementNode(element) ? element.getFormatType() : ''
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType(anchorNode, ListNode)
          next.blockType = parentList ? parentList.getListType() : element.getListType()
        } else {
          const type = $isHeadingNode(element) ? element.getTag() : element.getType()
          if (FORMAT_BLOCK_TYPES.has(type)) {
            next.blockType = type
          }
        }
      }

      state = next
      publish(state)
    })
  }
  publish(state)
  update()
  return editor.registerUpdateListener(update)
}

export function $formatBlocksToParagraph(editor: LexicalEditor): void {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      $setBlocksType(selection, () => $createParagraphNode())
    }
  })
}

export function $formatBlocksToHeading(editor: LexicalEditor, headingSize: HeadingTagType): void {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      $setBlocksType(selection, () => $createHeadingNode(headingSize))
    }
  })
}

export function $cycleQuoteBlock(editor: LexicalEditor, blockType: string): void {
  editor.update(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return
    }
    if (blockType.endsWith('quote')) {
      $setBlocksType(selection, () => $createAsideNode())
    } else if (blockType.endsWith('aside')) {
      $setBlocksType(selection, () => $createParagraphNode())
    } else {
      $setBlocksType(selection, () => $createQuoteNode())
    }
  })
}

export type BlockAlignment = 'left' | 'center' | 'right'
export function $setBlocksAlignment(editor: LexicalEditor, alignment: BlockAlignment): void {
  editor.update(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return
    }
    const seen = new Set<string>()
    for (const node of selection.getNodes()) {
      const element = node.getTopLevelElement()
      if (element === null || seen.has(element.getKey())) {
        continue
      }
      seen.add(element.getKey())
      if ($isParagraphNode(element) || $isHeadingNode(element) || $isQuoteNode(element)) {
        element.setFormat(alignment)
      }
    }
  })
}
export interface FormatToolbarVisibility {
  hideHeading: boolean
  hideQuotes: boolean
  hideSnippets: boolean
  hideBold: boolean
  hideAlignment: boolean
}

/** The formats a surface can hide from the toolbar — 'bold' is the only honored value; any other string is a silent no-op. */
export type HiddenFormat = 'bold'

export function resolveFormatToolbarVisibility(
  editor: LexicalEditor,
  {
    isSnippetsEnabled,
    canCreateSnippet,
    hiddenFormats = [],
    isAlignmentEnabled = false,
  }: {
    isSnippetsEnabled?: boolean
    canCreateSnippet: boolean
    hiddenFormats?: HiddenFormat[]
    isAlignmentEnabled?: boolean
  },
): FormatToolbarVisibility {
  return {
    hideHeading: !editor.hasNodes([HeadingNode]),
    hideQuotes: !editor.hasNodes([QuoteNode]),
    hideSnippets: !isSnippetsEnabled || !canCreateSnippet || isNestedEditor(editor),
    hideBold: hiddenFormats.includes('bold'),
    hideAlignment: !isAlignmentEnabled,
  }
}
