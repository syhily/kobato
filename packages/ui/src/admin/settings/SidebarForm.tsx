import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { UploadIcon } from 'lucide-react'
import { useRef } from 'react'
import { Controller, useFieldArray } from 'react-hook-form'
import { toast } from 'sonner'

const VERTICAL_AXIS_ONLY = [restrictToVerticalAxis]

import type {
  CustomQuote,
  DailyQuoteSource,
  SidebarSettings,
  SidebarWidget,
  SidebarWidgetType,
} from '@kobato/shared/config/types'

import { isRecord } from '@kobato/shared/utils/type-guards'
import { SettingsRow } from '@kobato/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@kobato/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@kobato/ui/admin/settings/shell/SettingsInput'
import { SettingsSelect } from '@kobato/ui/admin/settings/shell/SettingsSelect'
import { SettingsSwitch } from '@kobato/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@kobato/ui/admin/settings/shell/useSettingsCard'
import {
  resolveSortableMove,
  SortableDragHandle,
  useSortableRow,
  useSortableSensors,
} from '@kobato/ui/admin/shared/sortable'
import { Button } from '@kobato/ui/components/button'
import { FieldLabel } from '@kobato/ui/components/field'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kobato/ui/components/select'

interface SidebarFormProps {
  sidebar: SidebarSettings
}

const WIDGET_LABELS: Record<SidebarWidgetType, string> = {
  search: '搜索框',
  recentPosts: '推荐文章',
  recentComments: '最近评论',
  randomTags: '标签云',
  todayCalendar: '日历组件',
}

const WIDGET_HINTS: Record<SidebarWidgetType, string> = {
  search: '文章标题关键字快速搜索。',
  recentPosts: '从全部文章中随机抽取展示。',
  recentComments: '展示最近的评论摘要。',
  randomTags: '从全部标签里随机抽取展示。',
  todayCalendar: '文章按月份归档的小日历。',
}

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
        <SettingsRow label={WIDGET_LABELS[widget.type]} hint={WIDGET_HINTS[widget.type]}>
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
              启用
            </FieldLabel>
          </div>
        </SettingsRow>
        {hasCount && (
          <div className="mt-2 pl-0">
            <SettingsRow label="显示数量" htmlFor={`sidebar-${widget.type}-count`}>
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
      title="侧边栏组件"
      description="控制侧边栏的功能模块。拖拽可调整顺序，取消勾选则隐藏对应模块。"
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

// -------- 每日一言 --------

const SOURCE_OPTIONS: { value: DailyQuoteSource; label: string }[] = [
  { value: 'shanbay', label: '扇贝每日一句（默认）' },
  { value: 'one', label: 'ONE · 一个' },
  { value: 'hitokoto', label: '一言（hitokoto）' },
  { value: 'custom', label: '自定义一言' },
  { value: 'local', label: '本地内置一言' },
]

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
  const source = form.watch('source')
  const customQuotes = form.watch('customQuotes')

  async function handleQuotesFile(file: File) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      toast.error('无法解析 JSON 文件', { description: '请确认文件内容是合法的 JSON。' })
      return
    }
    if (!Array.isArray(parsed) || !parsed.every(isQuoteRow)) {
      toast.error('JSON 格式不符', {
        description: '需要形如 [{"content":"…","author":"…"}] 的数组，且 content 不能为空。',
      })
      return
    }
    if (parsed.length < MIN_CUSTOM_QUOTES) {
      toast.error('自定义一言数量不足', {
        description: `文件包含 ${parsed.length} 条，至少需要 ${MIN_CUSTOM_QUOTES} 条。`,
      })
      return
    }
    if (parsed.length > MAX_CUSTOM_QUOTES) {
      toast.error('自定义一言数量过多', {
        description: `文件包含 ${parsed.length} 条，最多支持 ${MAX_CUSTOM_QUOTES} 条。`,
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
      ? '未配置自定义一言。'
      : `已配置 ${count} 条自定义一言。${source === 'custom' && count < MIN_CUSTOM_QUOTES ? '未满 10 条，当前实际使用内置一言库。' : ''}`

  return (
    <SettingGroup
      title="每日一言"
      description="日历图片底部的一言来源。远程接口失败时自动回退到本地内置一言库；自定义一言按日期轮换。已渲染的日历图片会在缓存过期后更新。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="一言来源" htmlFor="sidebar-daily-quote-source">
          <Controller
            control={form.control}
            name="source"
            render={({ field }) => (
              <SettingsSelect name={field.name} value={field.value} onValueChange={field.onChange} save={save}>
                <SelectTrigger id="sidebar-daily-quote-source" className="w-full">
                  <SelectValue>
                    {(value: string | null) => SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? ''}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SettingsSelect>
            )}
          />
        </SettingsRow>
        <SettingsRow
          label="自定义一言"
          hint={`上传 JSON 文件，格式 [{"content":"…","author":"…"}]，至少 ${MIN_CUSTOM_QUOTES} 条、最多 ${MAX_CUSTOM_QUOTES} 条。`}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                aria-label="选择自定义一言 JSON 文件"
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
                上传 JSON
              </Button>
              {count > 0 && (
                <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={handleClear}>
                  清除
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
