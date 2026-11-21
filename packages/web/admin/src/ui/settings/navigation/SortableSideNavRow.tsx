import type { NavigationSettings } from '@kobato/settings/types'
import type { SideNavRow } from '@kobato/web-admin/ui/settings/navigation/row-model'

import { Button } from '@kobato/ui/components/button'
import { Field, FieldLabel } from '@kobato/ui/components/field'
import { Label } from '@kobato/ui/components/label'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { SettingsCheckbox } from '@kobato/web-admin/ui/settings/shell/SettingsCheckbox'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card'
import { SortableDragHandle, useSortableRow } from '@kobato/web-admin/ui/shared/sortable'
import { Trash2Icon } from 'lucide-react'
import { Controller } from 'react-hook-form'

export function SortableSideNavRow({
  field,
  index,
  form,
  flushOnBlur,
  save,
  onRemove,
}: {
  field: SideNavRow
  index: number
  form: ReturnType<typeof useSettingsCard<NavigationSettings, { sideNavRows: SideNavRow[] }>>['form']
  flushOnBlur: () => void
  save: () => unknown
  onRemove: (index: number) => void
}) {
  const { t } = useI18n()
  const { setNodeRef, style: rowStyle, isDragging, dragHandleProps } = useSortableRow({ id: field.clientId })
  const style = { ...rowStyle, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
      <SortableDragHandle {...dragHandleProps} />
      <div className="flex flex-1 flex-col gap-2 sm:flex-row">
        <div className="flex flex-col gap-1 sm:flex-1">
          <Label htmlFor={`nav-text-${index}`}>{t('admin.settings.navigation.side.text')}</Label>
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id={`nav-text-${index}`}
            maxLength={40}
            {...form.register(`sideNavRows.${index}.text`)}
          />
        </div>
        <div className="flex flex-col gap-1 sm:flex-1">
          <Label htmlFor={`nav-link-${index}`}>{t('admin.settings.navigation.side.link')}</Label>
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id={`nav-link-${index}`}
            maxLength={200}
            placeholder={t('admin.settings.navigation.side.linkPlaceholder')}
            {...form.register(`sideNavRows.${index}.link`)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Field orientation="horizontal" className="w-fit">
            <Controller
              control={form.control}
              name={`sideNavRows.${index}.newTab` as const}
              render={({ field }) => (
                <SettingsCheckbox
                  name={field.name}
                  id={`nav-newtab-${index}`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor={`nav-newtab-${index}`} className="font-normal">
              {t('admin.settings.navigation.side.newTab')}
            </FieldLabel>
          </Field>
          <Button
            type="button"
            variant="destructive-soft"
            size="icon"
            onClick={() => onRemove(index)}
            aria-label={t('common.action.delete')}
          >
            <Trash2Icon data-icon />
          </Button>
        </div>
      </div>
    </div>
  )
}
