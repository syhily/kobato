import { LockIcon } from 'lucide-react'
import { useState } from 'react'

import type { AppLocale } from '@/shared/i18n/locales'
import type { BackupFileDto } from '@/shared/types/backup'

import { formatBytes, formatDateTime } from '@/shared/i18n/format'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/components/alert-dialog'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { useI18n } from '@/ui/lib/I18nProvider'

interface BackupFileListProps {
  backups: BackupFileDto[]
  timeZone: string
  isCreating: boolean
  /** Settings-level encryption switch — the create dialog hints accordingly. */
  encryptionEnabled: boolean
  /** Called with the optional one-off password (undefined = the settings default). */
  onCreate: (password?: string) => void
  restorePending: boolean
  onRestore: (key: string) => void
  onDelete: (key: string) => void
  deletePending: boolean
  onLoadMore: () => void
  isLoadingMore: boolean
  hasMore: boolean
}

const BASE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}

function formatBackupTimestamp(iso: string, options: { locale: AppLocale; timeZone: string }): string {
  const { locale, timeZone } = options
  try {
    return formatDateTime(new Date(iso), { ...BASE_OPTS, locale, timeZone })
  } catch {
    // An invalid configured zone must not crash the list — format the same parts in UTC.
    return formatDateTime(new Date(iso), { ...BASE_OPTS, locale, timeZone: 'UTC' })
  }
}

export function BackupFileList({
  backups,
  timeZone,
  isCreating,
  encryptionEnabled,
  onCreate,
  restorePending,
  onRestore,
  onDelete,
  deletePending,
  onLoadMore,
  isLoadingMore,
  hasMore,
}: BackupFileListProps) {
  const { locale, t } = useI18n()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createPassword, setCreatePassword] = useState('')
  return (
    <SettingGroup
      title={t('admin.settings.backup.files.title')}
      description={t('admin.settings.backup.files.description')}
      actions={
        <Button type="button" disabled={isCreating} onClick={() => setCreateOpen(true)}>
          {isCreating ? t('admin.settings.backup.files.creating') : t('admin.settings.backup.files.create')}
        </Button>
      }
    >
      {backups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('admin.settings.backup.files.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t('admin.settings.backup.files.column.name')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('admin.settings.backup.files.column.size')}</th>
                <th className="px-4 py-2 text-left font-medium">{t('admin.settings.backup.files.column.time')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('admin.settings.backup.files.column.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {backups.map((file) => (
                <tr key={file.key}>
                  <td className="px-4 py-2 font-mono text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      {file.encrypted && (
                        <span title={t('admin.settings.backup.files.encryptedTitle')}>
                          <LockIcon
                            size={13}
                            className="shrink-0 text-muted-foreground"
                            aria-label={t('admin.settings.backup.files.encrypted')}
                          />
                        </span>
                      )}
                      {/* break-all: the hex + `.enc` tail has no wrap points — without it the cell's min-content overflows the card. */}
                      <span className="break-all">{file.fileName}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatBytes(file.size, { locale })}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatBackupTimestamp(file.lastModified, { locale, timeZone })}
                  </td>
                  <td className="px-4 py-2 text-right" aria-label={t('admin.settings.backup.files.column.actions')}>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(`/api/admin/backup/download/${encodeURIComponent(file.key)}`)}
                      >
                        {t('admin.settings.backup.files.download')}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive-soft"
                        size="sm"
                        disabled={restorePending}
                        onClick={() => onRestore(file.key)}
                      >
                        {t('admin.settings.backup.files.restore')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deletePending}
                        onClick={() =>
                          setConfirm({
                            title: t('admin.settings.backup.files.deleteTitle', { name: file.fileName }),
                            description: t('admin.settings.backup.files.deleteDescription'),
                            actionLabel: t('common.action.delete'),
                            destructive: true,
                            onConfirm: () => onDelete(file.key),
                          })
                        }
                      >
                        {t('common.action.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {backups.length > 0 && hasMore && (
        <div className="flex items-center justify-between px-1 py-2">
          <span className="text-xs text-muted-foreground">
            {t('admin.settings.backup.files.showing', { count: backups.length })}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={isLoadingMore} onClick={() => onLoadMore()}>
            {isLoadingMore ? t('admin.settings.backup.files.loadingMore') : t('admin.settings.backup.files.loadMore')}
          </Button>
        </div>
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      <AlertDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && !isCreating) {
            setCreateOpen(false)
            setCreatePassword('')
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.settings.backup.files.createTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {encryptionEnabled
                ? t('admin.settings.backup.files.createEncryptedDescription')
                : t('admin.settings.backup.files.createDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!isCreating) {
                const password = createPassword.trim()
                onCreate(password === '' ? undefined : password)
                setCreateOpen(false)
                setCreatePassword('')
              }
            }}
          >
            <Input
              type="password"
              autoComplete="off"
              placeholder={
                encryptionEnabled
                  ? t('admin.settings.backup.files.oncePassword')
                  : t('admin.settings.backup.files.oncePasswordUnencrypted')
              }
              value={createPassword}
              disabled={isCreating}
              onChange={(event) => setCreatePassword(event.target.value)}
            />
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel disabled={isCreating}>{t('common.action.cancel')}</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={isCreating}>
                {isCreating ? t('admin.settings.backup.files.creating') : t('admin.settings.backup.files.start')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </SettingGroup>
  )
}
