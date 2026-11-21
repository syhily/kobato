import { CONTENT_LANGUAGE_MAX_LENGTH, isContentLanguageInput } from '@kobato/i18n/content-language'
import { Input } from '@kobato/ui/components/input'
import { Label } from '@kobato/ui/components/label'
import { useI18n } from '@kobato/ui/lib/I18nProvider'

export interface ContentLanguageFieldProps {
  id: string
  /** Draft value; empty string = unset (no `lang` on the public body container). */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function ContentLanguageField({ id, value, onChange, disabled }: ContentLanguageFieldProps) {
  const { t } = useI18n()
  const invalid = !isContentLanguageInput(value)
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t('admin.editor.contentLanguage.label')}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={CONTENT_LANGUAGE_MAX_LENGTH}
        placeholder={t('admin.editor.contentLanguage.placeholder')}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? errorId : hintId}
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        {t('admin.editor.contentLanguage.hint')}
      </p>
      {invalid && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {t('admin.editor.contentLanguage.error')}
        </p>
      )}
    </div>
  )
}
