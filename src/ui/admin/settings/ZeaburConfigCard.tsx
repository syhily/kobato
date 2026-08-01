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

export function ZeaburConfigCard({ mail }: { mail: MailLoaderShape }) {
  const { form, flushOnBlur, settingGroupProps, display } = useSettingsCard<
    MailLoaderShape,
    { host: string; apiKey: string }
  >({
    section: 'mail',
    source: mail,
    toState: (source) => ({
      host: source.mail.host,
      apiKey: '',
    }),
    fromState: (state) => ({
      mail: {
        host: state.host.trim(),
        ...secretFieldPatch(state.apiKey, 'apiKey'),
      },
    }),
  })

  const apiKeyField = secretFieldStrings({
    mask: display.mail.apiKeyMask,
    keepLabel: '保留现有 Key',
    emptyHint: '尚未配置。在 Zeabur 控制台 ZSend 服务页面生成的密钥。',
    emptyPlaceholder: '粘贴 Zeabur ZSend API Key',
  })
  return (
    <SettingGroup
      title="Zeabur ZSend 配置"
      description="配置 Zeabur ZSend 的接入地址和 API Key。修改后立即生效。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="接入域名" htmlFor="mail-host" hint="不带协议，例如 api.zeabur.com。">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="mail-host"
            placeholder="api.zeabur.com"
            maxLength={253}
            {...form.register('host')}
          />
        </SettingsRow>
        <SettingsRow label="API Key" htmlFor="mail-api-key" hint={apiKeyField.hint}>
          <SettingsSecretInput
            flushOnBlur={flushOnBlur}
            id="mail-api-key"
            placeholder={apiKeyField.placeholder}
            {...form.register('apiKey')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
