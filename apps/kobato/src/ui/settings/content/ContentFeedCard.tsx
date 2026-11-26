import type { ContentSettings } from '@kobato/settings/types'

import { FieldLabel } from '@kobato/ui/components/field'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { Controller } from 'react-hook-form'

import { SettingsRow } from '@/ui/settings/SettingsSection'
import { SettingGroup } from '@/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/settings/shell/SettingsInput'
import { SettingsSwitch } from '@/ui/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/settings/shell/use-settings-card'

export function ContentFeedCard({ content }: { content: ContentSettings }) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps, save } = useSettingsCard<
    ContentSettings,
    { feedFull: boolean; feedSize: number }
  >({
    section: 'content',
    source: content,
    toState: (source) => ({
      feedFull: source.feed.full,
      feedSize: source.feed.size,
    }),
    fromState: (state) => ({
      feed: { full: state.feedFull, size: state.feedSize },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.content.feed.title')}
      description={t('admin.settings.content.feed.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.content.feed.full')} hint={t('admin.settings.content.feed.fullHint')}>
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="feedFull"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="content-feed-full"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="content-feed-full" className="font-normal">
              {t('admin.settings.content.feed.fullLabel')}
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow label={t('admin.settings.content.feed.size')} htmlFor="content-feed-size">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="content-feed-size"
            type="number"
            min={1}
            max={100}
            {...form.register('feedSize', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
