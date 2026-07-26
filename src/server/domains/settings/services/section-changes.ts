import type { Pool } from 'pg'

import type { SettingsSection } from '@/shared/config/sections'

import { rescheduleArchive } from '@/server/domains/audit/services/scheduler'
import { rescheduleBackup } from '@/server/domains/backup/scheduler'
import { invalidateMailTransportCache } from '@/server/infra/email/sender'

export type SectionChangeHandler = (pool: Pool) => void | Promise<void>

// Side effects that run after a settings section is persisted. Every
// handler is imported explicitly in one place so activation never
// depends on import order (self-registration at module scope silently
// dropped handlers whose producer module wasn't loaded yet). The
// direction is one-way (settings → backup/audit/infra); the producers
// must not import back into the settings service.
export const SECTION_CHANGE_HANDLERS: ReadonlyMap<SettingsSection, SectionChangeHandler> = Object.freeze(
  new Map<SettingsSection, SectionChangeHandler>([
    ['backup', rescheduleBackup],
    ['limits', rescheduleArchive],
    ['mail', invalidateMailTransportCache],
  ]),
)
