import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { CommentsLoaderShape } from '@kobato/settings/projection'

import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kobato/ui/components/select'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { type AvatarCardState, type CommentsFormProps } from '@kobato/web-admin/ui/settings/comments/model'
import { SortableSourceRow } from '@kobato/web-admin/ui/settings/comments/SortableSourceRow'
import { GRAVATAR_MIRROR_PRESETS } from '@kobato/web-admin/ui/settings/gravatar-mirror-presets'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent'
import {
  SettingsSecretInput,
  secretFieldPatch,
  secretFieldStrings,
} from '@kobato/web-admin/ui/settings/shell/SettingsSecretInput'
import { SettingsSelect } from '@kobato/web-admin/ui/settings/shell/SettingsSelect'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card'
import { resolveSortableMove, useSortableSensors, VERTICAL_AXIS_ONLY } from '@kobato/web-admin/ui/shared/sortable'
import { orpcQuery } from '@kobato/web-client/api/orpc-query'
import { useQuery } from '@tanstack/react-query'
import { Controller } from 'react-hook-form'

export function CommentsAvatarCard({ comments }: CommentsFormProps) {
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
