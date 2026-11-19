import type { SettingsSection } from '@kobato/settings/sections.ts'

export type SectionChangeHandler = () => void | Promise<void>

const handlers = new Map<SettingsSection, SectionChangeHandler>()

export function registerSectionChangeHandler(section: SettingsSection, handler: SectionChangeHandler): void {
  handlers.set(section, handler)
}

export function sectionChangeHandler(section: SettingsSection): SectionChangeHandler | undefined {
  return handlers.get(section)
}

export function __clearSectionChangeHandlersForTests(): void {
  handlers.clear()
}
