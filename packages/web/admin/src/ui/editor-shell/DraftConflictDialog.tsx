import type { LexicalEditorState } from '@kobato/inkling/headless/schema'
import type { ReactNode } from 'react'

import { Button } from '@kobato/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@kobato/ui/components/dialog'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { formatWallClockDateTime } from '@kobato/web-admin/ui/editor-shell/wall-clock'
import { diffBodies, DiffPanel } from '@kobato/web-admin/ui/editor/lexical-body-diff'
import { ArrowRightLeftIcon, MonitorIcon, ServerIcon } from 'lucide-react'

export interface DraftConflictDialogProps {
  open: boolean
  localBody: LexicalEditorState
  serverBody: LexicalEditorState
  localSavedAt: number | null
  serverUpdatedAt: number | null
  onChooseLocal: () => void
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
  icon: ReactNode
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
      <div className="max-h-editor-min overflow-y-auto p-3">
        <DiffPanel diff={diff} side={side} />
      </div>
    </div>
  )
}
