import type { WebmentionsSettings } from '@kobato/shared/config/types'

import { SettingsRow } from '@kobato/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@kobato/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/ui/admin/settings/shell/SettingGroupContent'
import { SettingsSwitch } from '@kobato/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@kobato/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@kobato/ui/components/field'
import { Controller } from 'react-hook-form'

interface WebmentionsFormProps {
  webmentions: WebmentionsSettings
}

function WebmentionReceiveCard({ webmentions }: WebmentionsFormProps) {
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
      title="接收 Webmention"
      description="其他站点引用你的文章时，可以通过 W3C Webmention 协议通知本站。关闭后接收端点返回 410，页面不再声明端点，已收到的提及保留在审核队列中。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="启用接收" hint="开启时页面通过 <link> 与 Link 响应头声明 /webmention 端点。">
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
              接受其他站点的 Webmention
            </FieldLabel>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function WebmentionDisplayCard({ webmentions }: WebmentionsFormProps) {
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
      title="展示引用与回应"
      description="审核通过的 Webmention 会显示在文章与页面正文之后、评论区之前。关闭后公开页面不再渲染该区块。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="在文章页展示" hint="仅展示已批准的提及；待审核与已拒绝的永远不会公开。">
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
              展示已批准的引用与回应
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
