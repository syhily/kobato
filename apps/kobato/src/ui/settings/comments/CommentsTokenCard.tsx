import type { CommentsLoaderShape } from '@kobato/settings/projection'

import { useI18n } from '@kobato/ui/lib/I18nProvider'

import { type CommentsFormProps } from '@/ui/settings/comments/model'
import { SettingsRow } from '@/ui/settings/SettingsSection'
import { SettingGroup } from '@/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/settings/shell/use-settings-card'

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
