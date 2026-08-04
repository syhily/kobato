import type { MailLoaderShape } from '@kobato/shared/config/projection'

import { SettingsRow } from '@kobato/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@kobato/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@kobato/ui/admin/settings/shell/SettingsInput'
import {
  SettingsSecretInput,
  secretFieldPatch,
  secretFieldStrings,
} from '@kobato/ui/admin/settings/shell/SettingsSecretInput'
import { SettingsSwitch } from '@kobato/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@kobato/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@kobato/ui/components/field'
import { Controller } from 'react-hook-form'

export function SmtpConfigCard({ mail }: { mail: MailLoaderShape }) {
  const { form, flushOnBlur, settingGroupProps, display, save } = useSettingsCard<
    MailLoaderShape,
    {
      smtpHost: string
      smtpPort: number
      smtpUser: string
      smtpPass: string
      smtpSecure: boolean
      smtpRequireTls: boolean
      smtpRejectUnauthorized: boolean
    }
  >({
    section: 'mail',
    source: mail,
    toState: (source) => ({
      smtpHost: source.mail.smtpHost,
      smtpPort: source.mail.smtpPort,
      smtpUser: source.mail.smtpUser,
      smtpPass: '',
      smtpSecure: source.mail.smtpSecure,
      smtpRequireTls: source.mail.smtpRequireTls,
      smtpRejectUnauthorized: source.mail.smtpRejectUnauthorized,
    }),
    fromState: (state) => ({
      mail: {
        smtpHost: state.smtpHost.trim(),
        smtpPort: Number.isFinite(state.smtpPort) ? state.smtpPort : 587,
        smtpUser: state.smtpUser.trim(),
        smtpSecure: state.smtpSecure,
        smtpRequireTls: state.smtpRequireTls,
        smtpRejectUnauthorized: state.smtpRejectUnauthorized,
        ...secretFieldPatch(state.smtpPass, 'smtpPass'),
      },
    }),
  })

  const smtpPassField = secretFieldStrings({
    mask: display.mail.smtpPassMask,
    keepLabel: '保留现有密码',
    emptyHint: '尚未配置。',
    emptyPlaceholder: '输入 SMTP 密码',
  })
  return (
    <SettingGroup
      title="SMTP 配置"
      description="配置 SMTP 服务器地址、端口和认证信息。修改后立即生效。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="服务器地址" htmlFor="mail-smtp-host" hint="例如 smtp.example.com。">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="mail-smtp-host"
            placeholder="smtp.example.com"
            maxLength={253}
            {...form.register('smtpHost')}
          />
        </SettingsRow>
        <SettingsRow label="端口" htmlFor="mail-smtp-port" hint="常见端口：25、587、465。">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="mail-smtp-port"
            type="number"
            min={1}
            max={65535}
            {...form.register('smtpPort', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow label="用户名" htmlFor="mail-smtp-user" hint="SMTP 登录账号，通常是一个邮箱地址。">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="mail-smtp-user"
            type="text"
            placeholder="postmaster@example.com"
            maxLength={512}
            {...form.register('smtpUser')}
          />
        </SettingsRow>
        <SettingsRow label="密码" htmlFor="mail-smtp-pass" hint={smtpPassField.hint}>
          <SettingsSecretInput
            flushOnBlur={flushOnBlur}
            id="mail-smtp-pass"
            placeholder={smtpPassField.placeholder}
            {...form.register('smtpPass')}
          />
        </SettingsRow>
        <SettingsRow label="使用 TLS" hint="465 端口通常需要开启，587 端口视服务器配置而定。">
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="smtpSecure"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="mail-smtp-secure"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="mail-smtp-secure" className="font-normal">
              启用 TLS（SSL）
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow label="要求 TLS" hint="强制 STARTTLS，拒绝明文发送。建议保持开启。">
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="smtpRequireTls"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="mail-smtp-require-tls"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="mail-smtp-require-tls" className="font-normal">
              强制 TLS（requireTLS）
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow
          label="验证证书"
          hint="验证 SMTP 服务器 TLS 证书。关闭后可能遭受中间人攻击，仅用于自签名证书调试。"
        >
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="smtpRejectUnauthorized"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="mail-smtp-reject-unauthorized"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="mail-smtp-reject-unauthorized" className="font-normal">
              验证 TLS 证书
            </FieldLabel>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
