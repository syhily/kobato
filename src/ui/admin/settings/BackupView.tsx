import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'

import type { BackupSettings } from '@/shared/config/types'
import type { BackupFileDto } from '@/shared/types/backup'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { extractApiErrorMessage, isApiAccepted } from '@/shared/utils/api-error'
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
        // Server is back online; check the restore result before reloading.
        try {
          const statusRes = await fetch('/api/admin/backup/restore-status', {
            cache: 'no-store',
            signal,
          })
          if (statusRes.ok) {
            const status: unknown = await statusRes.json()
            if (
              typeof status === 'object' &&
              status !== null &&
              'phase' in status &&
              typeof status.phase === 'string' &&
              status.phase === 'completed'
            ) {
              toast.success('备份已还原')
            } else if (
              typeof status === 'object' &&
              status !== null &&
              'phase' in status &&
              typeof status.phase === 'string' &&
              status.phase === 'failed'
            ) {
              const error = 'error' in status && typeof status.error === 'string' ? status.error : undefined
              toast.error('还原失败', { description: error })
            }
          }
        } catch {
          // Ignore status check errors; the server is up, so proceed to reload.
        }
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

  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  const csrfToken = rootData?.csrfToken

  const [backupFiles, setBackupFiles] = useState<BackupFileDto[] | undefined>(undefined)
  const [nextToken, setNextToken] = useState<string | undefined>()
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const { data: statusData, isPending: statusLoading } = useQuery(orpcQuery.admin.backup.status.queryOptions())

  const loadPage = useCallback(async (limit: number, token?: string) => {
    try {
      const res = await orpc.admin.backup.list({ limit, continuationToken: token })
      if (token) {
        setBackupFiles((prev) => [...(prev ?? []), ...res.files])
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

  const safeLoadPage = useCallback(
    (limit: number, token?: string) =>
      loadPage(limit, token).catch(() => {
        /* intentionally empty — loadPage already shows a toast on error */
      }),
    [loadPage],
  )

  // Defer the initial list load so `isInitialLoading` is derived from
  // `backupFiles` state alone — no separate loading flag needed.
  useEffect(() => {
    Promise.resolve()
      .then(() => safeLoadPage(5))
      .catch(() => {
        /* handled in safeLoadPage */
      })
  }, [safeLoadPage])
  const isInitialLoading = backupFiles === undefined

  // Abort any in-flight polling when the component unmounts.
  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort()
    }
  }, [])

  const primaryDriver = statusData?.primaryDriver ?? 'local'

  const source = backup ?? FALLBACK_BACKUP

  const createMutation = useMutation({
    mutationFn: () => orpc.admin.backup.create(),
    onSuccess: () => {
      setBackupFiles(undefined)
      void safeLoadPage(5)
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
      setBackupFiles(undefined)
      void safeLoadPage(5)
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
    void safeLoadPage(5, nextToken).finally(() => setIsLoadingMore(false))
  }, [nextToken, isLoadingMore, safeLoadPage])

  const handleUploadRestore = useCallback(async () => {
    if (!selectedFile) {
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      const headers: Record<string, string> = {}
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken
      }
      const res = await fetch('/api/admin/backup/upload-restore', {
        method: 'POST',
        body: formData,
        headers,
      })
      const json: unknown = await res.json()
      const errorMessage = extractApiErrorMessage(json)
      if (!res.ok) {
        throw new Error(errorMessage ?? '上传还原失败')
      }
      const accepted = isApiAccepted(json)
      if (accepted) {
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
  }, [selectedFile, csrfToken])

  // File-based backups need no external tooling — they land in S3 when
  // configured and in local storage otherwise. `primaryDriver` only drives
  // the informational banner below.
  const canConfigure = true

  return (
    <div className="flex flex-col gap-6">
      {(statusLoading || isInitialLoading) && <div className="text-sm text-muted-foreground">正在读取备份信息…</div>}
      {!statusLoading && !isInitialLoading && primaryDriver !== 's3' && (
        <div className="rounded-xl border border-status-info-border/30 bg-status-info-bg/50 p-4 text-sm text-status-info-fg">
          未启用 S3 存储，备份将写入服务器本地存储。建议配置 S3 以实现异地备份与更长的保留期。
        </div>
      )}
      {!statusLoading && !isInitialLoading && (
        <div className="text-sm text-muted-foreground">
          备份仅包含内容数据库（文章、页面、评论、设置等）。访问统计（analytics.duckdb）属于可再生的遥测数据，不包含在备份中，还原后将从空表重新累积。
        </div>
      )}

      <BackupScheduleForm backup={source} canConfigure={canConfigure} />

      <BackupFileList
        backups={backupFiles ?? []}
        timeZone={timeZone}
        canConfigure={canConfigure}
        isCreating={createMutation.isPending}
        onCreate={() => createMutation.mutate()}
        restorePending={restoreMutation.isPending}
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

      <SettingGroup title="手动还原" description="上传 .db 或 .db.gz 备份文件进行还原。">
        <div className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,.gz,application/gzip"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              if (file) {
                const name = file.name
                const isValid = /\.db$/i.test(name) || /\.db\.gz$/i.test(name) || /^[^.]+\.gz$/i.test(name)
                if (!isValid) {
                  toast.error('仅支持 .db、.db.gz 或 .gz 格式的备份文件')
                  e.target.value = ''
                  setSelectedFile(null)
                  return
                }
              }
              setSelectedFile(file)
            }}
            className="sr-only"
            aria-label="选择备份文件"
          />
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
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
            <Button type="button" disabled={uploading || !selectedFile} onClick={() => void handleUploadRestore()}>
              {uploading ? '上传还原中…' : '上传并还原'}
            </Button>
          </div>
        </div>
      </SettingGroup>
    </div>
  )
}
