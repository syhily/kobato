import type { SecuritySettings } from '@kobato/shared/config/types'

import { useSiteIdentity } from '@kobato/shared/lib/blog-config-context'
import { isValidPasskeyDomain } from '@kobato/shared/utils/safe-url'
import { SettingsRow } from '@kobato/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@kobato/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@kobato/ui/admin/settings/shell/SettingsInput'
import { SettingsSwitch } from '@kobato/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@kobato/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@kobato/ui/components/button'
import { FieldLabel } from '@kobato/ui/components/field'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Controller, useFieldArray } from 'react-hook-form'

interface ExemptPathRow {
  clientId: string
  path: string
}

interface OriginRow {
  clientId: string
  url: string
}

interface SecurityFormProps {
  security: SecuritySettings
}

const MAX_EXEMPT_PATHS = 20
const MAX_ORIGINS = 20

function CsrfToggleCard({ security }: { security: SecuritySettings }) {
  const { form, settingGroupProps, save } = useSettingsCard<SecuritySettings, { enabled: boolean }>({
    section: 'security',
    source: security,
    toState: (source) => ({ enabled: source.csrf.enabled }),
    fromState: (state) => ({
      csrf: { enabled: state.enabled },
    }),
  })

  return (
    <SettingGroup
      title="CSRF 防护"
      description="跨站请求伪造保护。所有 /rpc/* 端点要求请求头携带有效的 X-CSRF-Token。关闭后任何请求均不验证令牌，仅建议在调试或特殊部署场景下关闭。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="启用 CSRF 防护" hint="关闭后所有 API 调用将跳过令牌验证。">
          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="csrf-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
                <FieldLabel htmlFor="csrf-enabled" className="font-normal">
                  {field.value ? '已开启' : '已关闭'}
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function CsrfExemptPathsCard({ security }: { security: SecuritySettings }) {
  const { form, settingGroupProps, flushOnBlur } = useSettingsCard<SecuritySettings, { exemptPaths: ExemptPathRow[] }>({
    section: 'security',
    source: security,
    toState: (source) => ({
      exemptPaths: source.csrf.exemptPaths.map((path, i) => ({ clientId: `csrf-exempt-${i}`, path })),
    }),
    fromState: (state) => ({
      csrf: {
        exemptPaths: state.exemptPaths.map((row) => row.path.trim()).filter((p) => p !== ''),
      },
    }),
  })

  const rows = useFieldArray({ control: form.control, name: 'exemptPaths' })

  return (
    <SettingGroup
      title="路径豁免"
      description="匹配这些前缀的请求将跳过 CSRF 验证。适用于 Webhook 回调或需要无令牌访问的特定端点；/rpc 与 /api 前缀不可豁免。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="豁免路径" hint={`输入路径前缀（如 /webhook/github），最多 ${MAX_EXEMPT_PATHS} 条。`}>
          <div className="flex flex-col gap-3">
            {rows.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">无豁免路径。所有请求均需携带令牌。</p>
            ) : (
              rows.fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <SettingsInput
                    flushOnBlur={flushOnBlur}
                    type="text"
                    placeholder="/webhook/github"
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
    </SettingGroup>
  )
}

function CorsPolicyCard({ security }: { security: SecuritySettings }) {
  const { form, settingGroupProps, save, flushOnBlur } = useSettingsCard<
    SecuritySettings,
    { enabled: boolean; origins: OriginRow[] }
  >({
    section: 'security',
    source: security,
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
      <SettingGroupContent>
        <SettingsRow label="启用 CORS" hint="关闭时，所有跨域请求将被浏览器拒绝。">
          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="cors-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
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
          <p className="rounded-md border border-status-warn-border bg-status-warn-bg px-3 py-2 text-sm text-status-warn-fg">
            安全提示：当前 CORS 配置允许携带身份凭证（cookies）。添加不可信的第三方来源可能导致会话劫持或 CSRF
            攻击，请仅添加受信任的域名。
          </p>
          <div className="flex flex-col gap-3">
            {rows.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">镜像模式：将自动允许所有请求来源。</p>
            ) : (
              rows.fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <SettingsInput
                    flushOnBlur={flushOnBlur}
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
                onClick={() => rows.append({ clientId: crypto.randomUUID(), url: '' })}
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
    </SettingGroup>
  )
}

function PasskeyToggleCard({ security }: { security: SecuritySettings }) {
  const siteIdentity = useSiteIdentity()
  const website = siteIdentity?.website ?? ''
  const domainValid = isValidPasskeyDomain(website)

  const { form, settingGroupProps, save } = useSettingsCard<SecuritySettings, { enabled: boolean }>({
    section: 'security',
    source: security,
    toState: (source) => ({ enabled: source.passkey?.enabled ?? false }),
    fromState: (state) => ({
      passkey: { enabled: state.enabled },
    }),
  })

  return (
    <SettingGroup
      title="Passkey 登录"
      description="开启后，用户可以使用 Passkey（指纹、面容识别、硬件密钥等）进行免密登录。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label="启用 Passkey 登录"
          hint={
            domainValid
              ? '开启后用户可在个人资料中注册 Passkey。'
              : '开启 Passkey 需要站点使用公开可访问的 HTTPS 域名。'
          }
        >
          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="passkey-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                  disabled={!domainValid && !field.value}
                />
                <FieldLabel htmlFor="passkey-enabled" className="font-normal">
                  {field.value ? '已开启' : '已关闭'}
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>
        {!domainValid && (
          <p className="text-sm text-muted-foreground">
            当前站点域名不满足 Passkey 要求（需要公开 HTTPS 域名，不能使用 localhost 或 IP 地址）。
          </p>
        )}
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function SecurityForm({ security }: SecurityFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <CsrfToggleCard security={security} />
      <CsrfExemptPathsCard security={security} />
      <CorsPolicyCard security={security} />
      <PasskeyToggleCard security={security} />
    </div>
  )
}
