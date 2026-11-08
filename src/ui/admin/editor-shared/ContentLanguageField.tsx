import { CONTENT_LANGUAGE_MAX_LENGTH, isContentLanguageInput } from '@/shared/i18n/content-language'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface ContentLanguageFieldProps {
  /** `<Input>` id + label htmlFor (`post-content-language` / `page-content-language`). */
  id: string
  /** Draft value; empty string = unset (no `lang` on the public body container). */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/**
 * Optional BCP 47 tag for the prose itself. Client-side validation only
 * previews the server's write rule — the upsert API stays the authority and
 * answers a descriptor-carrying validation issue.
 */
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
