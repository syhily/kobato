import type { RenderContext } from '@/nodes/base/render-context'

export function renderHorizontalRuleNode(_: unknown, context: RenderContext) {
  const document = context.createDocument()

  const element = document.createElement('hr')
  return { element, type: 'outer' as const }
}
