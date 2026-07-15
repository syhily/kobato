import type { CommentsSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'

interface CommentsFormProps {
  comments: CommentsSettings
}

function CommentsPaginationCard({ comments }: { comments: CommentsSettings }) {
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<CommentsSettings, { size: number }>({
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
    <SettingGroup title="评论分页" description="控制文章页面下方的评论列表加载行为。" {...settingGroupProps}>
      <SettingGroupContent>
        <SettingsRow label="每页评论数" htmlFor="comments-size" hint="客户端「加载更多」每次抓取的根评论数量。">
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

function CommentsAvatarCard({ comments }: { comments: CommentsSettings }) {
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<
    CommentsSettings,
    { avatarMirror: string; avatarSize: number }
  >({
    section: 'comments',
    source: comments,
    toState: (source) => ({
      avatarMirror: source.comments.avatar.mirror,
      avatarSize: source.comments.avatar.size,
    }),
    fromState: (state) => ({
      comments: {
        avatar: { mirror: state.avatarMirror.trim(), size: state.avatarSize },
      },
    }),
  })

  return (
    <SettingGroup
      title="头像镜像"
      description="访客头像通过 Gravatar 协议拉取。镜像 URL 用于绕过 gravatar.com 的访问限制。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label="Gravatar 镜像 URL"
          htmlFor="comments-avatar-mirror"
          hint="例如 https://gravatar.loli.net/avatar，结尾不带斜杠。"
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="comments-avatar-mirror"
            type="url"
            {...form.register('avatarMirror')}
          />
        </SettingsRow>
        <SettingsRow label="头像尺寸 (px)" htmlFor="comments-avatar-size">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="comments-avatar-size"
            type="number"
            min={16}
            max={512}
            {...form.register('avatarSize', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function CommentsTokenCard({ comments }: { comments: CommentsSettings }) {
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<CommentsSettings, { tokenTtlSeconds: number }>({
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
      title="匿名评论 Token"
      description="控制匿名评论者发表后可编辑自己评论的时间窗口。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label="Token 有效期 (秒)"
          htmlFor="comments-token-ttl"
          hint="默认 1800 秒（30 分钟）。范围 60–86400 秒。"
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

export function CommentsForm({ comments }: CommentsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <CommentsPaginationCard comments={comments} />
      <CommentsAvatarCard comments={comments} />
      <CommentsTokenCard comments={comments} />
    </div>
  )
}
