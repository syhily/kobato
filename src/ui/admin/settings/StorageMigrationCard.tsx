import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useRevalidator } from 'react-router'
import { toast } from 'sonner'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { toastApiError } from '@/client/lib/toast-api-error'
import { isStorageMigrationInFlightPhase } from '@/shared/contracts/storage'
import { formatBytes } from '@/shared/utils/formatter'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'

const PHASE_LABEL: Record<string, string> = {
  copying: '正在复制对象',
  switching: '正在切换存储配置',
  'catching-up': '正在追补切换期间的新对象',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断（可继续）',
}

const DIRECTION_LABEL: Record<string, string> = {
  'local-to-s3': '本地存储 → S3',
  's3-to-s3': 'S3 → 新的 S3',
  's3-to-local': 'S3 → 本地存储',
}

// Migration status + control. Not a settings form (no useSettingsCard): the
// migration task flips the storage config server-side, so completion
// revalidates the route loader to re-seed the sibling cards' source.
export function StorageMigrationCard() {
  const queryClient = useQueryClient()
  const revalidator = useRevalidator()
  const { t } = useI18n()
  const { data: status } = useQuery(
    orpcQuery.admin.storage.migrationStatus.queryOptions({
      input: {},
      refetchInterval: (query) => {
        const phase = query.state.data?.phase
        return phase !== undefined && isStorageMigrationInFlightPhase(phase) ? 1500 : false
      },
    }),
  )

  // One-shot completion notice + stats refresh + route-loader revalidation
  // (the flipped storage config / status card re-seed from the loader data).
  const completedRef = useRef<string | null>(null)
  useEffect(() => {
    if (status?.phase !== 'completed' || status.finishedAt === null) {
      return
    }
    if (completedRef.current === status.finishedAt) {
      return
    }
    completedRef.current = status.finishedAt
    toast.success('存储迁移已完成', {
      description: `复制 ${status.copiedObjects} 个对象（${formatBytes(status.copiedBytes)}），跳过 ${status.skippedObjects} 个已存在对象。`,
    })
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.storage.stats.key() })
    void revalidator.revalidate()
  }, [status, queryClient, revalidator])

  if (status == null || status.phase === 'idle') {
    return null
  }

  const inFlight = isStorageMigrationInFlightPhase(status.phase)
  const resumable = status.phase === 'failed' || status.phase === 'cancelled' || status.phase === 'interrupted'

  const invalidateStatus = () =>
    queryClient.invalidateQueries({ queryKey: orpcQuery.admin.storage.migrationStatus.key() })

  const handleCancel = async () => {
    try {
      await orpc.admin.storage.cancelMigration({})
      await invalidateStatus()
    } catch (error) {
      toastApiError(error, 'admin.toast.migrationCancelFailed', t)
    }
  }

  const handleResume = async () => {
    try {
      await orpc.admin.storage.resumeMigration({})
      await invalidateStatus()
    } catch (error) {
      toastApiError(error, 'admin.toast.migrationResumeFailed', t)
    }
  }

  return (
    <SettingGroup
      title="存储迁移"
      description="迁移把当前主存储中的全部对象复制到目标存储，完成后才切换配置；可取消、可从断点继续。"
      actions={
        inFlight ? (
          <Button variant="outline" size="sm" onClick={() => void handleCancel()}>
            取消迁移
          </Button>
        ) : resumable ? (
          <Button variant="outline" size="sm" onClick={() => void handleResume()}>
            从断点继续
          </Button>
        ) : null
      }
    >
      <SettingGroupContent>
        <SettingsRow label="方向">
          <p className="text-sm">
            {status.direction !== null ? (DIRECTION_LABEL[status.direction] ?? status.direction) : '—'}
            {status.target !== null && (
              <span className="ml-2 text-muted-foreground">
                {status.target.bucket} · {status.target.endpoint}
              </span>
            )}
          </p>
        </SettingsRow>
        <SettingsRow label="状态">
          <p className="flex items-center gap-2 text-sm">
            {inFlight && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
            {PHASE_LABEL[status.phase] ?? status.phase}
          </p>
        </SettingsRow>
        <SettingsRow label="进度">
          <p className="text-sm text-muted-foreground">
            已复制 {status.copiedObjects} 个对象（{formatBytes(status.copiedBytes)}），跳过 {status.skippedObjects} 个
          </p>
        </SettingsRow>
        {status.verification !== null && (
          <SettingsRow label="一致性校验">
            {status.verification.matches ? (
              <p className="text-sm text-muted-foreground">
                源 {status.verification.sourceCount} 个对象（{formatBytes(status.verification.sourceBytes)}） · 目标{' '}
                {status.verification.targetCount} 个对象（{formatBytes(status.verification.targetBytes)}） — 校验一致
              </p>
            ) : (
              <p className="text-sm text-destructive">
                校验不一致：源 {status.verification.sourceCount} 个对象（
                {formatBytes(status.verification.sourceBytes)}），目标只有 {status.verification.targetCount} 个对象（
                {formatBytes(status.verification.targetBytes)}
                ）——目标存储可能缺少对象。请检查目标 Bucket 内容；如需重试，请确认配置后重新发起一次新的迁移。
              </p>
            )}
          </SettingsRow>
        )}
        {status.error !== null && (
          <SettingsRow label="错误">
            <p className="text-sm text-destructive">{status.error}</p>
          </SettingsRow>
        )}
      </SettingGroupContent>
    </SettingGroup>
  )
}
