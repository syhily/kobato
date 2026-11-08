import { ArrowRightLeftIcon, MonitorIcon, ServerIcon } from 'lucide-react'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { formatWallClockDateTime } from '@/ui/admin/editor-shell/wall-clock'
import { diffBodies, DiffPanel } from '@/ui/admin/editor/lexical-body-diff'
import { Button } from '@/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { useI18n } from '@/ui/lib/I18nProvider'

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
  const { t } = useI18n()
  const diff = diffBodies(serverBody, localBody)

  return (
    <Dialog open={open}>
      <DialogContent className="max-h-dialog-max-h max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeftIcon className="size-4" />
            {t('admin.editor.conflict.title')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('admin.editor.conflict.description')}</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <DraftPanel
            title={t('admin.editor.conflict.cloud')}
            icon={<ServerIcon className="size-4" />}
            timestamp={serverUpdatedAt}
            side="left"
            diff={diff}
          />
          <DraftPanel
            title={t('admin.editor.conflict.local')}
            icon={<MonitorIcon className="size-4" />}
            timestamp={localSavedAt}
            side="right"
            diff={diff}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={onChooseServer}>
            <ServerIcon /> {t('admin.editor.conflict.useCloud')}
          </Button>
          <Button onClick={onChooseLocal}>
            <MonitorIcon /> {t('admin.editor.conflict.useLocal')}
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
  const { locale } = useI18n()
  return (
    <div className="flex min-h-0 flex-col rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
        {icon}
        {title}
        {timestamp !== null ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {formatWallClockDateTime(new Date(timestamp), locale)}
          </span>
        ) : null}
      </div>
      <div className="max-h-(--spacing-editor-min) overflow-y-auto p-3">
        <DiffPanel diff={diff} side={side} />
      </div>
    </div>
  )
}
