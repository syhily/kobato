import { Controller } from 'react-hook-form'

import type { NewsletterSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'

interface NewsletterFormProps {
  newsletter: NewsletterSettings
}

interface FormState {
  enabled: boolean
  fromName: string
  subjectPrefix: string
}

export function NewsletterForm({ newsletter }: NewsletterFormProps) {
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
        title="邮件订阅"
        description="开启后访客可通过邮箱订阅更新；订阅需经邮件确认（双重确认）后生效。"
        {...settingGroupProps}
      >
        <SettingGroupContent>
          <SettingsRow label="启用邮件订阅" hint="开启前请先完成「邮件服务」配置；关闭时订阅接口拒绝新请求。">
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
                    {field.value ? '已开启' : '已关闭'}
                  </FieldLabel>
                </div>
              )}
            />
          </SettingsRow>
          <SettingsRow label="发件人名称" htmlFor="newsletter-from-name" hint="留空时使用站点标题。">
            <SettingsInput
              flushOnBlur={flushOnBlur}
              id="newsletter-from-name"
              maxLength={80}
              {...form.register('fromName')}
            />
          </SettingsRow>
          <SettingsRow
            label="主题前缀"
            htmlFor="newsletter-subject-prefix"
            hint="邮件主题中显示的前缀，留空时使用站点标题。"
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
