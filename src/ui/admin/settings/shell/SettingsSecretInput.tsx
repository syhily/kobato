import type { ComponentProps } from 'react'

import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'

// Secret-field wrapper for /admin/settings: empty/whitespace input omits
// the key from the patch so the server keeps the stored secret; only the
// server-confirmed mask decides which state renders.

type SettingsInputProps = ComponentProps<typeof SettingsInput>

interface SettingsSecretInputProps extends Omit<SettingsInputProps, 'type' | 'autoComplete' | 'placeholder'> {
  /** From `secretFieldStrings(...).placeholder` — the「保留现有…」label when configured. */
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
  /** Server-confirmed mask (`display.<x>Mask`); null when nothing is stored. */
  mask: string | null
  /** The「保留现有…」label — reused as the configured placeholder and inside the hint. */
  keepLabel: string
  /** Hint shown while nothing is configured (site-specific guidance). */
  emptyHint: string
  /** Placeholder shown while nothing is configured. */
  emptyPlaceholder: string
}

// Hint + placeholder for a secret field's `SettingsRow`; the card supplies only the mask and empty-state strings.
export function secretFieldStrings({ mask, keepLabel, emptyHint, emptyPlaceholder }: SecretFieldStringsOptions): {
  hint: string
  placeholder: string
} {
  if (mask !== null) {
    return { hint: `当前已配置（结尾 …${mask}）。留空保存表示${keepLabel}。`, placeholder: keepLabel }
  }
  return { hint: emptyHint, placeholder: emptyPlaceholder }
}
