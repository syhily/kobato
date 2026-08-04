import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { diffLexicalBodies, LexicalDiffPanel } from '@kobato/editor/engine/lexical/lexical-diff'
import { Button } from '@kobato/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@kobato/ui/components/dialog'
import { ArrowRightLeftIcon, MonitorIcon, ServerIcon } from 'lucide-react'

export interface DraftConflictDialogProps {
  open: boolean
  /** Lexical body that was just loaded from Local Storage. */
  localBody: LexicalBody
  /** Lexical body of the server's latest revision. */
  serverBody: LexicalBody
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
  const diff = diffLexicalBodies(serverBody, localBody)

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
  diff: ReturnType<typeof diffLexicalBodies>
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
        <LexicalDiffPanel diff={diff} side={side} />
      </div>
    </div>
  )
}
