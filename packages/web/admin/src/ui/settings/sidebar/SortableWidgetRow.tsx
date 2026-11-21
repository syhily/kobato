import type { SidebarSettings, SidebarWidget } from '@kobato/settings/types'

import { FieldLabel } from '@kobato/ui/components/field'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput'
import { SettingsSwitch } from '@kobato/web-admin/ui/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card'
import { WIDGET_HINT_IDS, WIDGET_LABEL_IDS } from '@kobato/web-admin/ui/settings/sidebar/model'
import { SortableDragHandle, useSortableRow } from '@kobato/web-admin/ui/shared/sortable'
import { Controller } from 'react-hook-form'

export function SortableWidgetRow({
  widget,
  index,
  form,
  save,
  flushOnBlur,
}: {
  widget: SidebarWidget
  index: number
  form: ReturnType<typeof useSettingsCard<SidebarSettings, { widgets: SidebarWidget[] }>>['form']
  save: () => unknown
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
