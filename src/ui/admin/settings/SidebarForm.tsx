import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon } from 'lucide-react'
import { Controller, useFieldArray } from 'react-hook-form'

const VERTICAL_AXIS_ONLY = [restrictToVerticalAxis]

import type { SidebarSettings, SidebarWidget, SidebarWidgetType } from '@/shared/config/blog'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingValue } from '@/ui/admin/settings/shell/SettingValue'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { Input } from '@/ui/components/input'
import { Switch } from '@/ui/components/switch'

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
}: {
  widget: SidebarWidget
  index: number
  form: ReturnType<typeof useSettingsCard<SidebarSettings, { widgets: SidebarWidget[] }>>['form']
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.type,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const hasCount = widget.type === 'recentPosts' || widget.type === 'recentComments' || widget.type === 'randomTags'

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-3 rounded-md border border-line bg-canvas p-3">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-0.5 shrink-0 cursor-grab text-ink-4 active:cursor-grabbing"
        aria-label="拖拽排序"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <div className="flex-1">
        <SettingsRow label={WIDGET_LABELS[widget.type]} hint={WIDGET_HINTS[widget.type]}>
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name={`widgets.${index}.enabled` as const}
              render={({ field }) => (
                <Switch id={`sidebar-${widget.type}`} checked={field.value} onCheckedChange={field.onChange} />
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
              <Input
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

export function SidebarForm({ sidebar }: SidebarFormProps) {
  const { mode, form, settingGroupProps, optimisticSource } = useSettingsCard<
    SidebarSettings,
    { widgets: SidebarWidget[] }
  >({
    section: 'sidebar',
    source: sidebar,
    toState: (source) => ({ widgets: [...source.sidebar.widgets] }),
    fromState: (state) => ({ sidebar: { widgets: state.widgets } }),
  })

  const display = optimisticSource ?? sidebar
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const rows = useFieldArray({ control: form.control, name: 'widgets' })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = rows.fields.findIndex((w) => w.type === active.id)
      const newIndex = rows.fields.findIndex((w) => w.type === over.id)
      rows.move(oldIndex, newIndex)
    }
  }

  return (
    <SettingGroup
      title="侧边栏组件"
      description="控制侧边栏的功能模块。拖拽可调整顺序，取消勾选则隐藏对应模块。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
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
                  <SortableWidgetRow key={widget.type} widget={widget as SidebarWidget} index={index} form={form} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          {display.sidebar.widgets.map((widget) => (
            <SettingValue
              key={widget.type}
              label={WIDGET_LABELS[widget.type]}
              value={
                widget.enabled ? `已启用${widget.count !== undefined ? `（显示 ${widget.count} 条）` : ''}` : '已禁用'
              }
            />
          ))}
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}
