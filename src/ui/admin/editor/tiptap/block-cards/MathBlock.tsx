import { CheckIcon, SigmaIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import type { Block, MathBlock } from '@/shared/pt/schema'

import { orpc } from '@/client/api/client'
import { useAdminMathPreview } from '@/ui/admin/editor/tiptap/use-admin-math-preview'
import { Button } from '@/ui/components/button'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'
import { sanitizeHtml } from '@/ui/lib/sanitize-html'

export function mathBlockIcon(props: { className?: string }) {
  return <SigmaIcon {...props} />
}

export function mathBlockTitle() {
  return '数学公式块'
}

export function stripMathArtifacts(block: Block): Block {
  if (block._type !== 'mathBlock') {
    return block
  }
  const { mathml: _mathml, svg: _svg, ...rest } = block as { mathml?: string; svg?: string } & Block
  return rest as Block
}

export function MathBlockSummary({ payload }: { payload: MathBlock }) {
  if (payload.mathml !== undefined && payload.mathml !== '') {
    // SAFETY: `mathml` is produced server-side by KaTeX and sanitized below.
    return (
      <div
        className="math math-display mt-2 max-w-full overflow-x-auto text-center"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(payload.mathml, 'math') }}
      />
    )
  }
  if (payload.svg !== undefined && payload.svg !== '') {
    return (
      <div
        className="math math-display mt-2 max-w-full overflow-x-auto text-center [&_svg]:max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(payload.svg, 'math') }}
      />
    )
  }
  return (
    <p className="mt-2 text-xs text-muted-foreground">暂无预览。打开「编辑源」保存一次即可生成与正文一致的 MathML。</p>
  )
}

interface MathBlockSourceEditorProps {
  payload: MathBlock
  onCommit: (next: Block, editorRender?: string) => void
  onCancel: () => void
}

export function MathBlockSourceEditor({ payload, onCommit, onCancel }: MathBlockSourceEditorProps) {
  const [draft, setDraft] = useState(payload.tex)
  const [saving, setSaving] = useState(false)
  const { previewHtml, renderError, showSpinner } = useAdminMathPreview(draft, true)

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (trimmed === '') {
      onCommit({ ...payload, tex: draft })
      return
    }
    setSaving(true)
    try {
      const out = await orpc.admin.renders.math({ tex: draft, display: true })
      const mathml = out.error === null && out.mathml !== '' ? out.mathml : ''
      onCommit({ ...payload, tex: draft }, mathml)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 flex w-full max-w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">公式块 TeX</Label>
        {renderError !== null ? (
          <span className="shrink-0 text-xs text-destructive">语法错误：{renderError}</span>
        ) : null}
      </div>
      <p className="text-xs leading-snug text-muted-foreground">
        独占行或多行环境（align、gather 等）。预览与发布后正文一致（KaTeX MathML）。
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={'\\begin{align*}\n    a &= b\\\\\n    c &= d\n\\end{align*}'}
        rows={8}
        className="font-mono text-xs"
      />
      <div className="rounded-sm border bg-muted/30 px-2 py-2 text-sm">
        <span className="text-xs text-muted-foreground">预览：</span>
        {showSpinner ? (
          <span className="ml-2 text-xs text-muted-foreground">渲染中…</span>
        ) : (
          <div
            className="math math-display mt-2 max-w-full overflow-x-auto text-center"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml, 'preview') }}
          />
        )}
      </div>
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={saving}
          onClick={() => {
            setDraft(payload.tex)
            onCancel()
          }}
          title="取消"
        >
          <XIcon /> 取消
        </Button>
        <Button
          size="sm"
          type="button"
          disabled={saving}
          onClick={() => {
            void handleSave()
          }}
          title="保存编辑"
        >
          <CheckIcon /> {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  )
}
