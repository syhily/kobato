import { Button } from '@/ui/components/button'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'

interface BackupFile {
  key: string
  fileName: string
  size: number
  lastModified: string
}

interface BackupFileListProps {
  backups: BackupFile[]
  canConfigure: boolean
  isCreating: boolean
  onCreate: () => void
  restorePending: boolean
  pgToolsAvailable: boolean
  onRestore: (key: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function BackupFileList({
  backups,
  canConfigure,
  isCreating,
  onCreate,
  restorePending,
  pgToolsAvailable,
  onRestore,
}: BackupFileListProps) {
  return (
    <SettingGroup
      title="备份文件"
      description="S3 存储中 backup/ 目录下的所有备份文件。"
      actions={
        <Button type="button" disabled={isCreating || !canConfigure} onClick={() => onCreate()}>
          {isCreating ? '备份中…' : '手动备份'}
        </Button>
      }
    >
      {backups.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无备份文件</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
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
                  <td className="px-4 py-2 font-mono text-xs">{file.fileName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatBytes(file.size)}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {file.lastModified.slice(0, 19).replace('T', ' ')}
                  </td>
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
                        disabled={restorePending || !pgToolsAvailable}
                        onClick={() => onRestore(file.key)}
                      >
                        还原
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingGroup>
  )
}
