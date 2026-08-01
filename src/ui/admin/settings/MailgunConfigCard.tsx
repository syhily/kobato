import type { MailLoaderShape } from '@/shared/config/projection'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import {
  SettingsSecretInput,
  secretFieldPatch,
  secretFieldStrings,
} from '@/ui/admin/settings/shell/SettingsSecretInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'

export function MailgunConfigCard({ mail }: { mail: MailLoaderShape }) {
  const { form, flushOnBlur, settingGroupProps, display } = useSettingsCard<
    MailLoaderShape,
    { mailgunDomain: string; mailgunApiKey: string }
  >({
    section: 'mail',
    source: mail,
    toState: (source) => ({
      mailgunDomain: source.mail.mailgunDomain,
      mailgunApiKey: '',
    }),
    fromState: (state) => ({
      mail: {
        mailgunDomain: state.mailgunDomain.trim(),
        ...secretFieldPatch(state.mailgunApiKey, 'mailgunApiKey'),
      },
    }),
  })

  const mailgunApiKeyField = secretFieldStrings({
    mask: display.mail.mailgunApiKeyMask,
    keepLabel: '保留现有 Key',
    emptyHint: '尚未配置。在 Mailgun 控制台「Settings → API Keys」页面生成的私钥（key-... 或 MG_... 形式）。',
    emptyPlaceholder: '粘贴 Mailgun Private API Key',
  })
  return (
    <SettingGroup
      title="Mailgun 配置"
      description="配置 Mailgun 的发送域名和 API Key。修改后立即生效。仅支持美国（US）区域。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label="发送域名"
          htmlFor="mail-mailgun-domain"
          hint="在 Mailgun 控制台已验证的域名，例如 mg.example.com。"
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="mail-mailgun-domain"
            placeholder="mg.example.com"
            maxLength={253}
            {...form.register('mailgunDomain')}
          />
        </SettingsRow>
        <SettingsRow label="API Key" htmlFor="mail-mailgun-api-key" hint={mailgunApiKeyField.hint}>
          <SettingsSecretInput
            flushOnBlur={flushOnBlur}
            id="mail-mailgun-api-key"
            placeholder={mailgunApiKeyField.placeholder}
            {...form.register('mailgunApiKey')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
