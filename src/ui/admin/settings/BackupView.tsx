import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { BackupSettings } from '@/shared/config/blog'

import { orpc } from '@/client/api/client'
import { useMutation, useQuery, useQueryClient } from '@/client/api/query'
import { BackupFileList } from '@/ui/admin/settings/BackupFileList'
import { BackupRestoreDialog } from '@/ui/admin/settings/BackupRestoreDialog'
import { BackupScheduleForm } from '@/ui/admin/settings/BackupScheduleForm'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'

interface BackupViewProps {
  backup: BackupSettings | null
  timeZone: string
}

const FALLBACK_BACKUP: BackupSettings = {
  scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
  retention: { enabled: true, days: 30 },
}

export function BackupView({ backup }: BackupViewProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [restoreKey, setRestoreKey] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const { data: statusData, isPending: statusLoading } = useQuery({
    queryKey: ['admin', 'backup', 'status'],
    queryFn: () => orpc.admin.backup.status(),
  })

  const { data: listData, isPending: listLoading } = useQuery({
    queryKey: ['admin', 'backup', 'list'],
    queryFn: () => orpc.admin.backup.list(),
  })

  const s3Enabled = statusData?.s3Enabled ?? false
  const pgToolsAvailable = statusData?.pgToolsAvailable ?? false
  const backups = listData?.files ?? []

  const source = backup ?? FALLBACK_BACKUP

  const createMutation = useMutation({
    mutationFn: () => orpc.admin.backup.create(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'backup', 'list'] })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: ({ key }: { key: string }) => orpc.admin.backup.restore({ key }),
    onSuccess: () => {
      setRestoreKey(null)
      toast.success('还原成功，服务即将重启…')
    },
  })

  const handleUploadRestore = useCallback(async () => {
    const input = fileInputRef.current
    if (!input?.files?.[0]) {
      return
    }
    const file = input.files[0]
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      // oRPC doesn't support multipart/form-data uploads — raw fetch is required here
      const res = await fetch('/api/admin/backup/upload-restore', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } }
        throw new Error(data.error?.message ?? '上传还原失败')
      }
      toast.success('还原成功，服务即将重启…')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传还原失败')
    } finally {
      setUploading(false)
      input.value = ''
    }
  }, [])

  const canConfigure = s3Enabled && pgToolsAvailable
  const isLoading = statusLoading || listLoading

  return (
    <div className="flex flex-col gap-6">
      {isLoading && <div className="text-sm text-muted-foreground">正在读取备份信息…</div>}
      {!isLoading && !pgToolsAvailable && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700">
          当前运行环境缺少 postgresql-client，备份与还原功能不可用。
        </div>
      )}
      {!isLoading && !s3Enabled && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700">
          请先前往存储配置启用 S3 存储。
        </div>
      )}

      <BackupScheduleForm backup={source} canConfigure={canConfigure} />

      <BackupFileList
        backups={backups}
        canConfigure={canConfigure}
        isCreating={createMutation.isPending}
        onCreate={() => createMutation.mutate()}
        restorePending={restoreMutation.isPending}
        pgToolsAvailable={pgToolsAvailable}
        onRestore={(key) => setRestoreKey(key)}
      />

      {restoreKey && (
        <BackupRestoreDialog
          restoreKey={restoreKey}
          isPending={restoreMutation.isPending}
          onConfirm={(key) => restoreMutation.mutate({ key })}
          onCancel={() => setRestoreKey(null)}
        />
      )}

      <SettingGroup title="手动还原" description="上传 .sql.gz 备份文件进行还原。">
        <div className="flex flex-col gap-3">
          <Input ref={fileInputRef} type="file" accept=".sql.gz" disabled={!pgToolsAvailable || uploading} />
          <div className="flex gap-2">
            <Button type="button" disabled={!pgToolsAvailable || uploading} onClick={() => void handleUploadRestore()}>
              {uploading ? '上传还原中…' : '上传并还原'}
            </Button>
          </div>
        </div>
      </SettingGroup>
    </div>
  )
}
