import type { I18nValue } from '@kobato/ui/lib/I18nProvider.tsx'
import type { ComponentProps } from 'react'

import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput.tsx'

// Secret-field wrapper for /admin/settings: empty/whitespace input omits
// the key from the patch so the server keeps the stored secret; only the
// server-confirmed mask decides which state renders.

type SettingsInputProps = ComponentProps<typeof SettingsInput>

interface SettingsSecretInputProps extends Omit<SettingsInputProps, 'type' | 'autoComplete' | 'placeholder'> {
  placeholder: string
}

export function SettingsSecretInput({ maxLength = 512, ...props }: SettingsSecretInputProps) {
  return <SettingsInput type="password" autoComplete="new-password" maxLength={maxLength} {...props} />
}

// Empty input omits the key — the server's deep-merge preserves the stored secret.
export function secretFieldPatch<K extends string>(value: string, fieldName: K): Partial<Record<K, string>> {
  const trimmed = value.trim()
  if (!trimmed) {
    return {}
  }
  const patch: Partial<Record<K, string>> = {}
  patch[fieldName] = trimmed
  return patch
}

interface SecretFieldStringsOptions {
  t: I18nValue['t']
  mask: string | null
  keepLabel: string
  emptyHint: string
  emptyPlaceholder: string
}

export function secretFieldStrings({ t, mask, keepLabel, emptyHint, emptyPlaceholder }: SecretFieldStringsOptions): {
  hint: string
  placeholder: string
} {
  if (mask !== null) {
    return { hint: t('admin.settings.shell.secret.configured', { mask }), placeholder: keepLabel }
  }
  return { hint: emptyHint, placeholder: emptyPlaceholder }
}
