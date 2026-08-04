import type { InlineMathNode } from '@kobato/shared/lexical/nodes/inline-math-node'
import type { LexicalEditor } from 'lexical'

import { orpc } from '@kobato/client/api/client'
import { Button } from '@kobato/editor/engine/components/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@kobato/editor/engine/components/dialog'
import { Label } from '@kobato/editor/engine/components/label'
import { Textarea } from '@kobato/editor/engine/components/textarea'
import { MathMarkup } from '@kobato/editor/engine/lexical/node-views/math-markup'
import { useAdminMathPreview } from '@kobato/editor/engine/lexical/use-admin-math-preview'
import { sanitizeHtml } from '@kobato/editor/lib/sanitize-html'
import { CheckIcon, EraserIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

/**
 * Editor view for `InlineMathNode` — the Lexical port of the tiptap
 * `MathInlinePanel` interaction: a click on the rendered math opens an
 * edit dialog with debounced KaTeX preview; save renders the TeX via the
 * admin render procedure and writes `tex` + `mathml` back into the node.
 * The visual is the manifest contract (`span.math-inline`), so the
 * in-editor preview matches the public render.
 */

interface InlineMathViewProps {
  node: InlineMathNode
  editor: LexicalEditor
}

export function InlineMathView({ node, editor }: InlineMathViewProps) {
  const [open, setOpen] = useState(false)
  const editable = editor.isEditable()

  return (
    <>
      <span
        data-math-inline
        className={editable ? 'cursor-pointer' : undefined}
        title={editable ? '点击编辑公式' : undefined}
        role={editable ? 'button' : undefined}
        aria-label={editable ? '编辑行内公式' : undefined}
        onClick={() => {
          if (editable) {
            setOpen(true)
          }
        }}
      >
        <MathMarkup tex={node.getTex()} mathml={node.getMathml()} svg={node.getSvg()} display={false} />
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>行内公式</DialogTitle>
          <DialogDescription className="sr-only">编辑行内 TeX 公式</DialogDescription>
          <InlineMathSourceEditor node={node} editor={editor} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function InlineMathSourceEditor({
  node,
  editor,
  onDone,
}: {
  node: InlineMathNode
  editor: LexicalEditor
  onDone: () => void
}) {
  const [tex, setTex] = useState(node.getTex())
  const [saving, setSaving] = useState(false)
  const { previewHtml, renderError, showSpinner } = useAdminMathPreview(tex, false)

  const apply = async () => {
    setSaving(true)
    try {
      let mathml: string | undefined
      const trimmed = tex.trim()
      if (trimmed !== '') {
        const out = await orpc.admin.renders.math({ tex, display: false })
        if (out.error === null && out.mathml !== '') {
          mathml = out.mathml
        }
      }
      editor.update(() => {
        node.setTex(tex)
        node.setMathml(mathml)
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  const remove = () => {
    editor.update(() => {
      node.remove()
    })
    onDone()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">行内 TeX</Label>
        {renderError !== null ? (
          <span className="shrink-0 text-xs text-destructive">语法错误：{renderError}</span>
        ) : null}
      </div>
      <p className="text-xs leading-snug text-muted-foreground">
        叙述里的短式子用行内；需要行内大分式时在式子前加{' '}
        <code className="rounded bg-muted px-0.5 font-mono">\displaystyle</code>。
      </p>
      <Textarea
        value={tex}
        onChange={(event) => setTex(event.target.value)}
        rows={2}
        className="font-mono text-xs"
        placeholder={'\\displaystyle \\frac{a}{b}'}
      />
      <div className="rounded-sm border bg-muted/30 px-2 py-1 text-sm">
        <span className="text-xs text-muted-foreground">预览：</span>
        {showSpinner ? (
          <span className="ml-2 text-xs text-muted-foreground">渲染中…</span>
        ) : (
          <span
            className="ml-2 inline-flex min-h-[1.25em] max-w-full items-center overflow-x-auto align-middle"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml, 'preview') }}
          />
        )}
      </div>
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" type="button" disabled={saving} onClick={onDone}>
          <XIcon /> 取消
        </Button>
        <Button variant="ghost" size="sm" type="button" disabled={saving} onClick={remove}>
          <EraserIcon /> 移除公式
        </Button>
        <Button size="sm" type="button" disabled={saving} onClick={() => void apply()}>
          <CheckIcon /> {saving ? '应用中…' : '应用'}
        </Button>
      </div>
    </div>
  )
}
