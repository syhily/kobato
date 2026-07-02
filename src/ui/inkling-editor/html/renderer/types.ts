import type { ExportDOMOptions } from '@/ui/inkling-editor/nodes/base'

export interface RendererOptions extends ExportDOMOptions {
  usedIdAttributes?: Record<string, number>
  renderData?: Map<number, unknown>
}
