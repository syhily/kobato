import { ArrowRightLeftIcon, MonitorIcon, ServerIcon } from 'lucide-react'

import type { InklingDocument } from '@/shared/inkling/schema'

import { inklingDocumentFingerprint } from '@/shared/inkling/normalize'
import { Button } from '@/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { InklingBody } from '@/ui/inkling/render/InklingBody'
import { cn } from '@/ui/lib/cn'

export interface DraftConflictDialogProps {
  open: boolean
  /** Inkling body that was just loaded from Local Storage. */
  localBody: InklingDocument
  /** Inkling body of the server's latest revision. */
  serverBody: InklingDocument
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
            body={serverBody}
            otherBody={localBody}
            side="left"
          />
          <DraftPanel
            title="本地草稿"
            icon={<MonitorIcon className="size-4" />}
            timestamp={localSavedAt}
            body={localBody}
            otherBody={serverBody}
            side="right"
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
  body: InklingDocument
  otherBody: InklingDocument
  side: 'left' | 'right'
}

function blockFingerprint(body: InklingDocument, block: InklingDocument['root']['children'][number]): string {
  const doc: InklingDocument = {
    _type: 'inkling',
    schemaVersion: body.schemaVersion,
    lexicalVersion: body.lexicalVersion,
    root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [block] },
  }
  return inklingDocumentFingerprint(doc)
}

function DraftPanel({ title, icon, timestamp, body, otherBody }: DraftPanelProps) {
  const otherFingerprints = new Set(otherBody.root.children.map((block) => blockFingerprint(otherBody, block)))
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
        <div className="flex flex-col gap-2">
          {body.root.children.map((block, index) => {
            const fp = blockFingerprint(body, block)
            const changed = !otherFingerprints.has(fp)
            return (
              <div
                key={block.key ?? `block-${index}`}
                className={cn('rounded border p-2', changed ? 'border-brand/40 bg-brand/5' : 'border-transparent')}
              >
                {changed ? <div className="mb-1 text-[10px] font-medium text-brand">已变更</div> : null}
                <div className="opacity-90">
                  <InklingBody document={{ ...body, root: { ...body.root, children: [block] } }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
