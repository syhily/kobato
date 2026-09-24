import { LockIcon } from 'lucide-react'
import { useState } from 'react'

import type { BackupFileDto } from '@/shared/types/backup'

import { formatBytes } from '@/shared/utils/formatter'
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

function formatDateTime(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', { ...BASE_OPTS, timeZone }).format(new Date(iso))
  } catch {
    return new Intl.DateTimeFormat('zh-CN', BASE_OPTS).format(new Date(iso))
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
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createPassword, setCreatePassword] = useState('')
  return (
    <SettingGroup
      title="备份文件"
      description="S3 存储中 backup/ 目录下的所有备份文件。"
      actions={
        <Button type="button" disabled={isCreating} onClick={() => setCreateOpen(true)}>
          {isCreating ? '备份中…' : '手动备份'}
        </Button>
      }
    >
      {backups.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无备份文件</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">文件名</th>
                <th className="px-4 py-2 text-right font-medium">大小</th>
                <th className="px-4 py-2 text-left font-medium">时间</th>
                <th className="px-4 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {backups.map((file) => (
                <tr key={file.key}>
                  <td className="px-4 py-2 font-mono text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      {file.encrypted && (
                        <span title="该备份已加密，还原时需要备份密码">
                          <LockIcon size={13} className="shrink-0 text-muted-foreground" aria-label="已加密" />
                        </span>
                      )}
                      {file.fileName}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatBytes(file.size)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDateTime(file.lastModified, timeZone)}</td>
                  <td className="px-4 py-2 text-right" aria-label="操作">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(`/api/admin/backup/download/${encodeURIComponent(file.key)}`)}
                      >
                        下载
                      </Button>
                      <Button
                        type="button"
                        variant="destructive-soft"
                        size="sm"
                        disabled={restorePending}
                        onClick={() => onRestore(file.key)}
                      >
                        还原
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deletePending}
                        onClick={() =>
                          setConfirm({
                            title: `删除备份文件「${file.fileName}」？`,
                            description: '此操作会从 S3 永久删除该备份文件，无法撤销。',
                            actionLabel: '删除',
                            destructive: true,
                            onConfirm: () => onDelete(file.key),
                          })
                        }
                      >
                        删除
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
          <span className="text-xs text-muted-foreground">已展示 {backups.length} 个备份文件</span>
          <Button type="button" variant="outline" size="sm" disabled={isLoadingMore} onClick={() => onLoadMore()}>
            {isLoadingMore ? '加载中…' : '加载更多'}
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
            <AlertDialogTitle>手动备份</AlertDialogTitle>
            <AlertDialogDescription>
              {encryptionEnabled
                ? '将使用设置中的加密密码创建加密备份；也可以为本次备份单独指定密码。'
                : '创建一个包含内容数据库、访问统计与配置文件的备份归档。'}
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
              placeholder={encryptionEnabled ? '本次密码（留空使用默认）' : '本次加密密码（留空不加密）'}
              value={createPassword}
              disabled={isCreating}
              onChange={(event) => setCreatePassword(event.target.value)}
            />
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel disabled={isCreating}>取消</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={isCreating}>
                {isCreating ? '备份中…' : '开始备份'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </SettingGroup>
  )
}
