import type { ContentSettings } from '@kobato/settings/types.ts'

import { DEFAULT_FOOTNOTES_SECTION_TITLE } from '@kobato/settings/presentation.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection.tsx'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup.tsx'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent.tsx'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput.tsx'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card.tsx'

export function ContentFootnotesCard({ content }: { content: ContentSettings }) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<ContentSettings, { footnotesSectionTitle: string }>({
    section: 'content',
    source: content,
    toState: (source) => ({
      footnotesSectionTitle: source.footnotes?.sectionTitle ?? DEFAULT_FOOTNOTES_SECTION_TITLE,
    }),
    fromState: (state) => ({
      footnotes: { sectionTitle: state.footnotesSectionTitle.trim() || DEFAULT_FOOTNOTES_SECTION_TITLE },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.content.footnotes.title')}
      description={t('admin.settings.content.footnotes.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.content.footnotes.label')} htmlFor="content-footnotes-section-title">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="content-footnotes-section-title"
            type="text"
            maxLength={120}
            {...form.register('footnotesSectionTitle')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
