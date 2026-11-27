import type { SidebarSettings, SidebarWidget } from '@kobato/settings/types'

import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card'
import { SortableWidgetRow } from '@kobato/web-admin/ui/settings/sidebar/SortableWidgetRow'
import { resolveSortableMove, useSortableSensors, VERTICAL_AXIS_ONLY } from '@kobato/web-admin/ui/shared/sortable'
import { useFieldArray } from 'react-hook-form'

export function SidebarWidgetsCard({ sidebar }: { sidebar: SidebarSettings }) {
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
