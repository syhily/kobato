import { CheckIcon, WorkflowIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import type { Block, MermaidBlock } from '@/shared/pt/schema'

import { orpc } from '@/client/api/client'
import { useAdminMermaidPreview } from '@/ui/admin/editor/tiptap/use-admin-mermaid-preview'
import { Button } from '@/ui/components/button'
import { Checkbox } from '@/ui/components/checkbox'
import { Label } from '@/ui/components/label'
import { SafeHtml } from '@/ui/components/safe-html'
import { Textarea } from '@/ui/components/textarea'
import { cn } from '@/ui/lib/cn'

export function mermaidBlockIcon(props: { className?: string }) {
  return <WorkflowIcon {...props} />
}

export function mermaidBlockTitle() {
  return 'Mermaid 流程图'
}

export function isMermaidBlockEditable() {
  return true
}

export function patchMermaidCenterFlag(payload: MermaidBlock, enabled: boolean): Block {
  const next: MermaidBlock = { ...payload }
  if (enabled) {
    next.center = true
  } else {
    delete next.center
  }
  return next
}

export function stripMermaidArtifacts(block: Block): Block {
  if (block._type !== 'mermaid') {
    return block
  }
  const { svg: _ignored, ...rest } = block as { svg?: string } & Block
  return rest as Block
}

interface MermaidBlockOptionsProps {
  stableId: string
  center: boolean
  onCenterChange: (enabled: boolean) => void
}

export function MermaidBlockOptions({ stableId, center, onCenterChange }: MermaidBlockOptionsProps) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 border-b border-border/80 pb-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`mermaid-center-${stableId}`}
          checked={center}
          onCheckedChange={(v) => onCenterChange(v === true)}
        />
        <Label htmlFor={`mermaid-center-${stableId}`} className="cursor-pointer text-xs leading-none font-normal">
          永远居中
        </Label>
      </div>
    </div>
  )
}

export function MermaidBlockSummary({ payload }: { payload: MermaidBlock }) {
  const center = payload.center === true
  if (payload.svg !== undefined && payload.svg !== '') {
    const inner = (
      <SafeHtml
        html={payload.svg}
        strategy="mermaid"
        className={cn('mermaid mt-2 max-w-full overflow-x-auto [&_svg]:max-w-none', center && 'shrink-0')}
      />
    )
    if (!center) {
      return inner
    }
    return <div className="flex max-w-full justify-center overflow-x-auto">{inner}</div>
  }
  return (
    <p className="mt-2 text-xs text-muted-foreground">暂无预览图。打开「编辑源」保存一次即可生成与正文一致的 SVG。</p>
  )
}

interface MermaidBlockSourceEditorProps {
  payload: MermaidBlock
  onCommit: (next: Block, editorRender?: string) => void
  onCancel: () => void
}

export function MermaidBlockSourceEditor({ payload, onCommit, onCancel }: MermaidBlockSourceEditorProps) {
  const [draft, setDraft] = useState(payload.code)
  const [saving, setSaving] = useState(false)
  const center = payload.center === true
  const { previewHtml, renderError, showSpinner } = useAdminMermaidPreview(draft)

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (trimmed === '') {
      onCommit({ ...payload, code: draft })
      return
    }
    setSaving(true)
    try {
      const out = await orpc.admin.renders.mermaid({ code: draft })
      const svg = out.error === null && out.svg !== '' ? out.svg : ''
      onCommit({ ...payload, code: draft }, svg)
    } finally {
      setSaving(false)
    }
  }

  const previewInner =
    previewHtml !== '' ? (
      <SafeHtml
        html={previewHtml}
        strategy="preview"
        className={cn('mermaid mt-2 max-w-full overflow-x-auto [&_svg]:max-w-none', center && 'shrink-0')}
      />
    ) : (
      <span className="ml-2 text-xs text-muted-foreground">输入源码后显示预览</span>
    )

  return (
    <div className="mt-2 flex w-full max-w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Mermaid 源</Label>
        {renderError !== null ? (
          <span className="shrink-0 text-xs text-destructive">语法错误：{renderError}</span>
        ) : null}
      </div>
      <p className="text-xs leading-snug text-muted-foreground">
        预览与发布后正文一致（beautiful-mermaid）。保存时会写入与正文相同的 SVG。
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={'graph TD\n  A --> B'}
        rows={8}
        className="font-mono text-xs"
      />
      <div className="rounded-sm border bg-muted/30 px-2 py-2 text-sm">
        <span className="text-xs text-muted-foreground">预览：</span>
        {showSpinner ? (
          <span className="ml-2 text-xs text-muted-foreground">渲染中…</span>
        ) : center ? (
          <div className="flex max-w-full justify-center overflow-x-auto">{previewInner}</div>
        ) : (
          previewInner
        )}
      </div>
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={saving}
          onClick={() => {
            setDraft(payload.code)
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
