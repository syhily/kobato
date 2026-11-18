import type { MailLoaderShape } from '@kobato/settings/projection.ts'

import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kobato/ui/components/select.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection.tsx'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup.tsx'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent.tsx'
import { SettingsSelect } from '@kobato/web-admin/ui/settings/shell/SettingsSelect.tsx'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/useSettingsCard.tsx'
import { useCallback } from 'react'
import { Controller } from 'react-hook-form'

const TRANSPORT_OPTIONS: { value: MailLoaderShape['mail']['transport']; label: string }[] = [
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
  const { t } = useI18n()
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
      title={t('admin.settings.mail.provider.title')}
      description={t('admin.settings.mail.provider.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.mail.provider.label')}
          htmlFor="mail-transport"
          hint={t('admin.settings.mail.provider.hint')}
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
                  if (value === 'smtp' || value === 'mailgun') {
                    field.onChange(value)
                  }
                }}
              >
                <SelectTrigger id="mail-transport" className="w-full sm:w-56">
                  <SelectValue placeholder={t('admin.settings.mail.provider.placeholder')}>
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
