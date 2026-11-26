import type { FooterNavItem, NavigationSettings, SocialItem } from '@kobato/settings/types'

import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Button } from '@kobato/ui/components/button'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { PlusIcon } from 'lucide-react'
import { useFieldArray } from 'react-hook-form'

import { type FooterNavItemRowState } from '@/ui/settings/navigation/row-model'
import { SortableFooterNavRow } from '@/ui/settings/navigation/SortableFooterNavRow'
import { SettingGroup } from '@/ui/settings/shell/SettingGroup'
import { useSettingsCard } from '@/ui/settings/shell/use-settings-card'
import { resolveSortableMove, useSortableSensors, VERTICAL_AXIS_ONLY } from '@/ui/shared/sortable'

export function FooterNavCard({ navigation, socials }: { navigation: NavigationSettings; socials: SocialItem[] }) {
  const { t } = useI18n()
  const { form, settingGroupProps, save } = useSettingsCard<
    NavigationSettings,
    { footerNavItems: FooterNavItemRowState[] }
  >({
    section: 'navigation',
    source: navigation,
    toState: (source) => ({
      footerNavItems: source.navigation.footerNav.map((item, i) => ({
        ...item,
        clientId: `footer-${i}`,
      })),
    }),
    fromState: (state) => ({
      navigation: {
        footerNav: state.footerNavItems.map((item) => ({ type: item.type, network: item.network })),
      },
    }),
  })

  const sensors = useSortableSensors()

  const rows = useFieldArray({ control: form.control, name: 'footerNavItems' })

  function handleFooterDragEnd(event: DragEndEvent) {
    const move = resolveSortableMove(event.active.id, event.over?.id, rows.fields, (i) => i.clientId)
    if (move) {
      rows.move(move.from, move.to)
    }
  }

  function updateFooterItem(index: number, patch: Partial<FooterNavItem>) {
    const current = rows.fields[index]
    rows.update(index, { ...current, ...patch } as FooterNavItemRowState)
    void save('footerNavItems')
  }

  const configuredNetworks = new Set(socials.map((s) => s.network))

  return (
    <SettingGroup
      title={t('admin.settings.navigation.footer.title')}
      description={t('admin.settings.navigation.footer.description')}
      {...settingGroupProps}
    >
      <div className="flex flex-col gap-3">
        {rows.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.settings.navigation.footer.empty')}</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleFooterDragEnd}
            modifiers={VERTICAL_AXIS_ONLY}
          >
            <SortableContext items={rows.fields.map((i) => i.clientId)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {rows.fields.map((item, index) => (
                  <SortableFooterNavRow
                    key={item.clientId}
                    item={item as FooterNavItemRowState}
                    index={index}
                    onUpdate={updateFooterItem}
                    onRemove={(i) => rows.remove(i)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => rows.append({ type: 'social', network: 'github', clientId: crypto.randomUUID() })}
            disabled={rows.fields.length >= 5}
          >
            <PlusIcon data-icon /> {t('admin.settings.navigation.footer.add')}
          </Button>
          {rows.fields.some(
            (item) => item.type === 'social' && item.network && !configuredNetworks.has(item.network),
          ) && <span className="text-sm text-destructive">{t('admin.settings.navigation.footer.warning')}</span>}
        </div>
      </div>
    </SettingGroup>
  )
}
