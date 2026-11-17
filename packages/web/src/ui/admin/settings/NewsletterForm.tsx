import type { NewsletterSettings } from '@kobato/shared/config/types.ts'

import { Controller } from 'react-hook-form'

import { FieldLabel } from '../../components/field'
import { useI18n } from '../../lib/I18nProvider'
import { SettingsRow } from './SettingsSection'
import { SettingGroup } from './shell/SettingGroup'
import { SettingGroupContent } from './shell/SettingGroupContent'
import { SettingsInput } from './shell/SettingsInput'
import { SettingsSwitch } from './shell/SettingsSwitch'
import { useSettingsCard } from './shell/useSettingsCard'

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
