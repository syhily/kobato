import type { Editor } from '@tiptap/core'

import { useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  BoldIcon,
  Code2Icon,
  ExternalLinkIcon,
  ItalicIcon,
  LinkIcon,
  SigmaIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from 'lucide-react'
import { useState } from 'react'

const BUBBLE_MENU_OPTIONS = { placement: 'top' as const, offset: 8 }

import { orpc } from '@/client/api/client'
import { generateBlockKey } from '@/shared/pt/utils'
import { MathInlinePanel } from '@/ui/admin/editor/tiptap/InlineMarkPanels'
import { LinkPopover } from '@/ui/admin/editor/tiptap/LinkPopover'
import { Button } from '@/ui/components/button'
import { Separator } from '@/ui/components/separator'
import { cn } from '@/ui/lib/cn'

export interface PageBubbleMenuProps {
  editor: Editor
}

// Tiptap `isActive('mathInline')` uses `storedMarks || $from.marks()` on a
// collapsed selection, which (a) hides math when a stored mark like bold is
// pending and (b) can treat the cursor *after* an inclusive-false mark run as
// still “in math” via `nodeBefore`-style resolution. For the BubbleMenu we
// only swap in `MathInlinePanel` when the caret is actually inside the TeX
// span or on its *leading* edge (nodeAfter carries the mark), not when the
// operator has moved past the trailing edge to keep typing prose.
function mathInlinePanelApplies(editor: Editor): boolean {
  const { state } = editor
  const markType = state.schema.marks.mathInline
  if (markType === undefined) {
    return false
  }
  if (!state.selection.empty) {
    return editor.isActive('mathInline')
  }
  const $from = state.selection.$from
  if (markType.isInSet($from.marks())) {
    return true
  }
  const after = $from.nodeAfter
  return after !== null && after.isText === true && !!markType.isInSet(after.marks)
}

function targetAllowsNativeFocusInsideBubble(event: { target: EventTarget | null }): boolean {
  const t = event.target
  if (!(t instanceof Element)) {
    return false
  }
  return t.closest('input, textarea, select, label, [contenteditable="true"], [role="checkbox"]') !== null
}

export function PageBubbleMenu({ editor }: PageBubbleMenuProps) {
  const [linkOpen, setLinkOpen] = useState(false)

  const showMathPanel = useEditorState({
    editor,
    selector: ({ editor: ed }) => mathInlinePanelApplies(ed),
  })
  const sigmaToggleActive = useEditorState({
    editor,
    selector: ({ editor: ed }) => ed.isActive('mathInline'),
  })

  return (
    <BubbleMenu
      editor={editor}
      options={BUBBLE_MENU_OPTIONS}
      shouldShow={({ editor: instance, state }) => {
        if (!instance.isEditable) {
          return false
        }
        if (instance.isActive('table')) {
          return false
        }
        if (instance.isActive('codeBlock')) {
          return false
        }
        if (
          'node' in state.selection &&
          typeof state.selection.node === 'object' &&
          state.selection.node !== null &&
          'isAtom' in state.selection.node &&
          state.selection.node.isAtom === true
        ) {
          return false
        }
        if (!state.selection.empty) {
          return true
        }
        return mathInlinePanelApplies(instance)
      }}
      className="z-50 rounded-xl border bg-popover text-popover-foreground shadow-md"
    >
      <div
        className="contents"
        onMouseDownCapture={(event) => {
          if (targetAllowsNativeFocusInsideBubble(event)) {
            return
          }
          event.preventDefault()
        }}
      >
        {linkOpen ? (
          <LinkPopover variant="selection" editor={editor} onClose={() => setLinkOpen(false)} />
        ) : showMathPanel ? (
          <MathInlinePanel editor={editor} />
        ) : (
          <ActionRow editor={editor} sigmaToggleActive={sigmaToggleActive} onLink={() => setLinkOpen(true)} />
        )}
      </div>
    </BubbleMenu>
  )
}

interface ActionRowProps {
  editor: Editor
  sigmaToggleActive: boolean
  onLink: () => void
}

function ActionRow({ editor, sigmaToggleActive, onLink }: ActionRowProps) {
  return (
    <div className="flex items-center gap-0.5 px-1 py-1">
      <Toggle
        title="加粗"
        state={editor.isActive('bold') ? 'active' : 'inactive'}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon />
      </Toggle>
      <Toggle
        title="斜体"
        state={editor.isActive('italic') ? 'active' : 'inactive'}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </Toggle>
      <Toggle
        title="下划线"
        state={editor.isActive('underline') ? 'active' : 'inactive'}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon />
      </Toggle>
      <Toggle
        title="删除线"
        state={editor.isActive('strike') ? 'active' : 'inactive'}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <StrikethroughIcon />
      </Toggle>
      <Toggle
        title="行内代码"
        state={editor.isActive('code') ? 'active' : 'inactive'}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code2Icon />
      </Toggle>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Toggle
        title="链接"
        state={editor.isActive('link') ? 'active' : 'inactive'}
        onClick={() => {
          if (editor.isActive('link')) {
            editor.chain().focus().extendMarkRange('link').run()
          }
          onLink()
        }}
      >
        <LinkIcon />
      </Toggle>
      <Toggle
        title="行内公式（大分式请加 \\displaystyle；多行用 / 公式块）"
        state={sigmaToggleActive ? 'active' : 'inactive'}
        onClick={() => {
          void insertMathInline(editor)
        }}
      >
        <SigmaIcon />
      </Toggle>
      {editor.isActive('link') ? <OpenLinkPreview editor={editor} /> : null}
    </div>
  )
}

function OpenLinkPreview({ editor }: { editor: Editor }) {
  const attrs: Record<string, unknown> = editor.getAttributes('link')
  const href = typeof attrs.href === 'string' ? attrs.href : '#'
  const newTab = attrs.target === '_blank'
  return (
    <a
      href={href}
      {...(newTab ? { target: '_blank' as const, rel: 'noreferrer noopener' as const } : {})}
      title={newTab ? '在新标签页打开' : '打开链接'}
      className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent"
    >
      <ExternalLinkIcon className="size-3.5" />
    </a>
  )
}

interface ToggleProps {
  title: string
  state?: 'active' | 'inactive'
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}

function Toggle({ title, state, onClick, disabled, children }: ToggleProps) {
  const isActive = state === 'active'
  return (
    <Button
      type="button"
      variant={isActive ? 'secondary' : 'ghost'}
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      className={cn('size-7')}
    >
      {children}
    </Button>
  )
}

async function insertMathInline(editor: Editor) {
  if (mathInlinePanelApplies(editor)) {
    return
  }
  const { from, to } = editor.state.selection
  const hasRange = from < to
  const selected = hasRange ? editor.state.doc.textBetween(from, to, '\n') : ''
  const tex = selected.trim() === '' ? 'a^2' : selected.trim()
  const markKey = generateBlockKey()

  let mathml: string | undefined
  if (tex.trim() !== '') {
    const out = await orpc.admin.renders.math({ tex, display: false })
    if (out.error === null && out.mathml !== '') {
      mathml = out.mathml
    }
  }

  const attrs: Record<string, string> = { tex, _key: markKey }
  if (mathml !== undefined) {
    attrs.mathml = mathml
  }

  const chain = editor.chain().focus()
  if (hasRange) {
    chain.deleteRange({ from, to })
  }
  chain
    .insertContent({
      type: 'text',
      text: tex,
      marks: [{ type: 'mathInline', attrs }],
    })
    .run()

  const end = editor.state.selection.from
  const start = end - tex.length
  if (start >= 0 && tex.length > 0) {
    editor.chain().focus().setTextSelection({ from: start, to: end }).run()
  }
}
