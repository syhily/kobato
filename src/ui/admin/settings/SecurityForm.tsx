import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Controller, useFieldArray } from 'react-hook-form'

import type { SecuritySettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingValue } from '@/ui/admin/settings/shell/SettingValue'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { FieldLabel } from '@/ui/components/field'
import { Input } from '@/ui/components/input'
import { Switch } from '@/ui/components/switch'

interface ExemptPathRow {
  clientId: string
  path: string
}

interface SecurityFormProps {
  security: SecuritySettings
}

const MAX_EXEMPT_PATHS = 20

function CsrfToggleCard({ security }: SecurityFormProps) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<SecuritySettings, { enabled: boolean }>({
    section: 'security',
    source: security,
    toState: (source) => ({ enabled: source.csrf.enabled }),
    fromState: (state) => ({ csrf: { ...security.csrf, enabled: state.enabled } }),
  })

  return (
    <SettingGroup
      title="CSRF 防护"
      description="跨站请求伪造保护。所有 /rpc/* 端点要求请求头携带有效的 X-CSRF-Token。关闭后任何请求均不验证令牌，仅建议在调试或特殊部署场景下关闭。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow label="启用 CSRF 防护" hint="关闭后所有 API 调用将跳过令牌验证。">
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <Switch id="csrf-enabled" checked={field.value} onCheckedChange={field.onChange} />
                  <FieldLabel htmlFor="csrf-enabled" className="font-normal">
                    {field.value ? '已开启' : '已关闭'}
                  </FieldLabel>
                </div>
              )}
            />
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue label="CSRF 状态" value={display.csrf.enabled ? '已开启' : '已关闭'} />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

function CsrfExemptPathsCard({ security }: SecurityFormProps) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<
    SecuritySettings,
    { exemptPaths: ExemptPathRow[] }
  >({
    section: 'security',
    source: security,
    toState: (source) => ({
      exemptPaths: source.csrf.exemptPaths.map((path, i) => ({ clientId: `csrf-exempt-${i}`, path })),
    }),
    fromState: (state) => ({
      csrf: {
        ...security.csrf,
        exemptPaths: state.exemptPaths.map((row) => row.path.trim()).filter((p) => p !== ''),
      },
    }),
  })

  const rows = useFieldArray({ control: form.control, name: 'exemptPaths' })

  return (
    <SettingGroup
      title="路径豁免"
      description="匹配这些前缀的 /rpc/* 路径将跳过 CSRF 验证。适用于 Webhook 回调或需要无令牌访问的特定端点。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow label="豁免路径" hint={`输入路径前缀（如 /rpc/public.comments），最多 ${MAX_EXEMPT_PATHS} 条。`}>
            <div className="flex flex-col gap-3">
              {rows.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">无豁免路径。所有 /rpc/* 请求均需携带令牌。</p>
              ) : (
                rows.fields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <Input
                      type="text"
                      placeholder="/rpc/public.comments"
                      className="flex-1"
                      {...form.register(`exemptPaths.${index}.path` as const)}
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
                  disabled={rows.fields.length >= MAX_EXEMPT_PATHS}
                  onClick={() => rows.append({ clientId: crypto.randomUUID(), path: '' })}
                >
                  <PlusIcon /> 添加路径
                </Button>
                {rows.fields.length >= MAX_EXEMPT_PATHS && (
                  <span className="ml-2 text-xs text-muted-foreground">上限 {MAX_EXEMPT_PATHS} 条</span>
                )}
              </div>
            </div>
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue
            label="豁免路径"
            value={
              display.csrf.exemptPaths.length === 0
                ? '无'
                : display.csrf.exemptPaths.length === 1
                  ? display.csrf.exemptPaths[0]
                  : `${display.csrf.exemptPaths.length} 条路径`
            }
          />
          {display.csrf.exemptPaths.length > 1 &&
            display.csrf.exemptPaths.map((path, i) => <SettingValue key={path} label={`路径 ${i + 1}`} value={path} />)}
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

export function SecurityForm({ security }: SecurityFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <CsrfToggleCard security={security} />
      <CsrfExemptPathsCard security={security} />
    </div>
  )
}
