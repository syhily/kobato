import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { ToggleRow } from '@/ui/admin/editor-shared/ToggleRow'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import { useI18n } from '@/ui/lib/I18nProvider'

/** Shape shared by `POST_META_TOGGLE_FIELDS` / `PAGE_META_TOGGLE_FIELDS` rows. */
export interface ToggleField {
  key: string
  id: string
  labelId: UiMessageId
  descriptionId: UiMessageId
}

export interface ToggleOptionsCardProps<TField extends ToggleField> {
  fields: ReadonlyArray<TField>
  /** Hide a field (e.g. a feature-gated toggle); omit to show every field. */
  fieldVisible?: (field: TField) => boolean
  value: (key: TField['key']) => boolean
  onToggle: (key: TField['key'], value: boolean) => void
  disabled?: boolean
}

export function ToggleOptionsCard<TField extends ToggleField>({
  fields,
  fieldVisible,
  value,
  onToggle,
  disabled,
}: ToggleOptionsCardProps<TField>) {
  const { t } = useI18n()
  const visibleFields = fieldVisible === undefined ? fields : fields.filter(fieldVisible)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('admin.editor.toggleOptions')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {visibleFields.map((field) => (
          <ToggleRow
            key={field.key}
            id={field.id}
            label={t(field.labelId)}
            description={t(field.descriptionId)}
            checked={value(field.key)}
            onCheckedChange={(next) => onToggle(field.key, next)}
            disabled={disabled}
          />
        ))}
      </CardContent>
    </Card>
  )
}
