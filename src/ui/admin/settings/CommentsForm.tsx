import { useQuery } from '@tanstack/react-query'
import { Controller } from 'react-hook-form'

import type { CommentsSettings } from '@/shared/config/types'

import { orpcQuery } from '@/client/api/orpc-query'
import { GRAVATAR_MIRROR_PRESETS } from '@/shared/utils/safe-url'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

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
  const { form, save, settingGroupProps } = useSettingsCard<CommentsSettings, { avatarMirror: string }>({
    section: 'comments',
    source: comments,
    toState: (source) => ({
      avatarMirror: source.comments.avatar.mirror,
    }),
    fromState: (state) => ({
      comments: {
        avatar: { mirror: state.avatarMirror },
      },
    }),
  })

  // Connectivity probe: fires on every dropdown open (never on SSR / first
  // paint), one concurrent round per open. Stale results stay on screen
  // while a re-probe is in flight.
  const probe = useQuery({
    ...orpcQuery.admin.comments.probeAvatarMirrors.queryOptions(),
    enabled: false,
  })
  const probeByUrl = new Map((probe.data?.results ?? []).map((result) => [result.url, result]))

  function probeStatus(url: string) {
    const result = probeByUrl.get(url)
    if (result === undefined) {
      return probe.isFetching ? <span className="text-xs text-muted-foreground">检测中…</span> : null
    }
    if (!result.reachable) {
      return <span className="text-xs text-destructive">不可达</span>
    }
    return <span className="text-xs text-green-600">{result.latencyMs} ms</span>
  }

  // A configured mirror outside the presets stays selectable — never strand
  // an existing (allowlisted but non-preset) value on an unreadable option.
  const current = comments.comments.avatar.mirror
  const options = GRAVATAR_MIRROR_PRESETS.some((option) => option.value === current)
    ? GRAVATAR_MIRROR_PRESETS
    : [...GRAVATAR_MIRROR_PRESETS, { value: current, label: current }]

  return (
    <SettingGroup
      title="头像镜像"
      description="访客头像通过 Gravatar 协议拉取。镜像用于绕过 gravatar.com 的访问限制。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label="Gravatar 镜像"
          htmlFor="comments-avatar-mirror"
          hint="选择头像拉取使用的镜像服务；打开下拉框时自动检测各镜像的连通性。"
        >
          <Controller
            control={form.control}
            name="avatarMirror"
            render={({ field }) => (
              <SettingsSelect
                name={field.name}
                value={field.value}
                onValueChange={field.onChange}
                save={save}
                onOpenChange={(open) => {
                  if (open) {
                    void probe.refetch()
                  }
                }}
              >
                <SelectTrigger id="comments-avatar-mirror" className="w-full">
                  <SelectValue>
                    {(value: string | null) => options.find((o) => o.value === value)?.label ?? value ?? ''}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex flex-1 items-center justify-between gap-4">
                        <span>{option.label}</span>
                        {probeStatus(option.value)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </SettingsSelect>
            )}
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
