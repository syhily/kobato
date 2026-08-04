import type { ComponentProps } from 'react'

import { SettingsInput } from '@kobato/ui/admin/settings/shell/SettingsInput'

// The "Secret field" pattern for /admin/settings (CONTEXT.md): declared once
// here — preserve-on-omit and the mask hint derive from the declaration.
// Every stored credential (Zeabur key, Mailgun key, SMTP password, S3 secret,
// search API key) flows through three pieces that used to be hand-copied per
// card — one mistaken copy silently wipes a credential:
//
//   1. `toState` seeds the form field as `''` — the stored secret never
//      enters the form (this stays in the card; there is nothing to share).
//   2. `fromState` spreads `secretFieldPatch(state.x, 'x')` — an empty or
//      whitespace-only input OMITS the key from the patch, so the server's
//      deep-merge preserves the stored secret; a real input replaces it
//      (trimmed).
//   3. The row hint and input placeholder come from `secretFieldStrings(...)`
//      so the「当前已配置（结尾 …xxxx）。留空保存表示保留现有…」wording is
//      written once. Only the server-confirmed mask (`display.<x>Mask`)
//      decides which state renders — never the (empty) form value.
//
// `<SettingsSecretInput>` itself is a thin composition over `SettingsInput`
// that bakes the secret-input invariants: password masking, `new-password`
// autocomplete, and the 512-char cap. Blur-driven save is unchanged.

type SettingsInputProps = ComponentProps<typeof SettingsInput>

interface SettingsSecretInputProps extends Omit<SettingsInputProps, 'type' | 'autoComplete' | 'placeholder'> {
  /** From `secretFieldStrings(...).placeholder` — the「保留现有…」label when configured. */
  placeholder: string
}

export function SettingsSecretInput({ maxLength = 512, ...props }: SettingsSecretInputProps) {
  return <SettingsInput type="password" autoComplete="new-password" maxLength={maxLength} {...props} />
}

// `fromState` helper: `{ ...secretFieldPatch(state.apiKey, 'apiKey') }` is the
// whole secret-field write path. Empty/whitespace input returns `{}` (the key
// is omitted from the patch and the stored secret survives); any other input
// returns `{ [fieldName]: trimmed }`.
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

// Hint + placeholder for a secret field's `SettingsRow`. The configured-state
// wording is fixed by the pattern; the card supplies only the mask, the
//「保留现有…」label, and the empty-state strings.
export function secretFieldStrings({ mask, keepLabel, emptyHint, emptyPlaceholder }: SecretFieldStringsOptions): {
  hint: string
  placeholder: string
} {
  if (mask !== null) {
    return { hint: `当前已配置（结尾 …${mask}）。留空保存表示${keepLabel}。`, placeholder: keepLabel }
  }
  return { hint: emptyHint, placeholder: emptyPlaceholder }
}
