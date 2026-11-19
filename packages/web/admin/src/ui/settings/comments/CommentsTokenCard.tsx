import type { CommentsLoaderShape } from '@kobato/settings/projection.ts'

import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { type CommentsFormProps } from '@kobato/web-admin/ui/settings/comments/model.ts'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection.tsx'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup.tsx'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent.tsx'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput.tsx'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card.tsx'

export function CommentsTokenCard({ comments }: CommentsFormProps) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<CommentsLoaderShape, { tokenTtlSeconds: number }>({
    section: 'comments',
    source: comments,
    toState: (source) => ({ tokenTtlSeconds: source.comments.tokenTtlSeconds }),
    fromState: (state) => ({
      comments: {
        tokenTtlSeconds: state.tokenTtlSeconds,
      },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.comments.token.title')}
      description={t('admin.settings.comments.token.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.comments.token.ttl')}
          htmlFor="comments-token-ttl"
          hint={t('admin.settings.comments.token.ttlHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="comments-token-ttl"
            type="number"
            min={60}
            max={86400}
            {...form.register('tokenTtlSeconds', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
