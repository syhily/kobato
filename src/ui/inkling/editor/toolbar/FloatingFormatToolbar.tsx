import type { LexicalEditor, TextFormatType } from 'lexical'

import { $isLinkNode } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, SELECTION_CHANGE_COMMAND } from 'lexical'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getSelectionRect } from '@/ui/inkling/editor/shared/dom-selection'
import { LinkPopover } from '@/ui/inkling/editor/toolbar/LinkPopover'
import { cn } from '@/ui/lib/cn'

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
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-sm transition',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function hasFormat(editor: LexicalEditor, format: TextFormatType): boolean {
  let active = false
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      active = selection.hasFormat(format)
    }
  })
  return active
}

function hasLink(editor: LexicalEditor): boolean {
  let active = false
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      active = selection.getNodes().some((n) => $isLinkNode(n.getParent()))
    }
  })
  return active
}

function shouldShowToolbar(editor: LexicalEditor): boolean {
  if (editor.isComposing()) {
    return false
  }
  let show = false
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || selection.isCollapsed()) {
      return
    }
    if (selection.getTextContent().trim().length === 0) {
      return
    }
    show = true
  })
  return show
}

export function FloatingFormatToolbar() {
  const [editor] = useLexicalComposerContext()
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [showLinkPopover, setShowLinkPopover] = useState(false)
  const [, forceUpdate] = useState(0)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const refresh = useCallback(() => forceUpdate((n) => n + 1), [])

  const selectRect = useCallback(() => {
    const rootEl = editor?.getRootElement() ?? null
    if (rootEl === null) {
      return null
    }
    const rect = getSelectionRect(rootEl)
    if (rect === null) {
      return null
    }
    return { top: rect.top - 40, left: rect.left + rect.width / 2 }
  }, [editor])

  useEffect(() => {
    if (editor === null) {
      return undefined
    }
    const unregister = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        if (shouldShowToolbar(editor)) {
          const pos = selectRect()
          if (pos !== null) {
            setPosition(pos)
            setVisible(true)
          }
        } else {
          setVisible(false)
        }
        refresh()
        return false
      },
      1,
    )

    const handleViewportChange = () => {
      if (visible) {
        const pos = selectRect()
        if (pos !== null) {
          setPosition(pos)
        }
      }
    }
    window.addEventListener('scroll', handleViewportChange, { passive: true })
    window.addEventListener('resize', handleViewportChange)
    return () => {
      unregister()
      window.removeEventListener('scroll', handleViewportChange)
      window.removeEventListener('resize', handleViewportChange)
    }
  }, [editor, refresh, selectRect, visible])

  if (!visible || position === null) {
    return null
  }
  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="文本格式化"
      className="inkling-floating-toolbar absolute z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      <ToolbarButton
        active={hasFormat(editor, 'bold')}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
        title="加粗 (Ctrl+B)"
      >
        <b>B</b>
      </ToolbarButton>
      <ToolbarButton
        active={hasFormat(editor, 'italic')}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
        title="斜体 (Ctrl+I)"
      >
        <i>I</i>
      </ToolbarButton>
      <ToolbarButton
        active={hasFormat(editor, 'underline')}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
        title="下划线 (Ctrl+U)"
      >
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton
        active={hasFormat(editor, 'strikethrough')}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
        title="删除线"
      >
        <s>S</s>
      </ToolbarButton>
      <ToolbarButton
        active={hasFormat(editor, 'code')}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
        title="行内代码"
      >
        <span className="font-mono text-xs">{'<>'}</span>
      </ToolbarButton>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <ToolbarButton active={hasLink(editor)} onClick={() => setShowLinkPopover(true)} title="链接 (Ctrl+K)">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      </ToolbarButton>
      {showLinkPopover ? (
        <div className="absolute top-full left-1/2 mt-2 -translate-x-1/2">
          <LinkPopover editor={editor} onClose={() => setShowLinkPopover(false)} />
        </div>
      ) : null}
    </div>
  )
}
