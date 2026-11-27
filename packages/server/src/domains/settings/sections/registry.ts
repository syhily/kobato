import type { SettingsSection } from '@kobato/settings/sections'
import type { SectionMeta } from '@kobato/settings/sections/registry'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { observabilityWriteSchema } from '@kobato/server/domains/settings/sections/observability'
import { DomainError } from '@kobato/server/infra/http/errors'
import { SETTINGS_SECTIONS } from '@kobato/settings/sections'
import { SECTION_REGISTRY as SHARED_SECTION_REGISTRY } from '@kobato/settings/sections/registry'

export const SECTION_REGISTRY = SHARED_SECTION_REGISTRY

export function sectionWriteSchema(section: SettingsSection, meta: SectionMeta) {
  if (section === 'observability') {
    return observabilityWriteSchema
  }
  return meta.writeSchema ?? meta.schema
}

export function validateSectionDefaults(meta: SectionMeta): Record<string, unknown> {
  const check = meta.schema.safeParse(meta.defaults)
  if (!check.success) {
    const first = check.error.issues[0]
    const path = first ? first.path.join('.') : '<unknown>'
    throw new DomainError(
      'INTERNAL',
      `${meta.scope} defaults invalid at \`${path}\`: ${first?.message ?? 'unknown reason'}`,
    )
  }
  return unsafeCast<Record<string, unknown>>(check.data)
}

export function buildDefaultSectionPayloads(): {
  section: SettingsSection
  payload: Record<string, unknown>
}[] {
  const out: { section: SettingsSection; payload: Record<string, unknown> }[] = []
  for (const section of SETTINGS_SECTIONS) {
    const meta = SECTION_REGISTRY[section]
    if (meta.defaults === null) {
      continue
    }
    out.push({ section, payload: validateSectionDefaults(meta) })
  }
  return out
}
