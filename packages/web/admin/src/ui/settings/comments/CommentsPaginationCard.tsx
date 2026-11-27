import type { CommentsLoaderShape } from '@kobato/settings/projection'

import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { type CommentsFormProps } from '@kobato/web-admin/ui/settings/comments/model'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card'

export function CommentsPaginationCard({ comments }: CommentsFormProps) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<CommentsLoaderShape, { size: number }>({
    section: 'comments',
    source: comments,
    toState: (source) => ({ size: source.comments.size }),
    fromState: (state) => ({
      comments: {
        size: state.size,
      },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.comments.pagination.title')}
      description={t('admin.settings.comments.pagination.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.comments.pagination.size')}
          htmlFor="comments-size"
          hint={t('admin.settings.comments.pagination.sizeHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="comments-size"
            type="number"
            min={1}
            max={100}
            {...form.register('size', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
