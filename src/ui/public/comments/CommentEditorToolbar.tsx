import { type Editor, useEditorState } from '@tiptap/react'
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
import { useEffect, useState } from 'react'

import { Button } from '@/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

export interface CommentEditorToolbarProps {
  editor: Editor
  disabled: boolean
}

// Inline formatting toolbar. Hidden by default; revealed only while
// the wrapping `<div>` carries `:focus-within` (i.e. while the
// contenteditable, the slash menu, or any toolbar button itself
// has focus). The button-bar lives inside the same wrapper, so
// clicking a button preserves `focus-within` — no flicker between
// "editor focused" and "button focused" states.
//
// Markdown-shortcut hints (`**bold**`, `*italic*`, …) turned out to
// be unreliable: Tiptap's StarterKit only wires a subset of GFM
// shortcuts and the comment dialect deliberately disables a few of
// them. Surfacing the actual buttons removes the guesswork.
export function CommentEditorToolbar({ editor, disabled }: CommentEditorToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      strike: ed.isActive('strike'),
      code: ed.isActive('code'),
      bulletList: ed.isActive('bulletList'),
      orderedList: ed.isActive('orderedList'),
      blockquote: ed.isActive('blockquote'),
      link: ed.isActive('link'),
    }),
  })

  // Replaces the legacy `window.prompt` flow. The toolbar seeds the
  // dialog with the link href under the current selection; the dialog
  // owns the apply / remove / cancel branches and calls into the
  // editor on confirm so the toolbar handler stays synchronous.
  const [linkPromptSeed, setLinkPromptSeed] = useState<string | null>(null)

  const promptLink = () => {
    const current = (editor.getAttributes('link').href as string | undefined) ?? ''
    setLinkPromptSeed(current)
  }

  return (
    <>
      <div
        className={cn(
          // Hidden by default; revealed when the wrapping div carries
          // `:focus-within` (the editor, slash menu, or any toolbar
          // button is focused).
          'hidden flex-wrap items-center gap-0.5 border-b border-line/60 px-2 py-1',
          'group-focus-within/comment-editor:flex',
        )}
        aria-label="评论格式工具栏"
      >
        <ToolButton
          title="加粗 (Cmd/Ctrl+B)"
          disabled={disabled}
          active={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon />
        </ToolButton>
        <ToolButton
          title="斜体 (Cmd/Ctrl+I)"
          disabled={disabled}
          active={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon />
        </ToolButton>
        <ToolButton
          title="下划线 (Cmd/Ctrl+U)"
          disabled={disabled}
          active={state.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </ToolButton>
        <ToolButton
          title="删除线"
          disabled={disabled}
          active={state.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <StrikethroughIcon />
        </ToolButton>
        <ToolButton
          title="行内代码"
          disabled={disabled}
          active={state.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <CodeIcon />
        </ToolButton>
        <ToolDivider />
        <ToolButton
          title="无序列表"
          disabled={disabled}
          active={state.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListIcon />
        </ToolButton>
        <ToolButton
          title="有序列表"
          disabled={disabled}
          active={state.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon />
        </ToolButton>
        <ToolButton
          title="引用"
          disabled={disabled}
          active={state.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <QuoteIcon />
        </ToolButton>
        <ToolDivider />
        <ToolButton title="链接" disabled={disabled} active={state.link} onClick={promptLink}>
          <LinkIcon />
        </ToolButton>
      </div>
      <LinkPromptDialog
        seed={linkPromptSeed}
        onClose={() => setLinkPromptSeed(null)}
        onConfirm={(href) => {
          if (href === null) {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
          } else {
            editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
          }
          setLinkPromptSeed(null)
        }}
      />
    </>
  )
}

interface LinkPromptDialogProps {
  /** Seed value when open; `null` keeps the dialog closed. */
  seed: string | null
  onClose: () => void
  /** Confirm callback. `null` means "remove the link"; a string is the new href. */
  onConfirm: (href: string | null) => void
}

// Small inline dialog that replaces the native `window.prompt` flow
// for the link bubble. Mounted next to the toolbar; the toolbar
// owns the seed value (read from the active selection) and the
// editor instance is closed over by `onConfirm`, so the dialog
// itself stays UI-only.
function LinkPromptDialog({ seed, onClose, onConfirm }: LinkPromptDialogProps) {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (seed !== null) {
      setValue(seed)
    }
  }, [seed])

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
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ title, disabled, active, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      aria-pressed={active}
      // Prevent the button from stealing focus on mousedown so the
      // contenteditable selection stays intact while the formatting
      // command runs. Without this the caret would briefly jump out
      // of the editor and the toggled mark would land on whatever
      // came next instead of the active selection.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-sm',
        '[&_svg]:size-4',
        'text-ink-4 hover:bg-surface hover:text-ink-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        active && 'bg-surface text-brand',
      )}
    >
      {children}
    </button>
  )
}

function ToolDivider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-line/60" />
}
