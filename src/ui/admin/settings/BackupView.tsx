import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'

import type { BackupLoaderShape } from '@/shared/config/projection'
import type { BackupFileDto } from '@/shared/types/backup'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError, toastApiError } from '@/client/lib/toast-api-error'
import { BackupEncryptionCard } from '@/ui/admin/settings/BackupEncryptionCard'
import { BackupFileList } from '@/ui/admin/settings/BackupFileList'
import { BackupPasswordDialog } from '@/ui/admin/settings/BackupPasswordDialog'
import { BackupRestoreDialog } from '@/ui/admin/settings/BackupRestoreDialog'
import { BackupScheduleForm } from '@/ui/admin/settings/BackupScheduleForm'
import { RestoreProgressPanel } from '@/ui/admin/settings/RestoreProgressPanel'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { useBackupUploadRestore, waitForRestartAndReport } from '@/ui/admin/settings/use-backup-restore'
import { Button } from '@/ui/components/button'

type RestorePhase = 'confirm' | 'waiting'

interface BackupViewProps {
  backup: BackupLoaderShape | null
  timeZone: string
}

const FALLBACK_BACKUP: BackupLoaderShape = {
  scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
  retention: { enabled: true, days: 30 },
  encryption: { enabled: false, password: '' },
  passwordMask: null,
}

export function BackupView({ backup, timeZone }: BackupViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [restoreKey, setRestoreKey] = useState<string | null>(null)
  const [restorePhase, setRestorePhase] = useState<RestorePhase>('confirm')
  const [passwordKey, setPasswordKey] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)

  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  const csrfToken = rootData?.csrfToken

  const [backupFiles, setBackupFiles] = useState<BackupFileDto[] | undefined>(undefined)
  const [nextToken, setNextToken] = useState<string | undefined>()
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const { data: statusData, isPending: statusLoading } = useQuery(orpcQuery.admin.backup.status.queryOptions())

  const uploadRestore = useBackupUploadRestore({ csrfToken })

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
      toastApiError(err, '加载备份列表失败')
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

  // Defer the initial load so `isInitialLoading` derives from `backupFiles` state alone.
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
    mutationFn: ({ password }: { password?: string }) =>
      orpc.admin.backup.create(password !== undefined ? { password } : undefined),
    onSuccess: () => {
      // Keep the current rows while reloading — clearing to undefined would
      // flash the "loading / empty" states over a successful create.
      void safeLoadPage(5)
    },
    onError: onMutationError('创建备份失败'),
  })

  /** Shared tail for the list-restore flow: wait out the restart, toast, reload. */
  const waitForRestart = useCallback(() => {
    setRestorePhase('waiting')
    pollAbortRef.current = new AbortController()
    const signal = pollAbortRef.current.signal
    void waitForRestartAndReport(signal).then((done) => {
      if (!done) {
        setRestoreKey(null)
        setPasswordKey(null)
        setRestorePhase('confirm')
      }
    })
  }, [])

  const restoreMutation = useMutation({
    mutationFn: ({ key, password }: { key: string; password?: string }) =>
      orpc.admin.backup.restore(password !== undefined ? { key, password } : { key }),
    onSuccess: (result, variables) => {
      if ('passwordRequired' in result && result.passwordRequired) {
        // The stored backup is encrypted and no usable password was found — prompt.
        setRestoreKey(null)
        setRestorePhase('confirm')
        setPasswordKey(variables.key)
        return
      }
      setPasswordKey(null)
      waitForRestart()
    },
    onError: (error: Error) => {
      toastApiError(error, '还原失败')
      // A wrong password (400) keeps the prompt open for a retry — same
      // contract as the upload flow; anything else resets the flow.
      if (error.message.includes('密码') && passwordKey !== null) {
        setRestorePhase('confirm')
        return
      }
      setRestoreKey(null)
      setPasswordKey(null)
      setRestorePhase('confirm')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ key }: { key: string }) => orpc.admin.backup.delete({ key }),
    onSuccess: () => {
      toast.success('备份文件已删除')
      void safeLoadPage(5)
    },
    onError: onMutationError('删除失败'),
  })

  const handleLoadMore = useCallback(() => {
    if (!nextToken || isLoadingMore) {
      return
    }
    setIsLoadingMore(true)
    void safeLoadPage(5, nextToken).finally(() => setIsLoadingMore(false))
  }, [nextToken, isLoadingMore, safeLoadPage])

  const handleUploadRestore = useCallback(() => {
    if (!selectedFile || uploadRestore.state.active) {
      return
    }
    uploadRestore.startUpload(selectedFile)
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [selectedFile, uploadRestore])

  // While a restore is pending or the server is swapping/restarting, every
  // mutating control locks — the server would only answer 409/network noise.
  const restoreBusy = restoreMutation.isPending || restorePhase === 'waiting'
  const uploadBusy = uploadRestore.state.active || restoreBusy
  const listBusy = restoreBusy || uploadRestore.state.active

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
          备份是一个 .tar.gz
          归档，同时包含内容数据库（文章、页面、评论、设置）、访问统计（analytics.duckdb）与配置文件（kobato.config.json），可选择加密（.enc）。旧格式的单文件备份仍可正常还原。
        </div>
      )}

      <BackupScheduleForm backup={source} />

      <BackupEncryptionCard backup={source} />

      <BackupFileList
        backups={backupFiles ?? []}
        timeZone={timeZone}
        isCreating={createMutation.isPending || listBusy}
        encryptionEnabled={source.encryption.enabled}
        onCreate={(password) => createMutation.mutate({ password })}
        restorePending={restoreMutation.isPending || listBusy}
        onRestore={(key) => {
          setRestoreKey(key)
          setRestorePhase('confirm')
        }}
        onDelete={(key) => deleteMutation.mutate({ key })}
        deletePending={deleteMutation.isPending || listBusy}
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

      {passwordKey && (
        <BackupPasswordDialog
          title="输入备份密码"
          description={`备份「${passwordKey.split('/').pop()}」已加密，请输入备份密码以继续还原。`}
          pending={restoreMutation.isPending}
          onSubmit={(password) => restoreMutation.mutate({ key: passwordKey, password })}
          onCancel={() => setPasswordKey(null)}
        />
      )}

      <SettingGroup
        title="手动还原"
        description="上传备份文件还原：.db.tar.gz 归档（内容 + 访问统计 + 配置，支持 .enc 加密归档）、单独的 .db 内容数据库，或 .duckdb 访问统计文件。加密备份会在上传后自动识别并要求输入密码。"
      >
        <div className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,.duckdb,.gz,.enc,application/gzip,application/octet-stream"
            disabled={uploadBusy}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              if (file) {
                const name = file.name
                const isValid = /\.(db|duckdb|enc|gz)$/i.test(name)
                if (!isValid) {
                  toast.error('仅支持 .db.tar.gz（含 .enc）、.db.gz、.db、.duckdb 或 .gz 格式的备份文件')
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
              disabled={uploadBusy}
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
            <Button type="button" disabled={uploadBusy || !selectedFile} onClick={handleUploadRestore}>
              {uploadBusy ? '还原中…' : '上传并还原'}
            </Button>
          </div>

          {uploadBusy && (
            <RestoreProgressPanel
              current={uploadRestore.state.step}
              percent={uploadRestore.state.percent}
              hasDecrypt={uploadRestore.state.hasDecrypt}
            />
          )}
        </div>
      </SettingGroup>

      {uploadRestore.state.pendingToken !== null && (
        <BackupPasswordDialog
          title="该备份已加密"
          description={`已自动识别「${uploadRestore.state.pendingFileName ?? '备份文件'}」为加密备份，请输入备份密码以继续还原。`}
          pending={uploadRestore.state.passwordPending}
          onSubmit={uploadRestore.submitPassword}
          onCancel={uploadRestore.cancelPending}
        />
      )}
    </div>
  )
}
