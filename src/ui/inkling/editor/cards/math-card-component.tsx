import type { ReactNode } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCallback, useContext, useEffect, useState } from 'react'

import type { InklingMathBlockNode } from '@/shared/inkling/schema'
import type { MathCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import { ActionToolbar } from '@/ui/inkling-editor/components/ui/ActionToolbar'
import { ToolbarMenu, ToolbarMenuItem } from '@/ui/inkling-editor/components/ui/ToolbarMenu'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import { DELETE_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'

function MathPreview({ tex }: { tex: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (tex.trim().length === 0) {
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true)
        try {
          const { orpc } = await import('@/client/api/client')
          const result = await orpc.renders.math({ tex, display: true })
          if (!cancelled) {
            setHtml(result.mathml ?? null)
          }
        } catch {
          if (!cancelled) {
            setHtml(null)
          }
        } finally {
          if (!cancelled) {
            setLoading(false)
          }
        }
      })()
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [tex])

  if (loading) {
    return <div className="py-4 text-center text-xs text-muted-foreground">渲染中…</div>
  }
  if (tex.trim().length === 0 || html === null) {
    return <div className="py-4 text-center font-mono text-sm">$${tex || '\\text{输入 TeX 公式}'}$$</div>
  }
  return (
    <div
      className="math math-display text-center [&_svg]:mx-auto [&_svg]:block [&_svg]:max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function MathCardComponent({ node }: { node: MathCardNode }): ReactNode {
  const [editor] = useLexicalComposerContext()
  const { isSelected, isEditing, setEditing } = useContext(CardContext)

  const update = useCallback(
    (patch: Partial<InklingMathBlockNode>): void => {
      editor.update(() => {
        if (patch.tex !== undefined) {
          node.setTex(patch.tex)
        }
      })
    },
    [editor, node],
  )

  return (
    <InklingCardWrapper nodeKey={node.getKey()}>
      <ActionToolbar isVisible={isSelected && !isEditing}>
        <ToolbarMenu>
          <ToolbarMenuItem icon="edit" isActive={false} label="编辑" onClick={() => setEditing(true)} />
          <ToolbarMenuItem
            icon="remove"
            isActive={false}
            label="删除"
            onClick={() => editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: node.getKey() })}
          />
        </ToolbarMenu>
      </ActionToolbar>

      {isEditing ? (
        <textarea
          value={node.getTex()}
          onChange={(e) => update({ tex: e.target.value })}
          rows={4}
          placeholder="e^{i\\pi} + 1 = 0"
          className="inkling-card-textarea mb-2 w-full rounded border border-grey-300 p-3 font-mono text-sm dark:border-grey-900"
        />
      ) : null}
      <div className="px-4 py-3">
        <MathPreview tex={node.getTex()} />
      </div>
    </InklingCardWrapper>
  )
}
