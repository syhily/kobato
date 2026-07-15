import type { Pool } from 'pg'

import type { SettingsSection } from '@/shared/config/sections'

import { rescheduleArchive } from '@/server/domains/audit/services/scheduler'
import { rescheduleBackup } from '@/server/domains/backup/scheduler'
import { invalidateMailTransportCache } from '@/server/infra/email/sender'

export type SectionChangeHandler = (pool: Pool) => void | Promise<void>

// Side effects that run after a settings section is persisted.
//
// This wiring used to be split across two mechanisms: the 'mail' branch
// was hard-coded inside `updateBlogSettingsSection`, while backup and
// audit self-registered via `registerSectionChangeHandler(...)` executed
// as a module-level side effect at import time. Self-registration made
// activation depend on import order — a handler silently went missing
// when its producer module happened not to be loaded yet. Importing every
// handler explicitly in one place removes the import-order hazard and
// makes the full wiring auditable with a single read. The direction is
// one-way (settings → backup/audit/infra); the producers must not import
// back into the settings service.
export const SECTION_CHANGE_HANDLERS: ReadonlyMap<SettingsSection, SectionChangeHandler> = Object.freeze(
  new Map<SettingsSection, SectionChangeHandler>([
    ['backup', rescheduleBackup],
    ['limits', rescheduleArchive],
    ['mail', invalidateMailTransportCache],
  ]),
)
