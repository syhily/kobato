import { useCallback } from 'react'
import { Controller } from 'react-hook-form'

import type { MailLoaderShape } from '@/shared/config/projection'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

const TRANSPORT_OPTIONS: { value: MailLoaderShape['mail']['transport']; label: string }[] = [
  { value: 'zeabur', label: 'Zeabur ZSend' },
  { value: 'smtp', label: 'SMTP' },
  { value: 'mailgun', label: 'Mailgun' },
]

export function ProviderSelectCard({
  mail,
  onTransportSaved,
}: {
  mail: MailLoaderShape
  onTransportSaved: (transport: MailLoaderShape['mail']['transport']) => void
}) {
  const { form, settingGroupProps, save } = useSettingsCard<
    MailLoaderShape,
    { transport: MailLoaderShape['mail']['transport'] }
  >({
    section: 'mail',
    source: mail,
    toState: (source) => ({ transport: source.mail.transport }),
    fromState: (state) => ({
      mail: { transport: state.transport },
    }),
    onSaved: useCallback((section: MailLoaderShape) => onTransportSaved(section.mail.transport), [onTransportSaved]),
  })

  return (
    <SettingGroup
      title="邮件服务提供商"
      description="选择发送邮件所用的服务商。切换后下方的配置项会相应变化。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label="提供商"
          htmlFor="mail-transport"
          hint="Zeabur ZSend 适合 Zeabur 部署，SMTP 适合自有邮件服务器。"
        >
          <Controller
            control={form.control}
            name="transport"
            render={({ field }) => (
              <SettingsSelect
                name={field.name}
                value={field.value}
                save={save}
                onValueChange={(value) => {
                  if (value === 'zeabur' || value === 'smtp' || value === 'mailgun') {
                    field.onChange(value)
                  }
                }}
              >
                <SelectTrigger id="mail-transport" className="w-full sm:w-56">
                  <SelectValue placeholder="选择提供商">
                    {(value: MailLoaderShape['mail']['transport'] | null) =>
                      TRANSPORT_OPTIONS.find((option) => option.value === value)?.label ?? value ?? ''
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TRANSPORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SettingsSelect>
            )}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
