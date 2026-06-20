/**
 * Central place for editor runtime error reporting. Production builds may swap
 * this for a real telemetry sink; for now we keep the diagnostic console output
 * localized to this module.
 */
export function reportEditorError(error: Error, context?: string): void {
  // oxlint-disable-next-line no-console
  console.error(`Inkling editor error${context ? ` (${context})` : ''}:`, error)
}
