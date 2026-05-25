import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Controller, useFieldArray } from 'react-hook-form'

import type { CorsSettings } from '@/shared/config/blog'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingValue } from '@/ui/admin/settings/shell/SettingValue'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { FieldLabel } from '@/ui/components/field'
import { Input } from '@/ui/components/input'
import { Switch } from '@/ui/components/switch'

function makeCorsClientId(): string {
  return crypto.randomUUID()
}

interface OriginRow {
  clientId: string
  url: string
}

interface CorsFormProps {
  cors: CorsSettings
}

const MAX_ORIGINS = 20

function CorsPolicyCard({ cors }: CorsFormProps) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<
    CorsSettings,
    { enabled: boolean; origins: OriginRow[] }
  >({
    section: 'cors',
    source: cors,
    toState: (source) => ({
      enabled: source.cors.enabled,
      origins: source.cors.origins.map((url, i) => ({ clientId: `cors-origin-${i}`, url })),
    }),
    fromState: (state) => ({
      cors: {
        enabled: state.enabled,
        origins: state.origins.map((row) => row.url.trim()).filter((url) => url !== ''),
      },
    }),
  })

  const rows = useFieldArray({ control: form.control, name: 'origins' })

  return (
    <SettingGroup
      title="CORS 策略"
      description="跨域资源共享配置。启用后，允许指定的外部域名通过浏览器直接访问站点资源。列表为空时将镜像请求来源（适用于开发环境）。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow label="启用 CORS" hint="关闭时，所有跨域请求将被浏览器拒绝。">
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <Switch id="cors-enabled" checked={field.value} onCheckedChange={field.onChange} />
                  <FieldLabel htmlFor="cors-enabled" className="font-normal">
                    {field.value ? '已开启' : '已关闭'}
                  </FieldLabel>
                </div>
              )}
            />
          </SettingsRow>
          <SettingsRow
            label="允许的来源"
            hint={`每个来源必须是完整的 URL（如 https://example.com），最多 ${MAX_ORIGINS} 条。留空表示镜像模式。`}
          >
            <div className="flex flex-col gap-3">
              {rows.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">镜像模式：将自动允许所有请求来源。</p>
              ) : (
                rows.fields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <Input
                      type="url"
                      placeholder="https://example.com"
                      maxLength={253}
                      className="flex-1"
                      {...form.register(`origins.${index}.url` as const)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => rows.remove(index)}
                      aria-label="删除此项"
                    >
                      <Trash2Icon className="text-destructive" />
                    </Button>
                  </div>
                ))
              )}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rows.fields.length >= MAX_ORIGINS}
                  onClick={() => rows.append({ clientId: makeCorsClientId(), url: '' })}
                >
                  <PlusIcon /> 添加来源
                </Button>
                {rows.fields.length >= MAX_ORIGINS && (
                  <span className="ml-2 text-xs text-muted-foreground">上限 {MAX_ORIGINS} 条</span>
                )}
              </div>
            </div>
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue label="CORS 状态" value={display.cors.enabled ? '已开启' : '已关闭'} />
          <SettingValue
            label="允许的来源"
            value={
              display.cors.origins.length === 0
                ? '镜像模式（允许所有来源）'
                : display.cors.origins.length === 1
                  ? display.cors.origins[0]
                  : `${display.cors.origins.length} 个来源`
            }
          />
          {display.cors.origins.length > 1 &&
            display.cors.origins.map((url, i) => <SettingValue key={url} label={`来源 ${i + 1}`} value={url} />)}
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

export function CorsForm({ cors }: CorsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <CorsPolicyCard cors={cors} />
    </div>
  )
}
