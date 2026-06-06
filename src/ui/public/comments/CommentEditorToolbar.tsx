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

  const [linkPromptSeed, setLinkPromptSeed] = useState<string | null>(null)

  const promptLink = () => {
    const current = (editor.getAttributes('link').href as string | undefined) ?? ''
    setLinkPromptSeed(current)
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
          state={state.bold ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon />
        </ToolButton>
        <ToolButton
          title="斜体 (Cmd/Ctrl+I)"
          disabled={disabled}
          state={state.italic ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon />
        </ToolButton>
        <ToolButton
          title="下划线 (Cmd/Ctrl+U)"
          disabled={disabled}
          state={state.underline ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </ToolButton>
        <ToolButton
          title="删除线"
          disabled={disabled}
          state={state.strike ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <StrikethroughIcon />
        </ToolButton>
        <ToolButton
          title="行内代码"
          disabled={disabled}
          state={state.code ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <CodeIcon />
        </ToolButton>
        <ToolDivider />
        <ToolButton
          title="无序列表"
          disabled={disabled}
          state={state.bulletList ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListIcon />
        </ToolButton>
        <ToolButton
          title="有序列表"
          disabled={disabled}
          state={state.orderedList ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon />
        </ToolButton>
        <ToolButton
          title="引用"
          disabled={disabled}
          state={state.blockquote ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <QuoteIcon />
        </ToolButton>
        <ToolDivider />
        <ToolButton title="链接" disabled={disabled} state={state.link ? 'active' : 'inactive'} onClick={promptLink}>
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
