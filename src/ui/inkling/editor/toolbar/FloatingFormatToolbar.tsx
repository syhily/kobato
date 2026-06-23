import type { LexicalEditor } from 'lexical'

import { $isLinkNode } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, SELECTION_CHANGE_COMMAND } from 'lexical'
import { BoldIcon, CodeIcon, ItalicIcon, Link2Icon, StrikethroughIcon, UnderlineIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getSelectionRect } from '@/ui/inkling/editor/shared/dom-selection'
import { readEditor } from '@/ui/inkling/editor/shared/read-editor'
import { LinkPopover } from '@/ui/inkling/editor/toolbar/LinkPopover'

interface ToolbarButtonProps {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}

function ToolbarButton({ active, onClick, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className="inkling-toolbar-button"
    >
      {children}
    </button>
  )
}

interface FormatState {
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  code: boolean
  link: boolean
}

const EMPTY_FORMAT_STATE: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  code: false,
  link: false,
}

/**
 * Read the current format state from the editor selection. Returns a snapshot
 * of which formats are active so the toolbar buttons reflect the selection
 * without needing a `forceUpdate` hack.
 */
function readFormatState(editor: LexicalEditor): FormatState {
  return readEditor(editor, () => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return EMPTY_FORMAT_STATE
    }
    return {
      bold: selection.hasFormat('bold'),
      italic: selection.hasFormat('italic'),
      underline: selection.hasFormat('underline'),
      strikethrough: selection.hasFormat('strikethrough'),
      code: selection.hasFormat('code'),
      link: selection.getNodes().some((n) => $isLinkNode(n.getParent())),
    }
  })
}

function shouldShowToolbar(editor: LexicalEditor): boolean {
  if (editor.isComposing()) {
    return false
  }
  return readEditor(editor, () => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || selection.isCollapsed()) {
      return false
    }
    return selection.getTextContent().trim().length > 0
  })
}

export function FloatingFormatToolbar() {
  const [editor] = useLexicalComposerContext()
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [showLinkPopover, setShowLinkPopover] = useState(false)
  const [formatState, setFormatState] = useState<FormatState>(EMPTY_FORMAT_STATE)
  const toolbarRef = useRef<HTMLDivElement>(null)

  const selectRect = useCallback(() => {
    const rootEl = editor.getRootElement()
    if (rootEl === null) {
      return null
    }
    const rect = getSelectionRect(rootEl)
    if (rect === null) {
      return null
    }
    return { top: rect.top - 40, left: rect.left + rect.width / 2 }
  }, [editor])

  // SELECTION_CHANGE_COMMAND is the single source of truth for toolbar
  // visibility + position + format state. Updating all three in one callback
  // (instead of reading format state during render via forceUpdate) means
  // React only re-renders when the selection actually changes.
  useEffect(() => {
    const unregister = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        if (shouldShowToolbar(editor)) {
          const pos = selectRect()
          if (pos !== null) {
            setPosition(pos)
            setVisible(true)
            setFormatState(readFormatState(editor))
          }
        } else {
          // Hiding the toolbar also closes the link popover. Without this
          // reset, clicking away (collapsing the selection) unmounts the
          // toolbar but leaves `showLinkPopover` true — so the popover
          // reappears on the very next text selection, trapping the user
          // in "enter a link" mode until they explicitly cancel.
          setVisible(false)
          setShowLinkPopover(false)
        }
        return false
      },
      1,
    )
    return unregister
  }, [editor, selectRect])

  // Viewport listeners (scroll/resize) only reposition the toolbar — they
  // don't change format state. Split into a separate effect from the command
  // registration so neither depends on `visible` (the command registration
  // would otherwise tear down and rebuild on every show/hide).
  useEffect(() => {
    if (!visible) {
      return undefined
    }
    const handleViewportChange = () => {
      const pos = selectRect()
      if (pos !== null) {
        setPosition(pos)
      }
    }
    window.addEventListener('scroll', handleViewportChange, { passive: true })
    window.addEventListener('resize', handleViewportChange)
    return () => {
      window.removeEventListener('scroll', handleViewportChange)
      window.removeEventListener('resize', handleViewportChange)
    }
  }, [visible, selectRect])

  if (!visible || position === null) {
    return null
  }
  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="文本格式化"
      className="inkling-toolbar inkling-toolbar--with-caret absolute z-50 -translate-x-1/2"
      style={{ top: position.top, left: position.left }}
    >
      <ToolbarButton
        active={formatState.bold}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
        title="加粗 (Ctrl+B)"
      >
        <BoldIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={formatState.italic}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
        title="斜体 (Ctrl+I)"
      >
        <ItalicIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={formatState.underline}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
        title="下划线 (Ctrl+U)"
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={formatState.strikethrough}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
        title="删除线"
      >
        <StrikethroughIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={formatState.code}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
        title="行内代码"
      >
        <CodeIcon className="h-4 w-4" />
      </ToolbarButton>
      <div className="inkling-toolbar-divider" />
      <ToolbarButton active={formatState.link} onClick={() => setShowLinkPopover(true)} title="链接 (Ctrl+K)">
        <Link2Icon className="h-4 w-4" />
      </ToolbarButton>
      {showLinkPopover ? (
        <div className="absolute top-full left-1/2 mt-2 -translate-x-1/2">
          <LinkPopover editor={editor} onClose={() => setShowLinkPopover(false)} />
        </div>
      ) : null}
    </div>
  )
}
