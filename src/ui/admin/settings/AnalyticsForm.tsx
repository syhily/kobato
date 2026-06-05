import { UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Controller } from 'react-hook-form'
import { toast } from 'sonner'

import type { AnalyticsSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { FieldLabel } from '@/ui/components/field'
import { Switch } from '@/ui/components/switch'

interface AnalyticsFormProps {
  analytics: AnalyticsSettings
}

async function uploadMaxMind(file: File): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/admin/maxmind/upload', { method: 'POST', body: formData })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(data?.error?.message ?? `上传失败 (${res.status})`)
  }
}

function MaxMindUploadRow() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileChange = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.mmdb')) {
      toast.error('文件类型错误', { description: '仅支持 .mmdb 格式的 MaxMind 数据库文件' })
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error('文件过大', { description: 'MaxMind 数据库文件大小上限为 100 MB' })
      return
    }
    setUploading(true)
    try {
      await uploadMaxMind(file)
      toast.success('MaxMind 数据库已上传')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

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
            void handleFileChange(f)
          }
          e.target.value = ''
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon data-icon="sm" />
        {uploading ? '上传中…' : '上传 GeoLite2-City.mmdb'}
      </Button>
      <span className="text-sm text-muted-foreground">上传后 GeoIP 解析自动生效，无需重启服务</span>
    </div>
  )
}

export function AnalyticsForm({ analytics }: AnalyticsFormProps) {
  const { form, settingGroupProps, save } = useSettingsCard<
    AnalyticsSettings,
    { trackAdmin: boolean; keepBotRows: boolean }
  >({
    section: 'analytics',
    source: analytics,
    toState: (source) => ({
      trackAdmin: source.analytics.trackAdmin,
      keepBotRows: source.analytics.keepBotRows,
    }),
    fromState: (state) => ({
      analytics: { trackAdmin: state.trackAdmin, keepBotRows: state.keepBotRows },
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
                  <Switch
                    id="analytics-track-admin"
                    checked={field.value}
                    onCheckedChange={(val) => {
                      field.onChange(val)
                      save()
                    }}
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
                  <Switch
                    id="analytics-keep-bot-rows"
                    checked={field.value}
                    onCheckedChange={(val) => {
                      field.onChange(val)
                      save()
                    }}
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

      <SettingGroup title="GeoIP 数据库" description="上传 MaxMind GeoLite2-City 数据库以启用访问者的地理位置解析。">
        <SettingGroupContent>
          <SettingsRow label="GeoLite2-City.mmdb">
            <MaxMindUploadRow />
          </SettingsRow>
        </SettingGroupContent>
      </SettingGroup>
    </div>
  )
}
