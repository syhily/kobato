import type { FooterNavItem } from '@kobato/settings/types'

import { SOCIAL_NETWORK_META, SOCIAL_NETWORKS } from '@kobato/settings/socials'
import { Button } from '@kobato/ui/components/button'
import { Label } from '@kobato/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kobato/ui/components/select'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { Trash2Icon } from 'lucide-react'

import {
  asFooterNavType,
  asSocialNetwork,
  TYPE_LABEL_IDS,
  type FooterNavItemRowState,
} from '@/ui/settings/navigation/row-model'
import { SortableDragHandle, useSortableRow } from '@/ui/shared/sortable'

export function SortableFooterNavRow({
  item,
  index,
  onUpdate,
  onRemove,
}: {
  item: FooterNavItemRowState
  index: number
  onUpdate: (idx: number, patch: Partial<FooterNavItem>) => void
  onRemove: (idx: number) => void
}) {
  const { t } = useI18n()
  const { setNodeRef, style: rowStyle, isDragging, dragHandleProps } = useSortableRow({ id: item.clientId })
  const style = { ...rowStyle, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
      <SortableDragHandle {...dragHandleProps} />
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={`footer-item-type-${index}`}>{t('admin.settings.navigation.type')}</Label>
          <Select
            value={item.type}
            onValueChange={(value) =>
              onUpdate(index, {
                type: asFooterNavType(value),
                network: value === 'social' ? 'github' : undefined,
              })
            }
          >
            <SelectTrigger id={`footer-item-type-${index}`}>
              <SelectValue>
                {(value: string | null) =>
                  value === null
                    ? t('admin.settings.navigation.select')
                    : TYPE_LABEL_IDS[asFooterNavType(value)] === undefined
                      ? value
                      : t(TYPE_LABEL_IDS[asFooterNavType(value)])
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="social">{t(TYPE_LABEL_IDS.social)}</SelectItem>
              <SelectItem value="themeToggle">{t(TYPE_LABEL_IDS.themeToggle)}</SelectItem>
              <SelectItem value="search">{t(TYPE_LABEL_IDS.search)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {item.type === 'social' && (
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`footer-item-network-${index}`}>{t('admin.settings.navigation.platform')}</Label>
            <Select
              value={item.network}
              onValueChange={(value) => onUpdate(index, { network: asSocialNetwork(value) })}
            >
              <SelectTrigger id={`footer-item-network-${index}`}>
                <SelectValue>
                  {(value: string | null) =>
                    value === null
                      ? t('admin.settings.navigation.select')
                      : SOCIAL_NETWORK_META[asSocialNetwork(value)]
                        ? t(SOCIAL_NETWORK_META[asSocialNetwork(value)].labelId)
                        : value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SOCIAL_NETWORKS.map((network) => (
                  <SelectItem key={network} value={network}>
                    {t(SOCIAL_NETWORK_META[network].labelId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
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
  )
}
