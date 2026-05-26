import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { BackupSettings } from '@/shared/config/types'
import type { BackupFileDto } from '@/shared/types/backup'

import { orpc } from '@/client/api/client'
import { useMutation, useQuery } from '@/client/api/query'
import { BackupFileList } from '@/ui/admin/settings/BackupFileList'
import { BackupRestoreDialog } from '@/ui/admin/settings/BackupRestoreDialog'
import { BackupScheduleForm } from '@/ui/admin/settings/BackupScheduleForm'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { Button } from '@/ui/components/button'

type RestorePhase = 'confirm' | 'waiting'

interface BackupViewProps {
  backup: BackupSettings | null
  timeZone: string
}

const FALLBACK_BACKUP: BackupSettings = {
  scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
  retention: { enabled: true, days: 30 },
}

async function pollReady(onTimeout: () => void, signal: AbortSignal) {
  const MAX_ATTEMPTS = 150
  const INTERVAL_MS = 2000

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (signal.aborted) {
      return
    }

    try {
      const res = await fetch('/ready', { cache: 'no-store', signal })
      if (res.ok) {
        window.location.reload()
        return
      }
    } catch {
      // Network errors during restart are expected; keep polling.
    }

    await new Promise<void>((resolve) => setTimeout(resolve, INTERVAL_MS))
  }

  if (!signal.aborted) {
    toast.error('等待服务重启超时，请手动刷新页面。')
    onTimeout()
  }
}

export function BackupView({ backup, timeZone }: BackupViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [restoreKey, setRestoreKey] = useState<string | null>(null)
  const [restorePhase, setRestorePhase] = useState<RestorePhase>('confirm')
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)

  const [backupFiles, setBackupFiles] = useState<BackupFileDto[]>([])
  const [nextToken, setNextToken] = useState<string | undefined>()
  const [isInitialLoading, setIsInitialLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const { data: statusData, isPending: statusLoading } = useQuery({
    queryKey: ['admin', 'backup', 'status'],
    queryFn: () => orpc.admin.backup.status(),
  })

  const loadPage = useCallback(async (limit: number, token?: string) => {
    try {
      const res = await orpc.admin.backup.list({ limit, continuationToken: token })
      if (token) {
        setBackupFiles((prev) => [...prev, ...res.files])
      } else {
        setBackupFiles(res.files)
      }
      setNextToken(res.nextContinuationToken)
      return res
    } catch (err) {
      toast.error('加载备份列表失败', {
        description: err instanceof Error ? err.message : '请检查网络或刷新页面重试',
      })
      throw err
    }
  }, [])

  useEffect(() => {
    setIsInitialLoading(true)
    void loadPage(5).finally(() => setIsInitialLoading(false))
  }, [loadPage])

  // Abort any in-flight polling when the component unmounts.
  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort()
    }
  }, [])

  const s3Enabled = statusData?.s3Enabled ?? false
  const pgToolsAvailable = statusData?.pgToolsAvailable ?? false

  const source = backup ?? FALLBACK_BACKUP

  const createMutation = useMutation({
    mutationFn: () => orpc.admin.backup.create(),
    onSuccess: () => {
      setIsInitialLoading(true)
      void loadPage(backupFiles.length || 5).finally(() => setIsInitialLoading(false))
    },
  })

  const restoreMutation = useMutation({
    mutationFn: ({ key }: { key: string }) => orpc.admin.backup.restore({ key }),
    onSuccess: () => {
      setRestorePhase('waiting')
      pollAbortRef.current = new AbortController()
      void pollReady(() => {
        setRestoreKey(null)
        setRestorePhase('confirm')
      }, pollAbortRef.current.signal)
    },
    onError: (error: Error) => {
      toast.error('还原失败', { description: error.message })
      setRestoreKey(null)
      setRestorePhase('confirm')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ key }: { key: string }) => orpc.admin.backup.delete({ key }),
    onSuccess: () => {
      toast.success('备份文件已删除')
      setIsInitialLoading(true)
      void loadPage(backupFiles.length || 5).finally(() => setIsInitialLoading(false))
    },
    onError: (error: Error) => {
      toast.error('删除失败', { description: error.message })
    },
  })

  const handleLoadMore = useCallback(() => {
    if (!nextToken || isLoadingMore) {
      return
    }
    setIsLoadingMore(true)
    void loadPage(5, nextToken).finally(() => setIsLoadingMore(false))
  }, [nextToken, isLoadingMore, loadPage])

  const handleUploadRestore = useCallback(async () => {
    if (!selectedFile) {
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      const res = await fetch('/api/admin/backup/upload-restore', {
        method: 'POST',
        body: formData,
      })
      const json = (await res.json()) as { accepted?: boolean; error?: { message?: string } }
      if (!res.ok) {
        throw new Error(json.error?.message ?? '上传还原失败')
      }
      if (json.accepted) {
        setRestorePhase('waiting')
        setRestoreKey('upload-restore')
        pollAbortRef.current = new AbortController()
        void pollReady(() => {
          setRestoreKey(null)
          setRestorePhase('confirm')
        }, pollAbortRef.current.signal)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传还原失败')
    } finally {
      setUploading(false)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [selectedFile])

  const canConfigure = s3Enabled && pgToolsAvailable

  return (
    <div className="flex flex-col gap-6">
      {(statusLoading || isInitialLoading) && <div className="text-sm text-muted-foreground">正在读取备份信息…</div>}
      {!statusLoading && !isInitialLoading && !pgToolsAvailable && (
        <div className="rounded-md border border-status-warn-border/30 bg-status-warn-bg/50 p-4 text-sm text-status-warn-fg">
          当前运行环境缺少 postgresql-client，备份与还原功能不可用。
        </div>
      )}
      {!statusLoading && !isInitialLoading && !s3Enabled && (
        <div className="rounded-md border border-status-warn-border/30 bg-status-warn-bg/50 p-4 text-sm text-status-warn-fg">
          请先前往存储配置启用 S3 存储。
        </div>
      )}

      <BackupScheduleForm backup={source} canConfigure={canConfigure} />

      <BackupFileList
        backups={backupFiles}
        timeZone={timeZone}
        canConfigure={canConfigure}
        isCreating={createMutation.isPending}
        onCreate={() => createMutation.mutate()}
        restorePending={restoreMutation.isPending}
        pgToolsAvailable={pgToolsAvailable}
        onRestore={(key) => {
          setRestoreKey(key)
          setRestorePhase('confirm')
        }}
        onDelete={(key) => deleteMutation.mutate({ key })}
        deletePending={deleteMutation.isPending}
        onLoadMore={handleLoadMore}
        isLoadingMore={isLoadingMore}
        hasMore={!!nextToken}
      />

      {restoreKey && (
        <BackupRestoreDialog
          restoreKey={restoreKey}
          isPending={restoreMutation.isPending}
          phase={restorePhase}
          onConfirm={(key) => restoreMutation.mutate({ key })}
          onCancel={() => {
            pollAbortRef.current?.abort()
            setRestoreKey(null)
            setRestorePhase('confirm')
          }}
        />
      )}

      <SettingGroup title="手动还原" description="上传 .sql.gz 备份文件进行还原。">
        <div className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".sql,.gz,application/gzip"
            disabled={!pgToolsAvailable || uploading}
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            className="sr-only"
            aria-label="选择备份文件"
          />
          <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pgToolsAvailable || uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedFile ? '重新选择' : '选择文件'}
            </Button>
            {selectedFile ? (
              <span className="text-sm text-muted-foreground">{selectedFile.name}</span>
            ) : (
              <span className="text-sm text-muted-foreground">未选择文件</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!pgToolsAvailable || uploading || !selectedFile}
              onClick={() => void handleUploadRestore()}
            >
              {uploading ? '上传还原中…' : '上传并还原'}
            </Button>
          </div>
        </div>
      </SettingGroup>
    </div>
  )
}
