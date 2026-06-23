import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { CodeIcon } from 'lucide-react'

import { insertCommentCodeBlock, insertCommentMathBlock } from '@/ui/inkling/editor/comment/block-insert'
import { cn } from '@/ui/lib/cn'

/**
 * Floating block-insert buttons for the comment editor.
 *
 * The comment textarea has no top toolbar by design — it behaves like a plain
 * textarea. Inline formats live in the bubble menu (selection-driven); list /
 * quote are reachable via markdown shortcuts. The only block types that have
 * no keyboard shortcut are code-block and math-block, so they surface here as
 * two small buttons that fade in on focus.
 *
 * Must be rendered inside a `<LexicalComposer>` (it reads the editor from
 * context) and inside a `group/comment-editor` ancestor (for focus reveal).
 * The host must be `position: relative` for the absolute positioning to land
 * in the bottom-right corner of the editor frame.
 */
export function CommentInsertActions() {
  const [editor] = useLexicalComposerContext()

  return (
    <div
      className={cn(
        'pointer-events-none absolute right-2 bottom-2 z-10',
        'flex items-center gap-0.5 opacity-0 transition-opacity',
        'group-focus-within/comment-editor:pointer-events-auto group-focus-within/comment-editor:opacity-100',
      )}
    >
      <InsertButton title="代码块" onClick={() => insertCommentCodeBlock(editor)}>
        <CodeIcon />
      </InsertButton>
      <InsertButton title="公式块" onClick={() => insertCommentMathBlock(editor)}>
        <span className="font-serif text-sm leading-none">Σ</span>
      </InsertButton>
    </div>
  )
}

interface InsertButtonProps {
  title: string
  onClick: () => void
  children: React.ReactNode
}

function InsertButton({ title, onClick, children }: InsertButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      // Prevent the editor from losing selection when the button is pressed —
      // without this the insert falls back to a no-op because the selection
      // collapses before `editor.update` runs.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-sm',
        '[&_svg]:size-3.5',
        'text-ink-4 hover:bg-surface hover:text-ink-1',
      )}
    >
      {children}
    </button>
  )
}
