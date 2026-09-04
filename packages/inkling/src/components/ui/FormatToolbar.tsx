import type { HeadingTagType } from '@lexical/rich-text'

import { FORMAT_TEXT_COMMAND, type LexicalEditor } from 'lexical'
import React from 'react'

import { ToolbarMenu, ToolbarMenuItem, ToolbarMenuSeparator, type ToolbarIconName } from '@/components/ui/ToolbarMenu'
import { useInklingSnippetSettings } from '@/context/InklingHostIntegrationContext'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import {
  $cycleQuoteBlock,
  $formatBlocksToHeading,
  $formatBlocksToParagraph,
  $setBlocksAlignment,
  registerFormatToolbarState,
  resolveFormatToolbarVisibility,
  type FormatToolbarState,
  type HiddenFormat,
} from '@/plugins/behaviour/format-toolbar'
import { altOrOption, ctrlOrCmdSymbol, ctrlOrSymbol } from '@/utils/shortcutSymbols'

function quoteIcon(blockType = ''): ToolbarIconName {
  if (blockType.endsWith('quote')) {
    return 'quoteOne'
  } else if (blockType.endsWith('aside')) {
    return 'quoteTwo'
  } else {
    return 'quote'
  }
}

interface FormatToolbarProps {
  editor: LexicalEditor
  isSnippetsEnabled?: boolean
  isLinkSelected?: boolean
  onLinkClick?: () => void
  onSnippetClick?: () => void
  hiddenFormats?: HiddenFormat[]
  /** Surfaces that keep element `format` (InklingComposableEditor's `alignment` prop) expose the alignment group. */
  isAlignmentEnabled?: boolean
}

// the selection classifier, the block-format surgeries, and the visibility
// gates live in @/plugins/behaviour/format-toolbar (a synchronous test
// table); this component is the render adapter
export default function FormatToolbar({
  editor,
  isSnippetsEnabled,
  isLinkSelected,
  onLinkClick,
  onSnippetClick,
  hiddenFormats = [],
  isAlignmentEnabled = false,
}: FormatToolbarProps) {
  const [state, setState] = React.useState<FormatToolbarState>({
    isBold: false,
    isItalic: false,
    blockType: 'paragraph',
    elementFormat: '',
  })
  const { createSnippet } = useInklingSnippetSettings()
  const labels = useInklingLabels()

  const { hideHeading, hideQuotes, hideSnippets, hideBold, hideAlignment } = resolveFormatToolbarVisibility(editor, {
    isSnippetsEnabled,
    canCreateSnippet: !!createSnippet,
    hiddenFormats,
    isAlignmentEnabled,
  })

  React.useEffect(() => registerFormatToolbarState(editor, setState), [editor])

  const { isBold, isItalic, blockType, elementFormat } = state

  const formatHeading = (headingSize: HeadingTagType) => {
    if (blockType !== headingSize) {
      $formatBlocksToHeading(editor, headingSize)
    }
  }

  return (
    <ToolbarMenu>
      <ToolbarMenuItem
        data-inkling-toolbar-button="bold"
        hide={hideBold}
        icon="bold"
        isActive={isBold}
        label={labels['toolbar.bold']}
        shortcutKeys={[ctrlOrCmdSymbol(), 'B']}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
      />
      <ToolbarMenuItem
        data-inkling-toolbar-button="italic"
        icon="italic"
        isActive={isItalic}
        label={labels['toolbar.emphasize']}
        shortcutKeys={[ctrlOrCmdSymbol(), 'I']}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
      />
      <ToolbarMenuItem
        data-inkling-toolbar-button="h2"
        hide={hideHeading}
        icon="headingTwo"
        isActive={blockType === 'h2'}
        label={labels['toolbar.heading2']}
        shortcutKeys={[ctrlOrSymbol(), altOrOption(), '2']}
        onClick={() => (blockType === 'h2' ? $formatBlocksToParagraph(editor) : formatHeading('h2'))}
      />
      <ToolbarMenuItem
        data-inkling-toolbar-button="h3"
        hide={hideHeading}
        icon="headingThree"
        isActive={blockType === 'h3'}
        label={labels['toolbar.heading3']}
        shortcutKeys={[ctrlOrSymbol(), altOrOption(), '3']}
        onClick={() => (blockType === 'h3' ? $formatBlocksToParagraph(editor) : formatHeading('h3'))}
      />
      <ToolbarMenuSeparator hide={hideQuotes} />
      <ToolbarMenuItem
        data-inkling-toolbar-button="quote"
        hide={hideQuotes}
        icon={quoteIcon(blockType)}
        isActive={blockType.endsWith('quote') || blockType.endsWith('aside')}
        label={labels['toolbar.quote']}
        shortcutKeys={[ctrlOrSymbol(), 'Q']}
        onClick={() => $cycleQuoteBlock(editor, blockType)}
      />

      <ToolbarMenuSeparator hide={hideAlignment} />
      <ToolbarMenuItem
        data-inkling-toolbar-button="align-left"
        hide={hideAlignment}
        icon="alignLeft"
        isActive={elementFormat === '' || elementFormat === 'left'}
        label={labels['toolbar.alignLeft']}
        onClick={() => $setBlocksAlignment(editor, 'left')}
      />
      <ToolbarMenuItem
        data-inkling-toolbar-button="align-center"
        hide={hideAlignment}
        icon="alignCenter"
        isActive={elementFormat === 'center'}
        label={labels['toolbar.alignCenter']}
        onClick={() => $setBlocksAlignment(editor, 'center')}
      />
      <ToolbarMenuItem
        data-inkling-toolbar-button="align-right"
        hide={hideAlignment}
        icon="alignRight"
        isActive={elementFormat === 'right'}
        label={labels['toolbar.alignRight']}
        onClick={() => $setBlocksAlignment(editor, 'right')}
      />

      <ToolbarMenuItem
        data-inkling-toolbar-button="link"
        icon="link"
        isActive={!!isLinkSelected}
        label={labels['toolbar.link']}
        shortcutKeys={[ctrlOrCmdSymbol(), 'K']}
        onClick={onLinkClick}
      />

      <ToolbarMenuSeparator hide={hideSnippets} />
      <ToolbarMenuItem
        data-inkling-toolbar-button="snippet"
        hide={hideSnippets}
        icon="snippet"
        isActive={false}
        label={labels['toolbar.saveAsSnippet']}
        onClick={onSnippetClick}
      />
    </ToolbarMenu>
  )
}
