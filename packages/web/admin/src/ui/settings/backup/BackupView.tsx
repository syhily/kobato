import type { BackupFileDto } from '@kobato/api/contracts/backup'
import type { BackupLoaderShape } from '@kobato/settings/projection'

import { Button } from '@kobato/ui/components/button'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { BackupEncryptionCard } from '@kobato/web-admin/ui/settings/backup/BackupEncryptionCard'
import { BackupFileList } from '@kobato/web-admin/ui/settings/backup/BackupFileList'
import { BackupPasswordDialog } from '@kobato/web-admin/ui/settings/backup/BackupPasswordDialog'
import { BackupRestoreDialog } from '@kobato/web-admin/ui/settings/backup/BackupRestoreDialog'
import { BackupScheduleForm } from '@kobato/web-admin/ui/settings/backup/BackupScheduleForm'
import { RestoreProgressPanel } from '@kobato/web-admin/ui/settings/backup/RestoreProgressPanel'
import {
  useBackupUploadRestore,
  waitForRestartAndReport,
} from '@kobato/web-admin/ui/settings/backup/use-backup-restore'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup'
import { orpc } from '@kobato/web-client/api/client'
import { orpcQuery } from '@kobato/web-client/api/orpc-query'
import { apiErrorDescriptorKey } from '@kobato/web-client/lib/api-error'
import { onMutationError, toastApiError } from '@kobato/web-public/ui/lib/toast-api-error'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'

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
  const { t } = useI18n()
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

  const loadPage = useCallback(
    async (limit: number, token?: string) => {
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
        toastApiError(err, 'admin.toast.backupListLoadFailed', t)
        throw err
      }
    },
    [t],
  )

  const safeLoadPage = useCallback(
    (limit: number, token?: string) => loadPage(limit, token).catch(() => undefined),
    [loadPage],
  )

  useEffect(() => {
    Promise.resolve()
      .then(() => safeLoadPage(5))
      .catch(() => undefined)
  }, [safeLoadPage])
  const isInitialLoading = backupFiles === undefined

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
      void safeLoadPage(5)
    },
    onError: onMutationError('admin.toast.backupCreateFailed', t),
  })

  const waitForRestart = useCallback(() => {
    setRestorePhase('waiting')
    pollAbortRef.current = new AbortController()
    const signal = pollAbortRef.current.signal
    void waitForRestartAndReport(signal, t).then((done) => {
      if (!done) {
        setRestoreKey(null)
        setPasswordKey(null)
        setRestorePhase('confirm')
      }
    })
  }, [t])

  const restoreMutation = useMutation({
    mutationFn: ({ key, password }: { key: string; password?: string }) =>
      orpc.admin.backup.restore(password !== undefined ? { key, password } : { key }),
    onSuccess: (result, variables) => {
      if ('passwordRequired' in result && result.passwordRequired) {
        setRestoreKey(null)
        setRestorePhase('confirm')
        setPasswordKey(variables.key)
        return
      }
      setPasswordKey(null)
      waitForRestart()
    },
    onError: (error: Error) => {
      toastApiError(error, 'admin.toast.restoreFailed', t)
      if (apiErrorDescriptorKey(error) === 'backup.error.passwordWrong' && passwordKey !== null) {
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
      toast.success(t('admin.settings.backup.view.deleted'))
      void safeLoadPage(5)
    },
    onError: onMutationError('admin.toast.deleteFailed', t),
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

  const restoreBusy = restoreMutation.isPending || restorePhase === 'waiting'
  const uploadBusy = uploadRestore.state.active || restoreBusy
  const listBusy = restoreBusy || uploadRestore.state.active

  return (
    <div className="flex flex-col gap-6">
      {(statusLoading || isInitialLoading) && (
        <div className="text-sm text-muted-foreground">{t('admin.settings.backup.view.loading')}</div>
      )}
      {!statusLoading && !isInitialLoading && primaryDriver !== 's3' && (
        <div className="rounded-xl border border-status-info-border/30 bg-status-info-bg/50 p-4 text-sm text-status-info-fg">
          {t('admin.settings.backup.view.noS3')}
        </div>
      )}
      {!statusLoading && !isInitialLoading && (
        <div className="text-sm text-muted-foreground">{t('admin.settings.backup.view.format')}</div>
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
          title={t('admin.settings.backup.view.passwordTitle')}
          description={t('admin.settings.backup.view.passwordDescription', {
            name: passwordKey.split('/').pop() ?? '',
          })}
          pending={restoreMutation.isPending}
          onSubmit={(password) => restoreMutation.mutate({ key: passwordKey, password })}
          onCancel={() => setPasswordKey(null)}
        />
      )}

      <SettingGroup
        title={t('admin.settings.backup.view.manualTitle')}
        description={t('admin.settings.backup.view.manualDescription')}
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
                  toast.error(t('admin.settings.backup.view.invalidFile'))
                  e.target.value = ''
                  setSelectedFile(null)
                  return
                }
              }
              setSelectedFile(file)
            }}
            className="sr-only"
            aria-label={t('admin.settings.backup.view.chooseFile')}
          />
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedFile ? t('admin.settings.backup.view.reselect') : t('admin.settings.backup.view.selectFile')}
            </Button>
            {selectedFile ? (
              <span className="text-sm text-muted-foreground">{selectedFile.name}</span>
            ) : (
              <span className="text-sm text-muted-foreground">{t('admin.settings.backup.view.noFile')}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={uploadBusy || !selectedFile} onClick={handleUploadRestore}>
              {uploadBusy ? t('admin.settings.backup.view.restoring') : t('admin.settings.backup.view.uploadRestore')}
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
          title={t('admin.settings.backup.view.encryptedTitle')}
          description={t('admin.settings.backup.view.encryptedDescription', {
            name: uploadRestore.state.pendingFileName ?? t('admin.settings.backup.view.unknownFile'),
          })}
          pending={uploadRestore.state.passwordPending}
          onSubmit={uploadRestore.submitPassword}
          onCancel={uploadRestore.cancelPending}
        />
      )}
    </div>
  )
}
