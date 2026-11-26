import type { NewsletterSettings } from '@kobato/settings/types'

import { FieldLabel } from '@kobato/ui/components/field'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { Controller } from 'react-hook-form'

import { SettingsRow } from '@/ui/settings/SettingsSection'
import { SettingGroup } from '@/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/settings/shell/SettingsInput'
import { SettingsSwitch } from '@/ui/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/settings/shell/use-settings-card'

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
