import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useQuery } from '@tanstack/react-query'
import { Controller } from 'react-hook-form'

import type { CommentsLoaderShape } from '@/shared/config/projection'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
import type { AvatarSource } from '@/shared/utils/avatar'

import { orpcQuery } from '@/client/api/orpc-query'
import { GRAVATAR_MIRROR_PRESETS } from '@/ui/admin/settings/gravatar-mirror-presets'
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
import { useI18n } from '@/ui/lib/I18nProvider'

const VERTICAL_AXIS_ONLY = [restrictToVerticalAxis]

interface CommentsFormProps {
  comments: CommentsLoaderShape
}

function CommentsPaginationCard({ comments }: CommentsFormProps) {
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

const AVATAR_SOURCE_LABEL_IDS = {
  qq: 'admin.settings.comments.avatar.source.qq',
  github: 'admin.settings.comments.avatar.source.github',
  gravatar: 'admin.settings.comments.avatar.source.gravatar',
} as const satisfies Record<AvatarSource, UiMessageId>

function SortableSourceRow({ source }: { source: AvatarSource }) {
  const { t } = useI18n()
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
      <span className="flex-1 text-sm">{t(AVATAR_SOURCE_LABEL_IDS[source])}</span>
    </div>
  )
}

interface AvatarCardState {
  sources: AvatarSource[]
  avatarMirror: string
  githubToken: string
}

function CommentsAvatarCard({ comments }: CommentsFormProps) {
  const { t } = useI18n()
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
      return probe.isFetching ? (
        <span className="text-xs text-muted-foreground">{t('admin.settings.comments.avatar.probing')}</span>
      ) : null
    }
    if (!result.reachable) {
      return <span className="text-xs text-destructive">{t('admin.settings.comments.avatar.unreachable')}</span>
    }
    return <span className="text-xs text-green-600">{result.latencyMs} ms</span>
  }

  // A configured mirror outside the presets stays selectable — never strand
  // an existing (allowlisted but non-preset) value on an unreadable option;
  // its only label is the URL itself.
  const current = comments.comments.avatar.mirror
  const options: ReadonlyArray<{ value: string; labelKey?: UiMessageId }> = GRAVATAR_MIRROR_PRESETS.some(
    (option) => option.value === current,
  )
    ? GRAVATAR_MIRROR_PRESETS
    : [...GRAVATAR_MIRROR_PRESETS, { value: current }]

  function optionLabel(option: { value: string; labelKey?: UiMessageId }): string {
    return option.labelKey === undefined ? option.value : t(option.labelKey)
  }

  const githubTokenField = secretFieldStrings({
    t,
    mask: display.comments.githubTokenMask,
    keepLabel: t('admin.settings.comments.avatar.keepToken'),
    emptyHint: t('admin.settings.comments.avatar.githubTokenHint'),
    emptyPlaceholder: t('admin.settings.comments.avatar.githubTokenPlaceholder'),
  })

  return (
    <SettingGroup
      title={t('admin.settings.comments.avatar.title')}
      description={t('admin.settings.comments.avatar.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.comments.avatar.order')}
          hint={t('admin.settings.comments.avatar.orderHint')}
        >
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
        <SettingsRow
          label={t('admin.settings.comments.avatar.githubToken')}
          htmlFor="comments-avatar-github-token"
          hint={githubTokenField.hint}
        >
          <SettingsSecretInput
            flushOnBlur={flushOnBlur}
            id="comments-avatar-github-token"
            placeholder={githubTokenField.placeholder}
            {...form.register('githubToken')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.comments.avatar.mirror')}
          htmlFor="comments-avatar-mirror"
          hint={t('admin.settings.comments.avatar.mirrorHint')}
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
                    {(value: string | null) => {
                      const option = options.find((entry) => entry.value === value)
                      return option === undefined ? (value ?? '') : optionLabel(option)
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex flex-1 items-center justify-between gap-4">
                        <span>{optionLabel(option)}</span>
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

export function CommentsForm({ comments }: CommentsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <CommentsPaginationCard comments={comments} />
      <CommentsAvatarCard comments={comments} />
      <CommentsTokenCard comments={comments} />
    </div>
  )
}
