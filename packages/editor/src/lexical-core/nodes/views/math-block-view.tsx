import type { MathBlockNode } from '@kobato/editor/lexical-core/nodes/math-block-node'
import type { Block, MathBlock } from '@kobato/shared/legacy-pt/schema'
import type { LexicalEditor } from 'lexical'

import { Button } from '@kobato/editor/engine/components/button'
import { MathBlockSourceEditor, MathBlockSummary } from '@kobato/editor/engine/lexical/block-cards/MathBlock'
import { cn } from '@kobato/editor/engine/lib/cn'
import { SigmaIcon, SquarePenIcon, TrashIcon } from 'lucide-react'
import { useState } from 'react'

/**
 * Editor view for `MathBlockNode` — reuses the tiptap block-card pieces
 * (`MathBlockSummary` preview + `MathBlockSourceEditor` TeX editor with
 * KaTeX MathML render) against a PT-shaped payload derived from the node
 * fields. Save writes `tex` / `mathml` back into the node.
 */

interface MathBlockViewProps {
  node: MathBlockNode
  editor: LexicalEditor
}

export function MathBlockView({ node, editor }: MathBlockViewProps) {
  const editable = editor.isEditable()
  const [editing, setEditing] = useState(false)

  const payload: MathBlock = {
    _type: 'mathBlock',
    _key: node.getPtKey() ?? node.getKey(),
    tex: node.getTex(),
    mathml: node.getMathml(),
    svg: node.getSvg(),
  }

  const commitPayload = (next: Block, editorRender?: string) => {
    if (next._type !== 'mathBlock') {
      return
    }
    editor.update(() => {
      node.setTex(next.tex)
      node.setMathml(editorRender !== undefined && editorRender !== '' ? editorRender : next.mathml)
    })
    setEditing(false)
  }

  return (
    <div
      data-pt-block-card="mathBlock"
      className={cn('group relative my-3 rounded-xl border-2 border-dashed bg-muted/30 p-4 text-sm')}
      contentEditable={false}
    >
      <div className="flex items-start gap-3">
        <SigmaIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="grow">
          <div className="flex items-center gap-2">
            <span className="font-medium">数学公式块</span>
            {editable && !editing ? (
              <Button
                variant="ghost"
                size="icon"
                title="编辑源"
                aria-label="编辑源"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => setEditing(true)}
              >
                <SquarePenIcon />
              </Button>
            ) : null}
          </div>
          {editing ? (
            <MathBlockSourceEditor payload={payload} onCommit={commitPayload} onCancel={() => setEditing(false)} />
          ) : (
            <MathBlockSummary payload={payload} />
          )}
        </div>
        {editable ? (
          <Button
            variant="ghost"
            size="icon"
            title="删除"
            aria-label="删除该块"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => {
              editor.update(() => {
                node.remove()
              })
            }}
          >
            <TrashIcon />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
