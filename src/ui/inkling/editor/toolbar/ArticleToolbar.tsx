import type { ReactNode } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { Code2Icon, ImageIcon, MinusIcon, Music2Icon, PiIcon, TableIcon } from 'lucide-react'

import { insertBlockCard } from '@/ui/inkling/editor/cards/card-registry'
import {
  $createCodeCardNode,
  $createHorizontalRuleCardNode,
  $createImageCardNode,
  $createMathCardNode,
  $createMusicCardNode,
  $createTableCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'
import { cn } from '@/ui/lib/cn'

export interface ArticleToolbarProps {
  disabled?: boolean
  className?: string
}

export function ArticleToolbar({ disabled, className }: ArticleToolbarProps): ReactNode {
  const [editor] = useLexicalComposerContext()

  const insertImage = () => {
    insertBlockCard(editor, () => $createImageCardNode({ src: '', alt: '', caption: '', layout: 'center' }))
  }

  const insertCode = () => {
    insertBlockCard(editor, () => $createCodeCardNode({ code: '' }))
  }

  const insertMath = () => {
    insertBlockCard(editor, () => $createMathCardNode({ tex: '' }))
  }

  const insertMusic = () => {
    // Empty `playerId` would fail `inklingMusicCardNodeSchema.playerId.min(1)`,
    // so seed with a placeholder the picker will overwrite.
    insertBlockCard(editor, () => $createMusicCardNode({ playerId: '__pending__' }))
  }

  const insertHorizontalRule = () => {
    insertBlockCard(editor, () => $createHorizontalRuleCardNode())
  }

  const insertTable = () => {
    insertBlockCard(editor, () =>
      $createTableCardNode({
        rows: [
          {
            type: 'tablerow',
            version: 1,
            cells: [
              { type: 'tablecell', version: 1, children: [] },
              { type: 'tablecell', version: 1, children: [] },
            ],
          },
          {
            type: 'tablerow',
            version: 1,
            cells: [
              { type: 'tablecell', version: 1, children: [] },
              { type: 'tablecell', version: 1, children: [] },
            ],
          },
        ],
      }),
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1 border-b p-2', className)}>
      <ToolbarButton title="插入图片" disabled={disabled} onClick={insertImage}>
        <ImageIcon />
      </ToolbarButton>
      <ToolbarButton title="插入代码块" disabled={disabled} onClick={insertCode}>
        <Code2Icon />
      </ToolbarButton>
      <ToolbarButton title="插入公式块" disabled={disabled} onClick={insertMath}>
        <PiIcon />
      </ToolbarButton>
      <ToolbarButton title="插入音乐" disabled={disabled} onClick={insertMusic}>
        <Music2Icon />
      </ToolbarButton>
      <ToolbarButton title="插入表格" disabled={disabled} onClick={insertTable}>
        <TableIcon />
      </ToolbarButton>
      <ToolbarButton title="插入分隔线" disabled={disabled} onClick={insertHorizontalRule}>
        <MinusIcon />
      </ToolbarButton>
    </div>
  )
}

interface ToolbarButtonProps {
  title: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function ToolbarButton({ title, disabled, onClick, children }: ToolbarButtonProps): ReactNode {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-md p-1.5 text-sm transition',
        disabled ? 'cursor-not-allowed text-muted-foreground' : 'text-foreground hover:bg-muted active:bg-muted/80',
      )}
    >
      {children}
    </button>
  )
}
