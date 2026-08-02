import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { RefreshCwIcon, UploadIcon } from 'lucide-react'
import { useRef } from 'react'
import { Controller } from 'react-hook-form'
import { toast } from 'sonner'

import type { AnalyticsSettings } from '@/shared/config/types'

import { orpcQuery } from '@/client/api/orpc-query'
import { useFileUpload } from '@/client/hooks/use-file-upload'
import { toastApiError } from '@/client/lib/toast-api-error'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { FieldLabel } from '@/ui/components/field'

interface AnalyticsFormProps {
  analytics: AnalyticsSettings
}

interface GeoipStatus {
  installed: boolean
  version: string | null
  source: 'upload' | 'remote' | null
  updatedAt: string | null
}

function geoipStatusKey() {
  return orpcQuery.admin.geoip.status.key()
}

function MaxMindUploadRow() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { upload, pending } = useFileUpload({
    endpoint: '/api/admin/maxmind/upload',
    accept: ['.mmdb'],
    maxBytes: 100 * 1024 * 1024,
    messages: {
      invalidType: { title: '文件类型错误', description: '仅支持 .mmdb 格式的 MaxMind 数据库文件' },
      tooLarge: () => ({ title: '文件过大', description: 'MaxMind 数据库文件大小上限为 100 MB' }),
      success: 'MaxMind 数据库已上传',
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: geoipStatusKey() }),
  })

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mmdb"
        hidden
        aria-label="选择 MaxMind 数据库文件"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            void upload(f)
          }
          e.target.value = ''
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon data-icon="sm" />
        {pending ? '上传中…' : '上传 GeoLite2-City.mmdb'}
      </Button>
      <span className="text-sm text-muted-foreground">上传后 GeoIP 解析自动生效，无需重启服务</span>
    </div>
  )
}

function describeGeoipStatus(status: GeoipStatus | undefined): string {
  if (!status) {
    return '正在读取数据库状态…'
  }
  if (!status.installed) {
    return '尚未安装数据库，点击检查更新将自动下载最新版'
  }
  const version = status.version ?? '未知版本'
  const source = status.source === 'remote' ? '远程下载' : '本地上传'
  const updatedAt = status.updatedAt ? `，更新于 ${format(new Date(status.updatedAt), 'yyyy-MM-dd HH:mm')}` : ''
  return `当前版本 ${version}（${source}${updatedAt}）`
}

function MaxMindRemoteUpdateRow() {
  const queryClient = useQueryClient()
  const { data: status } = useQuery(orpcQuery.admin.geoip.status.queryOptions({ input: {} }))
  const updateMutation = useMutation({
    ...orpcQuery.admin.geoip.update.mutationOptions(),
    onSuccess: (result) => {
      if (result.status === 'updated') {
        toast.success(`GeoIP 数据库已更新至 ${result.version}`)
      } else {
        toast.success(`GeoIP 数据库已是最新版本（${result.version}）`)
      }
      void queryClient.invalidateQueries({ queryKey: geoipStatusKey() })
    },
    onError: (error) => toastApiError(error, 'GeoIP 更新失败'),
  })

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={updateMutation.isPending}
        onClick={() => updateMutation.mutate({})}
      >
        <RefreshCwIcon data-icon="sm" />
        {updateMutation.isPending ? '检查中…' : '检查并更新'}
      </Button>
      <span className="text-sm text-muted-foreground">{describeGeoipStatus(status)}</span>
    </div>
  )
}

export function AnalyticsForm({ analytics }: AnalyticsFormProps) {
  const { form, settingGroupProps, save } = useSettingsCard<
    AnalyticsSettings,
    { trackAdmin: boolean; keepBotRows: boolean; geoipAutoUpdate: boolean }
  >({
    section: 'analytics',
    source: analytics,
    toState: (source) => ({
      trackAdmin: source.analytics.trackAdmin,
      keepBotRows: source.analytics.keepBotRows,
      geoipAutoUpdate: source.analytics.geoipAutoUpdate,
    }),
    fromState: (state) => ({
      analytics: {
        trackAdmin: state.trackAdmin,
        keepBotRows: state.keepBotRows,
        geoipAutoUpdate: state.geoipAutoUpdate,
      },
    }),
  })

  return (
    <div className="flex flex-col gap-5">
      <SettingGroup title="采集与过滤策略" description="控制管理员访问及爬虫记录的采集行为。" {...settingGroupProps}>
        <SettingGroupContent>
          <SettingsRow label="记录管理员访问" hint="关闭时，管理员浏览首页和文章不会被写入 access_log。">
            <Controller
              control={form.control}
              name="trackAdmin"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <SettingsSwitch
                    name={field.name}
                    id="analytics-track-admin"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    save={save}
                  />
                  <FieldLabel htmlFor="analytics-track-admin" className="font-normal">
                    {field.value ? '已开启' : '已关闭'}
                  </FieldLabel>
                </div>
              )}
            />
          </SettingsRow>
          <SettingsRow label="保留爬虫记录" hint="默认会过滤机器人请求；开启后保留用于调试。">
            <Controller
              control={form.control}
              name="keepBotRows"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <SettingsSwitch
                    name={field.name}
                    id="analytics-keep-bot-rows"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    save={save}
                  />
                  <FieldLabel htmlFor="analytics-keep-bot-rows" className="font-normal">
                    {field.value ? '已开启' : '已关闭'}
                  </FieldLabel>
                </div>
              )}
            />
          </SettingsRow>
        </SettingGroupContent>
      </SettingGroup>

      <SettingGroup
        title="GeoIP 数据库"
        description="上传或远程下载 MaxMind GeoLite2-City 数据库以启用访问者的地理位置解析。"
      >
        <SettingGroupContent>
          <SettingsRow label="GeoLite2-City.mmdb">
            <MaxMindUploadRow />
          </SettingsRow>
          <SettingsRow
            label="远程更新"
            hint="从 jsDelivr CDN 检测并下载最新版 GeoLite2-City 数据库；本地上传的数据库将被远程版本替换。"
          >
            <MaxMindRemoteUpdateRow />
          </SettingsRow>
          <SettingsRow label="自动更新" hint="每天定时检测远程版本并在有更新时自动下载；不会覆盖手动上传的数据库。">
            <Controller
              control={form.control}
              name="geoipAutoUpdate"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <SettingsSwitch
                    name={field.name}
                    id="analytics-geoip-auto-update"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    save={save}
                  />
                  <FieldLabel htmlFor="analytics-geoip-auto-update" className="font-normal">
                    {field.value ? '已开启' : '已关闭'}
                  </FieldLabel>
                </div>
              )}
            />
          </SettingsRow>
        </SettingGroupContent>
      </SettingGroup>
    </div>
  )
}
