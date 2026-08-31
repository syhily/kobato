/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { Editor } from '@tiptap/core'

import { getMarkRange } from '@tiptap/core'
import { CheckIcon, EraserIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { orpc } from '@/client/api/client'
import { generateBlockKey } from '@/shared/pt/utils'
import { useAdminMathPreview } from '@/ui/admin/editor/tiptap/use-admin-math-preview'
import { Button } from '@/ui/components/button'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'
import { sanitizeHtml } from '@/ui/lib/sanitize-html'

interface MathInlinePanelProps {
  editor: Editor
}

function snapshotMathInlineTex(ed: Editor): string {
  const markType = ed.state.schema.marks.mathInline
  if (markType === undefined) {
    return ''
  }
  const range = getMarkRange(ed.state.selection.$from, markType)
  if (range === undefined) {
    return (ed.getAttributes('mathInline').tex as string) ?? ''
  }
  const docSlice = ed.state.doc.textBetween(range.from, range.to, '\n')
  if (docSlice.length > 0) {
    return docSlice
  }
  const edge = Math.min(range.from + 1, Math.max(1, ed.state.doc.content.size - 1))
  const $pos = ed.state.doc.resolve(edge)
  const found = markType.isInSet($pos.marks()) ? $pos.marks().find((m) => m.type === markType) : undefined
  const fromAttrs = (found?.attrs?.tex as string) ?? ''
  return fromAttrs !== '' ? fromAttrs : ((ed.getAttributes('mathInline').tex as string) ?? '')
}

export function MathInlinePanel({ editor }: MathInlinePanelProps) {
  // Seed from the current mark on mount — comparing against `useState(editor)`
  // never fired (the initial state equals the prop), so the textarea opened
  // empty on an existing formula and 应用 destroyed it.
  const [tex, setTex] = useState(() => snapshotMathInlineTex(editor))
  const [applying, setApplying] = useState(false)
  const baselineTexRef = useRef('')
  const applyAbortRef = useRef<AbortController | null>(null)
  const { previewHtml, renderError, showSpinner } = useAdminMathPreview(tex, false)

  // Re-seed if the editor instance ever changes (render-phase adjust pattern —
  // an effect-bound setTex would be a cascading render).
  const [lastEditor, setLastEditor] = useState(editor)
  if (editor !== lastEditor) {
    setLastEditor(editor)
    setTex(snapshotMathInlineTex(editor))
  }

  // Extend the selection over the whole mark once the panel opens.
  useEffect(() => {
    editor.commands.extendMarkRange('mathInline')
  }, [editor])

  const apply = () => {
    void (async () => {
      applyAbortRef.current?.abort()
      const controller = new AbortController()
      applyAbortRef.current = controller

      editor.chain().focus().extendMarkRange('mathInline').run()
      const prev = editor.getAttributes('mathInline') as { _key?: string }
      const nextKey = prev._key !== undefined && prev._key !== '' ? prev._key : generateBlockKey()
      const pinnedRange = (() => {
        const markType = editor.state.schema.marks.mathInline
        if (markType === undefined) {
          return null
        }
        return getMarkRange(editor.state.selection.$from, markType) ?? null
      })()

      let mathml: string | undefined
      const trimmed = tex.trim()
      if (trimmed !== '') {
        setApplying(true)
        // React Compiler can't lower try/finally — capture and rethrow after
        // the pending reset so propagation semantics stay identical. An abort
        // during the await skips the mathml assignment and falls through to
        // the aborted check below.
        let caught: unknown = null
        let didThrow = false
        try {
          const out = await orpc.admin.renders.math({ tex, display: false })
          if (!controller.signal.aborted && out.error === null && out.mathml !== '') {
            mathml = out.mathml
          }
        } catch (err) {
          caught = err
          didThrow = true
        }
        if (!controller.signal.aborted) {
          setApplying(false)
        }
        if (didThrow) {
          throw caught
        }
      }

      if (controller.signal.aborted) {
        return
      }

      const attrs: Record<string, string> = { _key: nextKey, tex }
      if (mathml !== undefined) {
        attrs.mathml = mathml
      }

      const chain = editor.chain().focus()
      if (pinnedRange !== null) {
        chain.setTextSelection(pinnedRange).deleteSelection()
      } else {
        chain.extendMarkRange('mathInline').deleteSelection()
      }
      chain
        .insertContent({
          type: 'text',
          text: tex,
          marks: [{ type: 'mathInline', attrs }],
        })
        .run()
      baselineTexRef.current = tex
    })()
  }
  const remove = () => {
    editor.chain().focus().extendMarkRange('mathInline').unsetMark('mathInline').run()
  }

  const cancel = () => {
    editor.chain().focus().extendMarkRange('mathInline').run()
    let restored = snapshotMathInlineTex(editor)
    if (restored.trim() === '') {
      restored = baselineTexRef.current
    }
    setTex(restored)
    baselineTexRef.current = restored
    const caretAfterMath = editor.state.selection.to
    editor.chain().focus().setTextSelection(caretAfterMath).run()
  }

  return (
    <div className="flex w-96 flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">行内 TeX</Label>
        {renderError !== null ? <span className="text-xs text-destructive">语法错误：{renderError}</span> : null}
      </div>
      <p className="text-xs leading-snug text-muted-foreground">
        叙述里的短式子用行内；需要行内大分式时在式子前加{' '}
        <code className="rounded bg-muted px-0.5 font-mono">\displaystyle</code>
        。多行对齐请用 <span className="font-medium">/</span> 插入公式块。
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
        <Button variant="ghost" size="sm" type="button" disabled={applying} onClick={cancel}>
          <XIcon /> 取消
        </Button>
        <Button variant="ghost" size="sm" type="button" disabled={applying} onClick={remove}>
          <EraserIcon /> 移除公式
        </Button>
        <Button size="sm" type="button" disabled={applying} onClick={apply}>
          <CheckIcon /> {applying ? '应用中…' : '应用'}
        </Button>
      </div>
    </div>
  )
}
