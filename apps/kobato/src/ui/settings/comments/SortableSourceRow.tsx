import type { AvatarSource } from '@kobato/assets/avatar'

import { useI18n } from '@kobato/ui/lib/I18nProvider'

import { AVATAR_SOURCE_LABEL_IDS } from '@/ui/settings/comments/model'
import { SortableDragHandle, useSortableRow } from '@/ui/shared/sortable'

export function SortableSourceRow({ source }: { source: AvatarSource }) {
  const { t } = useI18n()
  const {
    setNodeRef,
    style: rowStyle,
    isDragging,
    dragHandleProps,
  } = useSortableRow({
    id: source,
  })
  const style = {
    ...rowStyle,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
      <SortableDragHandle {...dragHandleProps} />
      <span className="flex-1 text-sm">{t(AVATAR_SOURCE_LABEL_IDS[source])}</span>
    </div>
  )
}
