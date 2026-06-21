import type { ReactNode } from 'react'

import { useCallback, useEffect, useState } from 'react'

import type { InklingMathBlockNode } from '@/shared/inkling/schema'
import type { MathCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { CardShell } from '@/ui/inkling/editor/cards/card-shell'
import { useCardNode } from '@/ui/inkling/editor/cards/use-card-node'
import { sanitizeHtml } from '@/ui/lib/sanitize-html'

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
          const result = await orpc.admin.renders.math({ tex, display: true })
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
  // Use the same `math math-display` class as the published renderer so
  // prose-blog's .math-display rules (overflow, centering) apply.
  return (
    <div
      className="math math-display text-center [&_svg]:mx-auto [&_svg]:block [&_svg]:max-w-none"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html, 'math') }}
    />
  )
}

export function MathCardComponent({ node }: { node: MathCardNode }): ReactNode {
  const { editor, isSelected } = useCardNode(node)

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
    <CardShell nodeKey={node.getKey()} className="p-3">
      {isSelected ? (
        <textarea
          value={node.getTex()}
          onChange={(e) => update({ tex: e.target.value })}
          rows={4}
          placeholder="e^{i\\pi} + 1 = 0"
          className="inkling-card-textarea mb-2"
        />
      ) : null}
      <MathPreview tex={node.getTex()} />
    </CardShell>
  )
}
