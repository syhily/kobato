import type { SettingsSection } from '@kobato/shared/config/sections'

export type SectionChangeHandler = () => void | Promise<void>

// Side effects that run after a settings section is persisted. The
// registry is deliberately INERT on import: the bootstrap composition
// root registers the real handlers, so importing this module never
// pulls the backup scheduler / audit scheduler / mail sender into a
// consumer that only renders settings UI. Registration stays explicit
// and in one place — self-registration at producer module scope was
// rejected (import order silently dropped handlers whose producer
// module wasn't loaded yet). The direction is one-way (bootstrap →
// registry ← settings service); producers never import back.
const handlers = new Map<SettingsSection, SectionChangeHandler>()

/** Composition-root wiring (bootstrap at boot). Re-registration
 *  replaces, mirroring the other wire seams. */
export function registerSectionChangeHandler(section: SettingsSection, handler: SectionChangeHandler): void {
  handlers.set(section, handler)
}

/** The handler for a persisted section, or undefined when none is
 *  registered (e.g. tests that never boot the composition root). */
export function sectionChangeHandler(section: SettingsSection): SectionChangeHandler | undefined {
  return handlers.get(section)
}

/** Test seam: drop all registrations between cases. */
export function __clearSectionChangeHandlersForTests(): void {
  handlers.clear()
}
