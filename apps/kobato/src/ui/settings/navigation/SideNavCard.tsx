import type { NavigationSettings } from '@kobato/settings/types'

import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Button } from '@kobato/ui/components/button'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { PlusIcon } from 'lucide-react'
import { useFieldArray } from 'react-hook-form'

import { type SideNavRow } from '@/ui/settings/navigation/row-model'
import { SortableSideNavRow } from '@/ui/settings/navigation/SortableSideNavRow'
import { SettingGroup } from '@/ui/settings/shell/SettingGroup'
import { useSettingsCard } from '@/ui/settings/shell/use-settings-card'
import { resolveSortableMove, useSortableSensors, VERTICAL_AXIS_ONLY } from '@/ui/shared/sortable'

export function SideNavCard({ navigation }: { navigation: NavigationSettings }) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps, save } = useSettingsCard<
    NavigationSettings,
    { sideNavRows: SideNavRow[] }
  >({
    section: 'navigation',
    source: navigation,
    toState: (source) => ({
      sideNavRows: source.navigation.sideNav.map((item, i) => ({
        clientId: `sidenav-${i}`,
        text: item.text,
        link: item.link,
        newTab: item.target === '_blank',
      })),
    }),
    fromState: (state) => ({
      navigation: {
        sideNav: state.sideNavRows.map((row) => ({
          text: row.text.trim(),
          link: row.link.trim(),
          ...(row.newTab ? { target: '_blank' } : {}),
        })),
      },
    }),
  })

  const sensors = useSortableSensors()

  const rows = useFieldArray({ control: form.control, name: 'sideNavRows' })

  function handleSideNavDragEnd(event: DragEndEvent) {
    const move = resolveSortableMove(event.active.id, event.over?.id, rows.fields, (i) => i.clientId)
    if (move) {
      rows.move(move.from, move.to)
    }
  }

  return (
    <SettingGroup
      title={t('admin.settings.navigation.side.title')}
      description={t('admin.settings.navigation.side.description')}
      {...settingGroupProps}
    >
      <div className="flex flex-col gap-3">
        {rows.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.settings.navigation.side.empty')}</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSideNavDragEnd}
            modifiers={VERTICAL_AXIS_ONLY}
          >
            <SortableContext items={rows.fields.map((i) => i.clientId)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {rows.fields.map((field, index) => (
                  <SortableSideNavRow
                    key={field.clientId}
                    field={field as SideNavRow}
                    index={index}
                    form={form}
                    flushOnBlur={flushOnBlur}
                    save={() => save('sideNavRows')}
                    onRemove={(i) => rows.remove(i)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => rows.append({ clientId: crypto.randomUUID(), text: '', link: '/', newTab: false })}
          disabled={rows.fields.length >= 20}
        >
          <PlusIcon data-icon /> {t('admin.settings.navigation.side.add')}
        </Button>
      </div>
    </SettingGroup>
  )
}
