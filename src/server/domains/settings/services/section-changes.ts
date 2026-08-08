import type { SettingsSection } from '@/shared/config/sections'

export type SectionChangeHandler = () => void | Promise<void>

// Side effects that run after a settings section is persisted. Inert on
// import: the bootstrap composition root registers the real handlers;
// producers never import back.
const handlers = new Map<SettingsSection, SectionChangeHandler>()

/** Composition-root wiring; re-registration replaces, like the other wire seams. */
export function registerSectionChangeHandler(section: SettingsSection, handler: SectionChangeHandler): void {
  handlers.set(section, handler)
}

/** The handler for a persisted section; undefined when none is registered (e.g. tests that never boot the composition root). */
export function sectionChangeHandler(section: SettingsSection): SectionChangeHandler | undefined {
  return handlers.get(section)
}

/** Test seam: drop all registrations between cases. */
export function __clearSectionChangeHandlersForTests(): void {
  handlers.clear()
}
