import { ArrowRightLeftIcon, MonitorIcon, ServerIcon } from 'lucide-react'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { diffBodies, DiffPanel } from '@/ui/admin/editor/lexical-body-diff'
import { Button } from '@/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/components/dialog'

export interface DraftConflictDialogProps {
  open: boolean
  /** Body that was just loaded from the IndexedDB local draft. */
  localBody: LexicalEditorState
  /** Body of the server's latest revision. */
  serverBody: LexicalEditorState
  /** ms-since-epoch when the local copy was last saved. */
  localSavedAt: number | null
  /** ms-since-epoch when the server copy was last updated. */
  serverUpdatedAt: number | null
  /** Adopt the local copy and overwrite the server on next save. */
  onChooseLocal: () => void
  /** Adopt the server copy and discard the local draft. */
  onChooseServer: () => void
}

export function DraftConflictDialog({
  open,
  localBody,
  serverBody,
  localSavedAt,
  serverUpdatedAt,
  onChooseLocal,
  onChooseServer,
}: DraftConflictDialogProps) {
  const diff = diffBodies(serverBody, localBody)

  return (
    <Dialog open={open}>
      <DialogContent className="max-h-dialog-max-h max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeftIcon className="size-4" />
            检测到本地草稿与云端不一致
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          两份内容都存在，但内容不一致。请选择保留哪一份继续编辑。被舍弃的一份会被永久丢弃。
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          <DraftPanel
            title="云端版本"
            icon={<ServerIcon className="size-4" />}
            timestamp={serverUpdatedAt}
            side="left"
            diff={diff}
          />
          <DraftPanel
            title="本地草稿"
            icon={<MonitorIcon className="size-4" />}
            timestamp={localSavedAt}
            side="right"
            diff={diff}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={onChooseServer}>
            <ServerIcon /> 使用云端版本
          </Button>
          <Button onClick={onChooseLocal}>
            <MonitorIcon /> 使用本地草稿
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface DraftPanelProps {
  title: string
  icon: React.ReactNode
  timestamp: number | null
  side: 'left' | 'right'
  diff: ReturnType<typeof diffBodies>
}

function DraftPanel({ title, icon, timestamp, side, diff }: DraftPanelProps) {
  return (
    <div className="flex min-h-0 flex-col rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
        {icon}
        {title}
        {timestamp !== null ? (
          <span className="ml-auto text-xs text-muted-foreground">{new Date(timestamp).toLocaleString('zh-CN')}</span>
        ) : null}
      </div>
      <div className="max-h-(--spacing-editor-min) overflow-y-auto p-3">
        <DiffPanel diff={diff} side={side} />
      </div>
    </div>
  )
}
