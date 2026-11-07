import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { UploadIcon } from 'lucide-react'
import { useRef } from 'react'
import { Controller, useFieldArray, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

const VERTICAL_AXIS_ONLY = [restrictToVerticalAxis]

import type {
  CustomQuote,
  DailyQuoteSource,
  SidebarSettings,
  SidebarWidget,
  SidebarWidgetType,
} from '@/shared/config/types'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { isRecord } from '@/shared/utils/type-guards'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { resolveSortableMove, SortableDragHandle, useSortableRow, useSortableSensors } from '@/ui/admin/shared/sortable'
import { Button } from '@/ui/components/button'
import { FieldLabel } from '@/ui/components/field'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { useI18n } from '@/ui/lib/I18nProvider'

interface SidebarFormProps {
  sidebar: SidebarSettings
}

const WIDGET_LABEL_IDS = {
  search: 'admin.settings.sidebar.widget.search.label',
  recentPosts: 'admin.settings.sidebar.widget.recentPosts.label',
  recentComments: 'admin.settings.sidebar.widget.recentComments.label',
  randomTags: 'admin.settings.sidebar.widget.randomTags.label',
  todayCalendar: 'admin.settings.sidebar.widget.todayCalendar.label',
} as const satisfies Record<SidebarWidgetType, UiMessageId>

const WIDGET_HINT_IDS = {
  search: 'admin.settings.sidebar.widget.search.hint',
  recentPosts: 'admin.settings.sidebar.widget.recentPosts.hint',
  recentComments: 'admin.settings.sidebar.widget.recentComments.hint',
  randomTags: 'admin.settings.sidebar.widget.randomTags.hint',
  todayCalendar: 'admin.settings.sidebar.widget.todayCalendar.hint',
} as const satisfies Record<SidebarWidgetType, UiMessageId>

function SortableWidgetRow({
  widget,
  index,
  form,
  save,
  flushOnBlur,
}: {
  widget: SidebarWidget
  index: number
  form: ReturnType<typeof useSettingsCard<SidebarSettings, { widgets: SidebarWidget[] }>>['form']
  save: () => void
  flushOnBlur: () => void
}) {
  const { t } = useI18n()
  const {
    setNodeRef,
    style: rowStyle,
    isDragging,
    dragHandleProps,
  } = useSortableRow({
    id: widget.type,
  })
  const style = {
    ...rowStyle,
    opacity: isDragging ? 0.5 : 1,
  }
  const hasCount = widget.type === 'recentPosts' || widget.type === 'recentComments' || widget.type === 'randomTags'

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
      <SortableDragHandle {...dragHandleProps} />
      <div className="flex-1">
        <SettingsRow label={t(WIDGET_LABEL_IDS[widget.type])} hint={t(WIDGET_HINT_IDS[widget.type])}>
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name={`widgets.${index}.enabled` as const}
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id={`sidebar-${widget.type}`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor={`sidebar-${widget.type}`} className="font-normal">
              {t('admin.settings.sidebar.widget.enable')}
            </FieldLabel>
          </div>
        </SettingsRow>
        {hasCount && (
          <div className="mt-2 pl-0">
            <SettingsRow label={t('admin.settings.sidebar.widget.count')} htmlFor={`sidebar-${widget.type}-count`}>
              <SettingsInput
                flushOnBlur={flushOnBlur}
                id={`sidebar-${widget.type}-count`}
                type="number"
                min={0}
                max={100}
                {...form.register(`widgets.${index}.count`, { valueAsNumber: true })}
              />
            </SettingsRow>
          </div>
        )}
      </div>
    </div>
  )
}

function SidebarWidgetsCard({ sidebar }: SidebarFormProps) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps, save } = useSettingsCard<SidebarSettings, { widgets: SidebarWidget[] }>(
    {
      section: 'sidebar',
      source: sidebar,
      toState: (source) => ({ widgets: [...source.sidebar.widgets] }),
      fromState: (state) => ({ sidebar: { widgets: state.widgets } }),
    },
  )

  const sensors = useSortableSensors()

  const rows = useFieldArray({ control: form.control, name: 'widgets' })

  function handleDragEnd(event: DragEndEvent) {
    const move = resolveSortableMove(event.active.id, event.over?.id, rows.fields, (w) => w.type)
    if (move) {
      rows.move(move.from, move.to)
    }
  }

  return (
    <SettingGroup
      title={t('admin.settings.sidebar.widgets.title')}
      description={t('admin.settings.sidebar.widgets.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={VERTICAL_AXIS_ONLY}
        >
          <SortableContext items={rows.fields.map((w) => w.type)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3">
              {rows.fields.map((widget, index) => (
                <SortableWidgetRow
                  key={widget.type}
                  widget={widget as SidebarWidget}
                  index={index}
                  form={form}
                  save={() => save('widgets')}
                  flushOnBlur={flushOnBlur}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </SettingGroupContent>
    </SettingGroup>
  )
}

const SOURCE_OPTIONS = [
  { value: 'shanbay', labelId: 'admin.settings.sidebar.quote.source.shanbay' },
  { value: 'one', labelId: 'admin.settings.sidebar.quote.source.one' },
  { value: 'hitokoto', labelId: 'admin.settings.sidebar.quote.source.hitokoto' },
  { value: 'custom', labelId: 'admin.settings.sidebar.quote.source.custom' },
  { value: 'local', labelId: 'admin.settings.sidebar.quote.source.local' },
] as const satisfies readonly { value: DailyQuoteSource; labelId: UiMessageId }[]

const MIN_CUSTOM_QUOTES = 10
const MAX_CUSTOM_QUOTES = 500

interface DailyQuoteState {
  source: DailyQuoteSource
  customQuotes: CustomQuote[]
}

function isQuoteRow(value: unknown): value is { content: string; author?: unknown } {
  return isRecord(value) && typeof value.content === 'string' && value.content.trim().length > 0
}

function DailyQuoteCard({ sidebar }: SidebarFormProps) {
  const { t } = useI18n()
  const { form, settingGroupProps, save, isSaving } = useSettingsCard<SidebarSettings, DailyQuoteState>({
    section: 'sidebar',
    source: sidebar,
    toState: (source) => ({
      source: source.sidebar.dailyQuote.source,
      customQuotes: source.sidebar.dailyQuote.customQuotes.map((quote) => ({ ...quote })),
    }),
    fromState: (state) => ({
      sidebar: { dailyQuote: { source: state.source, customQuotes: state.customQuotes } },
    }),
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  // useWatch, not form.watch: the React Compiler memoizes render-time watch()
  // results (stable form dep), freezing the values at their initial state.
  const source = useWatch({ control: form.control, name: 'source' })
  const customQuotes = useWatch({ control: form.control, name: 'customQuotes' })

  async function handleQuotesFile(file: File) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      toast.error(t('admin.settings.sidebar.quote.error.parseTitle'), {
        description: t('admin.settings.sidebar.quote.error.parseDescription'),
      })
      return
    }
    if (!Array.isArray(parsed) || !parsed.every(isQuoteRow)) {
      toast.error(t('admin.settings.sidebar.quote.error.shapeTitle'), {
        description: t('admin.settings.sidebar.quote.error.shapeDescription'),
      })
      return
    }
    if (parsed.length < MIN_CUSTOM_QUOTES) {
      toast.error(t('admin.settings.sidebar.quote.error.tooFewTitle'), {
        description: t('admin.settings.sidebar.quote.error.tooFewDescription', {
          count: parsed.length,
          min: MIN_CUSTOM_QUOTES,
        }),
      })
      return
    }
    if (parsed.length > MAX_CUSTOM_QUOTES) {
      toast.error(t('admin.settings.sidebar.quote.error.tooManyTitle'), {
        description: t('admin.settings.sidebar.quote.error.tooManyDescription', {
          count: parsed.length,
          max: MAX_CUSTOM_QUOTES,
        }),
      })
      return
    }
    const quotes = parsed.map((row) => ({
      content: row.content.trim().slice(0, 100),
      author: typeof row.author === 'string' ? row.author.trim().slice(0, 30) : '',
    }))
    form.setValue('customQuotes', quotes, { shouldDirty: true })
    // 离散动作（非逐行列表编辑），立即保存才能给出服务端校验的即时反馈。
    save('customQuotes')
  }

  function handleClear() {
    form.setValue('customQuotes', [], { shouldDirty: true })
    save('customQuotes')
  }

  const count = customQuotes.length
  const statusText =
    count === 0
      ? t('admin.settings.sidebar.quote.status.empty')
      : [
          t('admin.settings.sidebar.quote.status.configured', { count }),
          source === 'custom' && count < MIN_CUSTOM_QUOTES
            ? t('admin.settings.sidebar.quote.status.insufficient', { min: MIN_CUSTOM_QUOTES })
            : '',
        ]
          .filter((part) => part !== '')
          .join(' ')

  return (
    <SettingGroup
      title={t('admin.settings.sidebar.quote.title')}
      description={t('admin.settings.sidebar.quote.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.sidebar.quote.source')} htmlFor="sidebar-daily-quote-source">
          <Controller
            control={form.control}
            name="source"
            render={({ field }) => (
              <SettingsSelect name={field.name} value={field.value} onValueChange={field.onChange} save={save}>
                <SelectTrigger id="sidebar-daily-quote-source" className="w-full">
                  <SelectValue>
                    {(value: string | null) => {
                      const option = SOURCE_OPTIONS.find((o) => o.value === value)
                      return option === undefined ? (value ?? '') : t(option.labelId)
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SettingsSelect>
            )}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.sidebar.quote.custom')}
          hint={t('admin.settings.sidebar.quote.uploadHint', {
            min: MIN_CUSTOM_QUOTES,
            max: MAX_CUSTOM_QUOTES,
          })}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                aria-label={t('admin.settings.sidebar.quote.chooseFile')}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    void handleQuotesFile(file)
                  }
                  e.target.value = ''
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon data-icon="sm" />
                {t('admin.settings.sidebar.quote.upload')}
              </Button>
              {count > 0 && (
                <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={handleClear}>
                  {t('admin.settings.sidebar.quote.clear')}
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{statusText}</p>
            {count > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {customQuotes.slice(0, 3).map((quote) => (
                  <li key={quote.content} className="truncate">
                    {quote.content}
                    {quote.author ? ` —— ${quote.author}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function SidebarForm({ sidebar }: SidebarFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <SidebarWidgetsCard sidebar={sidebar} />
      <DailyQuoteCard sidebar={sidebar} />
    </div>
  )
}
