import { Controller } from 'react-hook-form'

import type { NewsletterSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { useI18n } from '@/ui/lib/I18nProvider'

interface NewsletterFormProps {
  newsletter: NewsletterSettings
}

interface FormState {
  enabled: boolean
  fromName: string
  subjectPrefix: string
}

export function NewsletterForm({ newsletter }: NewsletterFormProps) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps, save } = useSettingsCard<NewsletterSettings, FormState>({
    section: 'newsletter',
    source: newsletter,
    toState: (source) => ({
      enabled: source.newsletter.enabled,
      fromName: source.newsletter.fromName,
      subjectPrefix: source.newsletter.subjectPrefix,
    }),
    fromState: (state) => ({
      newsletter: { enabled: state.enabled, fromName: state.fromName, subjectPrefix: state.subjectPrefix },
    }),
  })

  return (
    <div className="flex flex-col gap-5">
      <SettingGroup
        title={t('admin.settings.newsletter.title')}
        description={t('admin.settings.newsletter.description')}
        {...settingGroupProps}
      >
        <SettingGroupContent>
          <SettingsRow label={t('admin.settings.newsletter.enabled')} hint={t('admin.settings.newsletter.enabledHint')}>
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <SettingsSwitch
                    name={field.name}
                    id="newsletter-enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    save={save}
                  />
                  <FieldLabel htmlFor="newsletter-enabled" className="font-normal">
                    {field.value ? t('admin.settings.shared.toggle.on') : t('admin.settings.shared.toggle.off')}
                  </FieldLabel>
                </div>
              )}
            />
          </SettingsRow>
          <SettingsRow
            label={t('admin.settings.newsletter.fromName')}
            htmlFor="newsletter-from-name"
            hint={t('admin.settings.newsletter.fromNameHint')}
          >
            <SettingsInput
              flushOnBlur={flushOnBlur}
              id="newsletter-from-name"
              maxLength={80}
              {...form.register('fromName')}
            />
          </SettingsRow>
          <SettingsRow
            label={t('admin.settings.newsletter.subjectPrefix')}
            htmlFor="newsletter-subject-prefix"
            hint={t('admin.settings.newsletter.subjectPrefixHint')}
          >
            <SettingsInput
              flushOnBlur={flushOnBlur}
              id="newsletter-subject-prefix"
              maxLength={80}
              {...form.register('subjectPrefix')}
            />
          </SettingsRow>
        </SettingGroupContent>
      </SettingGroup>
    </div>
  )
}
