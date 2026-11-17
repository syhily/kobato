import type { WebmentionsSettings } from '@kobato/shared/config/types.ts'

import { Controller } from 'react-hook-form'

import { FieldLabel } from '../../components/field'
import { useI18n } from '../../lib/I18nProvider'
import { SettingsRow } from './SettingsSection'
import { SettingGroup } from './shell/SettingGroup'
import { SettingGroupContent } from './shell/SettingGroupContent'
import { SettingsSwitch } from './shell/SettingsSwitch'
import { useSettingsCard } from './shell/useSettingsCard'

interface WebmentionsFormProps {
  webmentions: WebmentionsSettings
}

function WebmentionReceiveCard({ webmentions }: WebmentionsFormProps) {
  const { t } = useI18n()
  const { form, settingGroupProps, save } = useSettingsCard<WebmentionsSettings, { receiveEnabled: boolean }>({
    section: 'webmentions',
    source: webmentions,
    toState: (source) => ({ receiveEnabled: source.webmention.receiveEnabled }),
    fromState: (state) => ({
      webmention: { receiveEnabled: state.receiveEnabled },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.webmentions.receive.title')}
      description={t('admin.settings.webmentions.receive.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.webmentions.receive.enable')}
          hint={t('admin.settings.webmentions.receive.enableHint')}
        >
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="receiveEnabled"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="webmention-receive-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="webmention-receive-enabled" className="font-normal">
              {t('admin.settings.webmentions.receive.label')}
            </FieldLabel>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function WebmentionDisplayCard({ webmentions }: WebmentionsFormProps) {
  const { t } = useI18n()
  const { form, settingGroupProps, save } = useSettingsCard<WebmentionsSettings, { displayOnPosts: boolean }>({
    section: 'webmentions',
    source: webmentions,
    toState: (source) => ({ displayOnPosts: source.webmention.displayOnPosts }),
    fromState: (state) => ({
      webmention: { displayOnPosts: state.displayOnPosts },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.webmentions.display.title')}
      description={t('admin.settings.webmentions.display.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.webmentions.display.enable')}
          hint={t('admin.settings.webmentions.display.enableHint')}
        >
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="displayOnPosts"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="webmention-display-on-posts"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="webmention-display-on-posts" className="font-normal">
              {t('admin.settings.webmentions.display.label')}
            </FieldLabel>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function WebmentionsForm({ webmentions }: WebmentionsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <WebmentionReceiveCard webmentions={webmentions} />
      <WebmentionDisplayCard webmentions={webmentions} />
    </div>
  )
}
