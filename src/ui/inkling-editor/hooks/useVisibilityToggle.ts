import { $getNodeByKey, type LexicalEditor, type NodeKey } from 'lexical'

import type { CardConfig } from '@/ui/inkling-editor/context/InklingComposerContext'
import type { Visibility } from '@/ui/inkling-editor/nodes/base/utils/visibility'

import { GeneratedDecoratorNodeBase } from '@/ui/inkling-editor/nodes/base'
import {
  VISIBILITY_SETTINGS,
  getVisibilityOptions,
  parseVisibilityToToggles,
  serializeOptionsToVisibility,
  type VisibilityToggles,
  type VisibilityOption,
} from '@/ui/inkling-editor/utils/visibility'

export interface UseVisibilityToggleResult {
  isVisibilityEnabled: boolean
  visibilityData: VisibilityToggles
  visibilityOptions: VisibilityOption[]
  toggleVisibility: (type: string, key: string, value: boolean) => void
}

export const useVisibilityToggle = (
  editor: LexicalEditor,
  nodeKey: NodeKey,
  cardConfig: CardConfig,
): UseVisibilityToggleResult => {
  const isStripeEnabled = !!cardConfig?.stripeEnabled
  const visibilitySetting = cardConfig?.visibilitySettings ?? VISIBILITY_SETTINGS.WEB_AND_EMAIL
  const isVisibilityEnabled = visibilitySetting !== VISIBILITY_SETTINGS.NONE
  const showWeb =
    visibilitySetting === VISIBILITY_SETTINGS.WEB_AND_EMAIL || visibilitySetting === VISIBILITY_SETTINGS.WEB_ONLY
  const showEmail =
    visibilitySetting === VISIBILITY_SETTINGS.WEB_AND_EMAIL || visibilitySetting === VISIBILITY_SETTINGS.EMAIL_ONLY

  let currentVisibility: Visibility | undefined

  editor.getEditorState().read(() => {
    const htmlNode = $getNodeByKey(nodeKey)
    if (!htmlNode) {
      return
    }
    currentVisibility = (htmlNode as GeneratedDecoratorNodeBase).visibility as Visibility
  })

  const visibilityData = parseVisibilityToToggles(currentVisibility)
  const visibilityOptions = getVisibilityOptions(currentVisibility, { isStripeEnabled, showWeb, showEmail })

  return {
    isVisibilityEnabled,
    visibilityData,
    visibilityOptions,
    toggleVisibility: (type: string, key: string, value: boolean) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!node) {
          return
        }
        const newVisibilityOptions = structuredClone(
          getVisibilityOptions((node as GeneratedDecoratorNodeBase).visibility as Visibility, {
            isStripeEnabled,
            showWeb,
            showEmail,
          }),
        )
        const toggle = newVisibilityOptions.find((g) => g.key === type)?.toggles?.find((t) => t.key === key)
        if (!toggle) {
          return
        }

        toggle.checked = value
        const nodeWithVisibility = node as GeneratedDecoratorNodeBase & { visibility: Visibility }
        nodeWithVisibility.visibility = serializeOptionsToVisibility(
          newVisibilityOptions,
          nodeWithVisibility.visibility,
        )
      })
    },
  }
}
