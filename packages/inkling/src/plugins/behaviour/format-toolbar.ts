/**
 * The block-format policy behind `FormatToolbar` (the React adapter renders
 * ToolbarMenuItems from this module's snapshot and dispatches its
 * surgeries): the selection classifier (text formats + top-level block
 * type), the block-format surgeries (paragraph / heading / the
 * quote→aside→paragraph cycle), and the visibility gates — all headless, so
 * the matrix is a synchronous test table instead of e2e-only. Deliberately
 * NOT unified with the toolbar session's selection sync
 * (link-editing.ts): that classifier feeds the floating toolbar's
 * hidden|text|link|snippet state machine — a different policy for a
 * different consumer.
 */

import { $isListNode, ListNode } from '@lexical/list'
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  HeadingNode,
  QuoteNode,
  type HeadingTagType,
} from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { $getNearestNodeOfType } from '@lexical/utils'
import { $createParagraphNode, $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical'

import { $createAsideNode } from '@/nodes/AsideNode'
import { getSelectedNode } from '@/utils/getSelectedNode'
import { isNestedEditor } from '@/utils/lexical-internals'

/** The block types the toolbar tracks — only membership is read, so this is a Set, not a label map. */
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
}

/**
 * The selection classifier as a feed: publishes the text formats on every
 * relevant update and the block type only when it resolves (an unknown
 * element type keeps the previous block type, matching the component's
 * former setState semantics). The composing guard keeps the toolbar from
 * popping during IME input. Publishes the default snapshot at registration
 * (the component's former initial state), then per update.
 */
export function registerFormatToolbarState(
  editor: LexicalEditor,
  publish: (state: FormatToolbarState) => void,
): () => void {
  let state: FormatToolbarState = { isBold: false, isItalic: false, blockType: 'paragraph' }

  const update = () => {
    editor.getEditorState().read(() => {
      // Should not pop up the floating toolbar when using IME input
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

  // the default snapshot stands in for the component's former initial state
  publish(state)
  update()
  return editor.registerUpdateListener(update)
}

/** Sets every selected block to a paragraph (no-op without a range selection). */
export function $formatBlocksToParagraph(editor: LexicalEditor): void {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      $setBlocksType(selection, () => $createParagraphNode())
    }
  })
}

/** Sets every selected block to the given heading tag. */
export function $formatBlocksToHeading(editor: LexicalEditor, headingSize: HeadingTagType): void {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      $setBlocksType(selection, () => $createHeadingNode(headingSize))
    }
  })
}

/**
 * The quote cycle: quote → aside → paragraph → quote. The current block
 * type arrives as data (the feed's snapshot), so the cycle is a pure
 * three-way policy, not a component branch.
 */
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

export interface FormatToolbarVisibility {
  hideHeading: boolean
  hideQuotes: boolean
  hideSnippets: boolean
  hideBold: boolean
}

/**
 * The visibility gates: headings/quotes hide when the surface didn't
 * compose their nodes; snippets hide when disabled, when the host can't
 * create them, or inside a nested editor; bold hides when the surface
 * declares it in `hiddenFormats`.
 */
/** The formats a surface can hide from the toolbar — 'bold' is the only honored value today; any other string was a silent no-op. */
export type HiddenFormat = 'bold'

export function resolveFormatToolbarVisibility(
  editor: LexicalEditor,
  {
    isSnippetsEnabled,
    canCreateSnippet,
    hiddenFormats = [],
  }: { isSnippetsEnabled?: boolean; canCreateSnippet: boolean; hiddenFormats?: HiddenFormat[] },
): FormatToolbarVisibility {
  return {
    hideHeading: !editor.hasNodes([HeadingNode]),
    hideQuotes: !editor.hasNodes([QuoteNode]),
    hideSnippets: !isSnippetsEnabled || !canCreateSnippet || isNestedEditor(editor),
    hideBold: hiddenFormats.includes('bold'),
  }
}
