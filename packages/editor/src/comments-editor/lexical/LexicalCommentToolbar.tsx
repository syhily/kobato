import type { LexicalEditor } from 'lexical'

import { Button } from '@kobato/editor/engine/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kobato/editor/engine/components/dialog'
import { Input } from '@kobato/editor/engine/components/input'
import { Label } from '@kobato/editor/engine/components/label'
import { applyBlockStyle } from '@kobato/editor/engine/lexical/block-commands'
import { TOGGLE_LINK_COMMAND } from '@kobato/editor/engine/lexical/commands'
import { useToolbarSelectionState } from '@kobato/editor/engine/lexical/toolbar-state'
import { cn } from '@kobato/editor/engine/lib/cn'
import { LinkNode } from '@lexical/link'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND } from '@lexical/list'
import { $getNearestNodeOfType } from '@lexical/utils'
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND } from 'lexical'
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from 'lucide-react'
import { useState } from 'react'

// Comment toolbar — the Lexical port of the tiptap `CommentEditorToolbar`
// (same buttons / titles / aria labels, so the R6 switch is a drop-in):
// inline formats via `FORMAT_TEXT_COMMAND`, lists via
// `INSERT_UNORDERED/ORDERED/REMOVE_LIST_COMMAND` with tiptap's toggle
// semantics (an active list button removes the list), blockquote via the
// shared block commands (no-op when already inside a quote), links via
// the prompt dialog + `TOGGLE_LINK_COMMAND` (selection variant, same
// rel/target-null behavior as the tiptap Link config).
//
// Selection-derived active states come from `useToolbarSelectionState`
// (the shared engine hook); the toolbar is hidden until the editor
// wrapper is focused (`group-focus-within/comment-editor` — tiptap
// parity).

export interface LexicalCommentToolbarProps {
  editor: LexicalEditor
  disabled: boolean
}

export function LexicalCommentToolbar({ editor, disabled }: LexicalCommentToolbarProps) {
  const state = useToolbarSelectionState(editor)
  const [linkPromptSeed, setLinkPromptSeed] = useState<string | null>(null)

  const promptLink = () => {
    setLinkPromptSeed(getCurrentLinkUrl(editor))
  }

  const toggleList = (kind: 'bullet' | 'number') => {
    const active = kind === 'bullet' ? state.isBulletList : state.isOrderedList
    if (active) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
    } else if (kind === 'bullet') {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
    } else {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
    }
  }

  return (
    <>
      <div
        className={cn(
          'hidden flex-wrap items-center gap-0.5 border-b border-line/60 px-2 py-1',
          'group-focus-within/comment-editor:flex',
        )}
        aria-label="评论格式工具栏"
      >
        <ToolButton
          title="加粗 (Cmd/Ctrl+B)"
          disabled={disabled}
          state={state.isBold ? 'active' : 'inactive'}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
        >
          <BoldIcon />
        </ToolButton>
        <ToolButton
          title="斜体 (Cmd/Ctrl+I)"
          disabled={disabled}
          state={state.isItalic ? 'active' : 'inactive'}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
        >
          <ItalicIcon />
        </ToolButton>
        <ToolButton
          title="下划线 (Cmd/Ctrl+U)"
          disabled={disabled}
          state={state.isUnderline ? 'active' : 'inactive'}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
        >
          <UnderlineIcon />
        </ToolButton>
        <ToolButton
          title="删除线"
          disabled={disabled}
          state={state.isStrikethrough ? 'active' : 'inactive'}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
        >
          <StrikethroughIcon />
        </ToolButton>
        <ToolButton
          title="行内代码"
          disabled={disabled}
          state={state.isCode ? 'active' : 'inactive'}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
        >
          <CodeIcon />
        </ToolButton>
        <ToolDivider />
        <ToolButton
          title="无序列表"
          disabled={disabled}
          state={state.isBulletList ? 'active' : 'inactive'}
          onClick={() => toggleList('bullet')}
        >
          <ListIcon />
        </ToolButton>
        <ToolButton
          title="有序列表"
          disabled={disabled}
          state={state.isOrderedList ? 'active' : 'inactive'}
          onClick={() => toggleList('number')}
        >
          <ListOrderedIcon />
        </ToolButton>
        <ToolButton
          title="引用"
          disabled={disabled}
          state={state.blockStyle === 'blockquote' ? 'active' : 'inactive'}
          onClick={() => applyBlockStyle(editor, 'blockquote')}
        >
          <QuoteIcon />
        </ToolButton>
        <ToolDivider />
        <ToolButton title="链接" disabled={disabled} state={state.isLink ? 'active' : 'inactive'} onClick={promptLink}>
          <LinkIcon />
        </ToolButton>
      </div>
      <LinkPromptDialog
        seed={linkPromptSeed}
        onClose={() => setLinkPromptSeed(null)}
        onConfirm={(href) => {
          if (href === null) {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: '', openInNewTab: false })
          } else {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: href, openInNewTab: false })
          }
          setLinkPromptSeed(null)
        }}
      />
    </>
  )
}

/** URL of the link under the collapsed caret (empty when none). */
function getCurrentLinkUrl(editor: LexicalEditor): string {
  let url = ''
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return
    }
    const link = $getNearestNodeOfType(selection.anchor.getNode(), LinkNode)
    if (link !== null) {
      url = link.getURL()
    }
  })
  return url
}

interface LinkPromptDialogProps {
  /** Seed value when open; `null` keeps the dialog closed. */
  seed: string | null
  onClose: () => void
  /** Confirm callback. `null` means "remove the link"; a string is the new href. */
  onConfirm: (href: string | null) => void
}

function LinkPromptDialog({ seed, onClose, onConfirm }: LinkPromptDialogProps) {
  const [value, setValue] = useState('')
  const [lastSeed, setLastSeed] = useState(seed)
  if (seed !== lastSeed) {
    setLastSeed(seed)
    if (seed !== null) {
      setValue(seed)
    }
  }

  const open = seed !== null

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑链接</DialogTitle>
          <DialogDescription>填写链接地址，留空可移除当前链接。</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = value.trim()
            onConfirm(trimmed === '' ? null : trimmed)
          }}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="comment-link-href">链接地址</Label>
            <Input
              id="comment-link-href"
              type="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">确定</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface ToolButtonProps {
  title: string
  disabled: boolean
  state?: 'active' | 'inactive'
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ title, disabled, state, onClick, children }: ToolButtonProps) {
  const isActive = state === 'active'
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      aria-pressed={isActive}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-sm',
        '[&_svg]:size-4',
        'text-ink-4 hover:bg-surface hover:text-ink-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        isActive && 'bg-surface text-brand',
      )}
    >
      {children}
    </button>
  )
}

function ToolDivider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-line/60" />
}
