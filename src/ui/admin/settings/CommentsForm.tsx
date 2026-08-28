import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useQuery } from '@tanstack/react-query'
import { Controller } from 'react-hook-form'

import type { CommentsLoaderShape } from '@/shared/config/projection'
import type { AvatarSource } from '@/shared/utils/avatar'

import { orpcQuery } from '@/client/api/orpc-query'
import { GRAVATAR_MIRROR_PRESETS } from '@/shared/utils/safe-url'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import {
  SettingsSecretInput,
  secretFieldPatch,
  secretFieldStrings,
} from '@/ui/admin/settings/shell/SettingsSecretInput'
import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { resolveSortableMove, SortableDragHandle, useSortableRow, useSortableSensors } from '@/ui/admin/shared/sortable'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

const VERTICAL_AXIS_ONLY = [restrictToVerticalAxis]

interface CommentsFormProps {
  comments: CommentsLoaderShape
}

function CommentsPaginationCard({ comments }: CommentsFormProps) {
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

const AVATAR_SOURCE_LABELS: Record<AvatarSource, string> = {
  qq: 'QQ 邮箱',
  github: 'GitHub',
  gravatar: 'Gravatar',
}

function SortableSourceRow({ source }: { source: AvatarSource }) {
  const {
    setNodeRef,
    style: rowStyle,
    isDragging,
    dragHandleProps,
  } = useSortableRow({
    id: source,
  })
  const style = {
    ...rowStyle,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
      <SortableDragHandle {...dragHandleProps} />
      <span className="flex-1 text-sm">{AVATAR_SOURCE_LABELS[source]}</span>
    </div>
  )
}

interface AvatarCardState {
  sources: AvatarSource[]
  avatarMirror: string
  githubToken: string
}

function CommentsAvatarCard({ comments }: CommentsFormProps) {
  const { form, flushOnBlur, save, display, settingGroupProps } = useSettingsCard<CommentsLoaderShape, AvatarCardState>(
    {
      section: 'comments',
      source: comments,
      toState: (source) => ({
        sources: [...source.comments.avatar.sources],
        avatarMirror: source.comments.avatar.mirror,
        githubToken: '',
      }),
      fromState: (state) => ({
        comments: {
          avatar: {
            mirror: state.avatarMirror,
            sources: state.sources,
          },
          ...secretFieldPatch(state.githubToken, 'githubToken'),
        },
      }),
    },
  )

  const sensors = useSortableSensors()

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

  const githubTokenField = secretFieldStrings({
    mask: display.comments.githubTokenMask,
    keepLabel: '保留现有 Token',
    emptyHint: '用于 GitHub Search API 按评论者邮箱反查头像；未配置时自动跳过 GitHub 来源。',
    emptyPlaceholder: '输入 GitHub Personal Access Token',
  })

  return (
    <SettingGroup
      title="头像"
      description="访客头像按顺序从以下来源拉取，全部失败时回退到默认头像。GitHub 来源依赖下方配置的 Token。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="获取顺序" hint="拖拽调整优先级；列表靠上的来源优先。排序随下一次保存提交。">
          <Controller
            control={form.control}
            name="sources"
            render={({ field }) => {
              function handleDragEnd(event: DragEndEvent) {
                const move = resolveSortableMove(event.active.id, event.over?.id, field.value, (source) => source)
                if (move) {
                  const next = [...field.value]
                  const [moved] = next.splice(move.from, 1)
                  next.splice(move.to, 0, moved!)
                  field.onChange(next)
                }
              }
              return (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  modifiers={VERTICAL_AXIS_ONLY}
                >
                  <SortableContext items={field.value} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-3">
                      {field.value.map((source) => (
                        <SortableSourceRow key={source} source={source} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )
            }}
          />
        </SettingsRow>
        <SettingsRow label="GitHub Token" htmlFor="comments-avatar-github-token" hint={githubTokenField.hint}>
          <SettingsSecretInput
            flushOnBlur={flushOnBlur}
            id="comments-avatar-github-token"
            placeholder={githubTokenField.placeholder}
            {...form.register('githubToken')}
          />
        </SettingsRow>
        <SettingsRow
          label="Gravatar 镜像"
          htmlFor="comments-avatar-mirror"
          hint="仅 Gravatar 来源使用；打开下拉框时自动检测各镜像的连通性。"
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

function CommentsTokenCard({ comments }: CommentsFormProps) {
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
